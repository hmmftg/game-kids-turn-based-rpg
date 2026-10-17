/**
 * Offline model pipeline: source glTF/GLB → weld → optional texture strip →
 * meshopt simplify → prune → public/models/*.glb.
 *
 * Usage:
 *   node --experimental-strip-types scripts/convert-model.ts \
 *     <input.glb|gltf> <output.glb> [--ratio 0.4] [--error 0.01] [--flat 0.78,0.62,0.42] [--vcolor] [--unskin] [--no-anim]
 *
 * --flat strips every material texture and sets that baseColorFactor, for
 * sources whose look we reproduce with the shared-Lambert palette instead.
 * --vcolor bakes color into a COLOR_0 vertex attribute, drops every material
 * and joins each mesh to a single primitive — the shipped GLB then renders
 * through one shared vertex-color Lambert and costs exactly ONE geometry per
 * mesh (the tier's geometries ceiling is the binding budget, so prims-per-
 * file is the metric that matters). When the primitive's material carries a
 * baseColorTexture the bake samples it per-vertex at TEXCOORD_0 (sRGB→linear)
 * — that is how painted Sketchfab textures and KayKit palette textures keep
 * their colors; otherwise the flat baseColorFactor is baked.
 * --unskin bakes each skinned primitive through linear-blend skinning at the
 * file's authored pose (JOINTS/WEIGHTS + inverse bind matrices → static
 * positions), then drops the attributes and skins — rigged sources ship as
 * their authored rest pose. Some rigged sources scatter at bind pose because
 * their animation is what assembles the parts — `--pose <seconds>` evaluates
 * every animation channel at that time and writes the TRS onto the nodes
 * before the unskin bake. --no-anim disposes all animations (never played).
 * Prints triangle count, bounds, and output size so registry entries can be
 * filled in immediately.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { Matrix3, Matrix4, Vector3 } from 'three';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error(
    'usage: convert-model.ts <in.glb|gltf> <out.glb> [--ratio r] [--error e] [--flat r,g,b]',
  );
  process.exit(1);
}
const opt = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const ratio = Number(opt('ratio') ?? 0.4);
const error = Number(opt('error') ?? 0.01);
const flat = opt('flat')?.split(',').map(Number);
const vcolor = rest.includes('--vcolor');
const unskin = rest.includes('--unskin');
const noAnim = rest.includes('--no-anim');
const poseTime = opt('pose') !== undefined ? Number(opt('pose')) : null;
const brighten = opt('brighten') !== undefined ? Number(opt('brighten')) : 1;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

/** Decoded baseColor images, cached per texture for the per-vertex bake. */
interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}
const imageCache = new Map<Texture, DecodedImage>();
function decodeTexture(texture: Texture): DecodedImage | null {
  const cached = imageCache.get(texture);
  if (cached) return cached;
  const bytes = texture.getImage();
  let decoded: DecodedImage | null = null;
  if (!bytes) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const png = PNG.sync.read(Buffer.from(bytes));
    decoded = { width: png.width, height: png.height, data: png.data };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const jpg = decodeJpeg(bytes, { formatAsRGBA: true });
    decoded = { width: jpg.width, height: jpg.height, data: jpg.data };
  }
  if (decoded) imageCache.set(texture, decoded);
  return decoded;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Nearest-texel sample of a decoded image at wrapped UV → linear RGBA. */
function sampleTexture(
  image: DecodedImage,
  u: number,
  v: number,
): [number, number, number, number] {
  const x = Math.min(image.width - 1, Math.floor((u - Math.floor(u)) * image.width));
  const y = Math.min(image.height - 1, Math.floor((v - Math.floor(v)) * image.height));
  const i = (y * image.width + x) * 4;
  return [
    srgbToLinear(image.data[i]! / 255),
    srgbToLinear(image.data[i + 1]! / 255),
    srgbToLinear(image.data[i + 2]! / 255),
    image.data[i + 3]! / 255,
  ];
}

/** Evaluate every animation channel at `t` and write the result into each
 * target node's TRS — used by --pose before the unskin bake for models whose
 * bind pose is scattered and whose animation is what assembles them. */
function applyAnimationPose(d: typeof doc, t: number) {
  const key: number[] = [];
  const val: number[] = [];
  for (const animation of d.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const sampler = channel.getSampler();
      const node = channel.getTargetNode();
      const path = channel.getTargetPath();
      if (!sampler || !node || !path || path === 'weights') continue;
      const input = sampler.getInput();
      const output = sampler.getOutput();
      if (!input || !output) continue;
      const size = output.getElementSize();
      const count = input.getCount();
      let t0 = 0;
      let t1 = count - 1;
      input.getElement(0, key);
      const first = key[0]!;
      input.getElement(count - 1, key);
      const last = key[0]!;
      const tt = Math.max(first, Math.min(last, t));
      for (let i = 0; i < count - 1; i++) {
        input.getElement(i, key);
        const a = key[0]!;
        input.getElement(i + 1, key);
        if (tt >= a && tt <= key[0]!) {
          t0 = i;
          t1 = i + 1;
          break;
        }
      }
      input.getElement(t0, key);
      const a = key[0]!;
      input.getElement(t1, key);
      const span = key[0]! - a;
      const f = span > 0 ? (tt - a) / span : 0;
      const out = new Array<number>(size);
      for (let c = 0; c < size; c++) {
        output.getElement(t0, val);
        const va = val[c]!;
        output.getElement(t1, val);
        out[c] = va + (val[c]! - va) * f;
      }
      if (path === 'rotation' && size === 4) {
        const len = Math.hypot(out[0]!, out[1]!, out[2]!, out[3]!) || 1;
        node.setRotation([out[0]! / len, out[1]! / len, out[2]! / len, out[3]! / len]);
      } else if (path === 'translation' && size === 3) {
        node.setTranslation([out[0]!, out[1]!, out[2]!]);
      } else if (path === 'scale' && size === 3) {
        node.setScale([out[0]!, out[1]!, out[2]!]);
      }
    }
  }
}

/** True when any source material was doubleSided — the shipped component
 * then needs VERTEX_LAMBERT_DS instead of the default single-sided one. */
const sourceDoubleSided = root.listMaterials().some((m) => m.getDoubleSided());

await doc.transform(
  ...(poseTime !== null ? [(d: typeof doc) => applyAnimationPose(d, poseTime)] : []),
  ...(unskin
    ? [
        (d: typeof doc) => {
          // Bake LBS at the authored pose: skinned POSITION/NORMAL attributes
          // live in joint-bind space, so dropping the skin alone leaves
          // scattered parts. Vertex' = Σ w·(worldJoint · IBM) · v, expressed
          // back in the skinned node's local space so flatten() still applies
          // its transform exactly once.
          for (const node of d.getRoot().listNodes()) {
            const skin = node.getSkin();
            const mesh = node.getMesh();
            if (!skin || !mesh) continue;
            const joints = skin.listJoints();
            const ibm = skin.getInverseBindMatrices();
            if (!ibm) continue;
            const skinMats = joints.map((joint, i) =>
              new Matrix4()
                .fromArray(joint.getWorldMatrix() as unknown as number[])
                .multiply(new Matrix4().fromArray(ibm.getElement(i, []))),
            );
            const skinNorms = skinMats.map((m) => new Matrix3().setFromMatrix4(m));
            const toLocal = new Matrix4()
              .fromArray(node.getWorldMatrix() as unknown as number[])
              .invert();
            const toLocalNorm = new Matrix3().setFromMatrix4(toLocal);
            for (const prim of mesh.listPrimitives()) {
              const pos = prim.getAttribute('POSITION');
              const jAttr = prim.getAttribute('JOINTS_0');
              const wAttr = prim.getAttribute('WEIGHTS_0');
              if (!pos || !jAttr || !wAttr) continue;
              const nrm = prim.getAttribute('NORMAL');
              const v = new Vector3();
              const n = new Vector3();
              const acc = new Vector3();
              const accN = new Vector3();
              const tmp = new Vector3();
              const jEl: number[] = [];
              const wEl: number[] = [];
              const vEl: number[] = [];
              const nEl: number[] = [];
              for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, vEl);
                v.fromArray(vEl);
                jAttr.getElement(i, jEl);
                wAttr.getElement(i, wEl);
                let wSum = 0;
                acc.set(0, 0, 0);
                accN.set(0, 0, 0);
                if (nrm) {
                  nrm.getElement(i, nEl);
                  n.fromArray(nEl);
                }
                for (let k = 0; k < jEl.length; k++) {
                  const w = wEl[k] ?? 0;
                  const j = jEl[k];
                  if (!w || j === undefined || !skinMats[j]) continue;
                  wSum += w;
                  tmp.copy(v).applyMatrix4(skinMats[j]!);
                  acc.addScaledVector(tmp, w);
                  tmp.copy(n).applyMatrix3(skinNorms[j]!);
                  accN.addScaledVector(tmp, w);
                }
                if (wSum > 0) {
                  acc.divideScalar(wSum);
                  accN.divideScalar(wSum);
                }
                acc.applyMatrix4(toLocal);
                pos.setElement(i, acc.toArray() as never);
                if (nrm) {
                  accN.applyMatrix3(toLocalNorm).normalize();
                  nrm.setElement(i, accN.toArray() as never);
                }
              }
            }
            node.setSkin(null);
          }
          for (const mesh of d.getRoot().listMeshes())
            for (const prim of mesh.listPrimitives()) {
              prim.setAttribute('JOINTS_0', null);
              prim.setAttribute('WEIGHTS_0', null);
            }
          for (const skin of d.getRoot().listSkins()) skin.dispose();
        },
      ]
    : []),
  ...(noAnim
    ? [
        (d: typeof doc) => {
          for (const animation of d.getRoot().listAnimations()) animation.dispose();
          // Morph targets are animation payload too (e.g. the koi's 150-frame
          // swim) — a static export keeps none of them.
          for (const mesh of d.getRoot().listMeshes())
            for (const prim of mesh.listPrimitives())
              for (const target of prim.listTargets()) target.dispose();
        },
      ]
    : []),
  flatten(),
  ...(flat
    ? [
        (d: typeof doc) => {
          for (const material of d.getRoot().listMaterials()) {
            material.setBaseColorTexture(null);
            material.setBaseColorFactor([flat[0]!, flat[1]!, flat[2]!, 1]);
          }
          for (const texture of d.getRoot().listTextures()) texture.dispose();
        },
      ]
    : []),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error }),
  ...(vcolor
    ? [
        (d: typeof doc) => {
          for (const mesh of d.getRoot().listMeshes()) {
            for (const prim of mesh.listPrimitives()) {
              const material = prim.getMaterial();
              const count = prim.getAttribute('POSITION')!.getCount();
              const colors = new Float32Array(count * 4);
              const texture = material?.getBaseColorTexture();
              const image = texture ? decodeTexture(texture) : null;
              const emissiveTexture = material?.getEmissiveTexture();
              const emissiveImage = emissiveTexture ? decodeTexture(emissiveTexture) : null;
              const emissiveFactor = material?.getEmissiveFactor() ?? [0, 0, 0];
              const uvs = image || emissiveImage ? prim.getAttribute('TEXCOORD_0') : null;
              if ((image || emissiveImage) && uvs) {
                // Painted/palette texture → per-vertex sample at TEXCOORD_0.
                // glTF emissive is additive, so fire/glow looks that store
                // their color in the emissive map still bake correctly.
                const uv: [number, number] = [0, 0];
                for (let i = 0; i < count; i++) {
                  uvs.getElement(i, uv);
                  const rgba: [number, number, number, number] = image
                    ? sampleTexture(image, uv[0], uv[1])
                    : [1, 1, 1, 1];
                  const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
                  rgba[0] *= factor[0]!;
                  rgba[1] *= factor[1]!;
                  rgba[2] *= factor[2]!;
                  if (emissiveImage) {
                    const glow = sampleTexture(emissiveImage, uv[0], uv[1]);
                    rgba[0] = Math.min(1, rgba[0] + glow[0] * emissiveFactor[0]!);
                    rgba[1] = Math.min(1, rgba[1] + glow[1] * emissiveFactor[1]!);
                    rgba[2] = Math.min(1, rgba[2] + glow[2] * emissiveFactor[2]!);
                  }
                  if (brighten !== 1) {
                    rgba[0] = Math.min(1, rgba[0] * brighten);
                    rgba[1] = Math.min(1, rgba[1] * brighten);
                    rgba[2] = Math.min(1, rgba[2] * brighten);
                  }
                  colors.set(rgba, i * 4);
                }
              } else {
                const rgba = (material?.getBaseColorFactor() ?? [1, 1, 1, 1]).map((c, i) =>
                  i < 3 ? Math.min(1, c * brighten) : c,
                );
                for (let i = 0; i < count; i++) colors.set(rgba, i * 4);
              }
              prim.setAttribute('COLOR_0', d.createAccessor().setType('VEC4').setArray(colors));
              prim.setMaterial(null);
              // Materials are gone — their coordinate/tangent channels are
              // dead weight now (prune won't drop live prim attributes).
              for (const sem of prim.listSemantics())
                if (sem.startsWith('TEXCOORD') || sem === 'TANGENT') prim.setAttribute(sem, null);
            }
          }
        },
        join(),
      ]
    : []),
  dedup(),
  prune(),
);

await io.write(output, doc);

let triangles = 0;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    triangles += (prim.getIndices()?.getCount() ?? 0) / 3;
    const pos = prim.getAttribute('POSITION');
    const pmin = pos?.getMinNormalized([]);
    const pmax = pos?.getMaxNormalized([]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, pmin?.[i] ?? 0);
      max[i] = Math.max(max[i]!, pmax?.[i] ?? 0);
    }
  }
}
const bytes = readFileSync(output);
console.log(
  JSON.stringify({
    output,
    triangles: Math.round(triangles),
    bounds: { min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)) },
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materials: root.listMaterials().length,
    meshes: root.listMeshes().length,
    doubleSided: sourceDoubleSided,
  }),
);
writeFileSync(output, bytes);
