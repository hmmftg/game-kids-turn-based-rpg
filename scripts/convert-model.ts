/**
 * Offline model pipeline: source glTF/GLB → weld → optional texture strip →
 * meshopt simplify → prune → public/models/*.glb.
 *
 * Usage:
 *   node --experimental-strip-types scripts/convert-model.ts \
 *     <input.glb|gltf> <output.glb> [--ratio 0.4] [--error 0.01] [--flat 0.78,0.62,0.42]
 *
 * --flat strips every material texture and sets that baseColorFactor, for
 * sources whose look we reproduce with the shared-Lambert palette instead.
 * Prints triangle count, bounds, and output size so registry entries can be
 * filled in immediately.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, prune, simplify, weld } from '@gltf-transform/functions';
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
