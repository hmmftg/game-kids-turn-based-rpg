import assert from 'node:assert/strict';
import { log } from 'node:console';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'waypoint-rpg-creator');
assert.equal(manifest.type, 'module');
assert.equal(manifest.engines.node, '>=22.0.0');
assert.equal(manifest.private, true);
assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './model-import']);
for (const file of ['src/index.mjs', 'src/model-import.mjs', 'src/cli.mjs', 'types/index.d.ts']) {
  await readFile(join(root, file));
}
const sourceFiles = await readdir(join(root, 'src'));
assert.ok(sourceFiles.every((file) => !file.includes('scene-demo')));
const importer = await readFile(join(root, 'src/model-import.mjs'), 'utf8');
assert.doesNotMatch(importer, /examples\/scene-demo|src\/framework|src\/domain/);
log('creator package: ESM roots, Node floor, public files, and source boundaries passed');
