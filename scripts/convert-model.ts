/**
 * Offline model pipeline: source glTF/GLB → weld → optional texture strip →
 * meshopt simplify → prune → public/models/*.glb.
 *
 * Usage:
 *   node --experimental-strip-types scripts/convert-model.ts \
 *     <input.glb|gltf> <output.glb> [--ratio 0.4] [--error 0.01] [--flat 0.78,0.62,0.42] [--vcolor]
 *
 * --flat strips every material texture and sets that baseColorFactor, for
 * sources whose look we reproduce with the shared-Lambert palette instead.
 * --vcolor bakes each primitive's baseColorFactor into a COLOR_0 vertex
 * attribute, drops every material and joins each mesh to a single primitive —
 * the shipped GLB then renders through one shared vertex-color Lambert and
 * costs exactly ONE geometry per mesh (the tier's geometries ceiling is the
 * binding budget, so prims-per-file is the metric that matters).
 * Prints triangle count, bounds, and output size so registry entries can be
 * filled in immediately.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('usage: convert-model.ts <in.glb|gltf> <out.glb> [--ratio r] [--error e] [--flat r,g,b]');
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

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

await doc.transform(
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
              const rgba = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
              const count = prim.getAttribute('POSITION')!.getCount();
              const colors = new Float32Array(count * 4);
              for (let i = 0; i < count; i++) colors.set(rgba, i * 4);
              prim.setAttribute(
                'COLOR_0',
                d.createAccessor().setType('VEC4').setArray(colors),
              );
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
