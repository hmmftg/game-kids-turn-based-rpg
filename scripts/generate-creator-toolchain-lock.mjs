import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolchainPath = join(repositoryRoot, 'tools/creator/templates/single-scene/toolchain.json');
const templateLockPath = join(
  repositoryRoot,
  'tools/creator/templates/single-scene/toolchain-lock.json',
);
const toolchain = JSON.parse(await readFile(toolchainPath, 'utf8'));
const lock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));
const rootPackages = lock.packages;
const selected = new Set();
const queue = [];

function resolvePackageKey(name, ownerKey = '') {
  let directory = ownerKey;
  while (true) {
    const candidate = directory ? `${directory}/node_modules/${name}` : `node_modules/${name}`;
    if (rootPackages[candidate]) return candidate;
    if (!directory) return null;
    const separator = directory.lastIndexOf('/');
    directory = separator < 0 ? '' : directory.slice(0, separator);
  }
}

function enqueueDependency(name, ownerKey = '') {
  const key = resolvePackageKey(name, ownerKey);
  assert.ok(
    key,
    `Missing locked template toolchain package: ${name} (from ${ownerKey || 'root'}).`,
  );
  const entry = rootPackages[key];
  assert.ok(!entry.link, `Template toolchain must not depend on workspace link ${key}.`);
  if (!selected.has(key)) {
    selected.add(key);
    queue.push(key);
  }
}

for (const name of [
  ...Object.keys(toolchain.dependencies),
  ...Object.keys(toolchain.devDependencies),
]) {
  const key = resolvePackageKey(name);
  assert.ok(key, `Missing direct toolchain package in the root lock: ${name}.`);
  const expectedVersion = toolchain.dependencies[name] ?? toolchain.devDependencies[name];
  assert.equal(
    rootPackages[key].version,
    expectedVersion,
    `Update toolchain.json or root lock for ${name}.`,
  );
  enqueueDependency(name);
}

while (queue.length > 0) {
  const ownerKey = queue.shift();
  const entry = rootPackages[ownerKey];
  for (const name of Object.keys(entry.dependencies ?? {})) enqueueDependency(name, ownerKey);
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    const key = resolvePackageKey(name, ownerKey);
    if (key) enqueueDependency(name, ownerKey);
  }
  for (const name of Object.keys(entry.peerDependencies ?? {})) {
    const key = resolvePackageKey(name, ownerKey);
    if (key) enqueueDependency(name, ownerKey);
  }
}

const packages = Object.fromEntries([...selected].sort().map((key) => [key, rootPackages[key]]));
const templateLock = { lockfileVersion: 3, requires: true, packages };
await writeFile(templateLockPath, `${JSON.stringify(templateLock, null, 2)}\n`);
console.log(`Generated game template lock for ${selected.size} registry packages.`);
