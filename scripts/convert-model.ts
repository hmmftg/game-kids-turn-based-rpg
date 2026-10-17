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
 * --unskin drops JOINTS_0/WEIGHTS_0 and every skin so rigged sources ship as
 * their authored rest pose. --no-anim disposes all animations (never played).
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

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Nearest-texel sample of a decoded image at wrapped UV → linear RGBA. */
function sampleTexture(image: DecodedImage, u: number, v: number): [number, number, number, number] {
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

await doc.transform(
  ...(unskin
    ? [
        (d: typeof doc) => {
          for (const node of d.getRoot().listNodes()) node.setSkin(null);
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
              const uvs = image ? prim.getAttribute('TEXCOORD_0') : null;
              if (image && uvs) {
                // Painted/palette texture → per-vertex sample at TEXCOORD_0.
                const uv: [number, number] = [0, 0];
                for (let i = 0; i < count; i++) {
                  uvs.getElement(i, uv);
                  colors.set(sampleTexture(image, uv[0], uv[1]), i * 4);
                }
              } else {
                const rgba = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
                for (let i = 0; i < count; i++) colors.set(rgba, i * 4);
              }
              prim.setAttribute('COLOR_0', d.createAccessor().setType('VEC4').setArray(colors));
              prim.setMaterial(null);
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
  }),
);
writeFileSync(output, bytes);
