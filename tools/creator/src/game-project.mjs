import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { validateAssetCatalog } from './asset-catalog.mjs';

export const GAME_PROJECT_SCHEMA_VERSION = 1;
export const GAME_PROJECT_FILE = 'game.project.json';
export const FRAMEWORK_PACKAGE_ROOTS = Object.freeze([
  'waypoint-rpg-core',
  'waypoint-rpg-narrative',
  'waypoint-rpg-gameplay',
]);

const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ACTIONS = Object.freeze(['dev', 'build', 'test', 'preview', 'capture']);
const MAX_FRAMEWORK_TARBALL_BYTES = 32 * 1024 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const TEMPLATE_ROOT = fileURLToPath(new URL('../templates/single-scene/', import.meta.url));
function diagnostic(code, path, message) {
  return { code, path, message };
}

function inspectJson(value, path, issues, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      issues.push(diagnostic('non-finite-number', path, 'JSON numbers must be finite.'));
    return;
  }
  if (typeof value !== 'object') {
    issues.push(diagnostic('non-json-value', path, 'Manifest values must be plain JSON data.'));
    return;
  }
  if (ancestors.has(value)) {
    issues.push(diagnostic('cyclic-value', path, 'Manifest values must not contain cycles.'));
    return;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key)))
        issues.push(
          diagnostic('non-json-array-property', path, 'Arrays may contain only indexed items.'),
        );
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        issues.push(
          diagnostic('sparse-array', `${path}[${index}]`, 'Sparse arrays are not valid JSON.'),
        );
        continue;
      }
      inspectJson(value[index], `${path}[${index}]`, issues, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    issues.push(
      diagnostic('non-plain-object', path, 'Manifest objects must use a plain JSON prototype.'),
    );
    ancestors.delete(value);
    return;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      issues.push(diagnostic('non-json-key', path, 'Manifest object keys must be strings.'));
      continue;
    }
    if (UNSAFE_KEYS.has(key))
      issues.push(diagnostic('unsafe-key', `${path}.${key}`, 'Unsafe object key.'));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      issues.push(
        diagnostic(
          'non-data-property',
          `${path}.${key}`,
          'Manifest properties must be enumerable data values.',
        ),
      );
      continue;
    }
    inspectJson(descriptor.value, `${path}.${key}`, issues, ancestors);
  }
  ancestors.delete(value);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableId(value) {
  return typeof value === 'string' && GAME_ID.test(value);
}

function isRelativeProjectPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[a-z]:/iu.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function addPathDiagnostic(issues, value, path) {
  if (!isRelativeProjectPath(value))
    issues.push(
      diagnostic(
        'invalid-path',
        path,
        'Use a normalized project-relative path with forward slashes.',
      ),
    );
}

function addStringDiagnostic(issues, value, path) {
  if (typeof value !== 'string' || value.trim() === '')
    issues.push(diagnostic('required-string', path, 'A non-empty string is required.'));
}

function addUniqueIds(issues, entries, path) {
  if (!Array.isArray(entries)) {
    issues.push(diagnostic('expected-array', path, 'Expected an array.'));
    return;
  }
  const seen = new Set();
  entries.forEach((entry, index) => {
    if (!isRecord(entry) || !isStableId(entry.id)) {
      issues.push(
        diagnostic(
          'invalid-id',
          `${path}[${index}].id`,
          'Expected a stable lowercase kebab-case ID.',
        ),
      );
      return;
    }
    if (seen.has(entry.id))
      issues.push(diagnostic('duplicate-id', `${path}[${index}].id`, `Duplicate ID: ${entry.id}.`));
    seen.add(entry.id);
  });
}

export function validateGameProjectManifest(value) {
  const issues = [];
  inspectJson(value, '$', issues);
  if (issues.length > 0) return { ok: false, diagnostics: issues };
  if (!isRecord(value))
    return {
      ok: false,
      diagnostics: [diagnostic('expected-object', '$', 'Manifest must be a JSON object.')],
    };

  if (value.schemaVersion !== GAME_PROJECT_SCHEMA_VERSION)
    issues.push(
      diagnostic(
        'unsupported-schema',
        '$.schemaVersion',
        `Supported game-project schema version is ${GAME_PROJECT_SCHEMA_VERSION}.`,
      ),
    );

  const game = value.game;
  if (!isRecord(game))
    issues.push(diagnostic('expected-object', '$.game', 'Game metadata is required.'));
  else {
    if (!isStableId(game.id))
      issues.push(
        diagnostic('invalid-id', '$.game.id', 'Expected a stable lowercase kebab-case game ID.'),
      );
    addStringDiagnostic(issues, game.version, '$.game.version');
    if (
      typeof game.version === 'string' &&
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(game.version)
    )
      issues.push(
        diagnostic('invalid-version', '$.game.version', 'Use a semantic version such as 0.1.0.'),
      );
    addStringDiagnostic(issues, game.displayName, '$.game.displayName');
    if (
      !Array.isArray(game.supportedLocales) ||
      game.supportedLocales.length === 0 ||
      game.supportedLocales.some(
        (locale) =>
          typeof locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale),
      )
    )
      issues.push(
        diagnostic(
          'invalid-locales',
          '$.game.supportedLocales',
          'Declare one or more valid locale tags.',
        ),
      );
    else if (!game.supportedLocales.includes(game.defaultLocale))
      issues.push(
        diagnostic(
          'unknown-default-locale',
          '$.game.defaultLocale',
          'Default locale must be included in supportedLocales.',
        ),
      );
  }

  const packages = value.frameworkPackages;
  if (!Array.isArray(packages) || !packages.includes('waypoint-rpg-core'))
    issues.push(
      diagnostic('core-package-required', '$.frameworkPackages', 'waypoint-rpg-core is required.'),
    );
  else {
    const seen = new Set();
    for (const [index, packageRoot] of packages.entries()) {
      if (!FRAMEWORK_PACKAGE_ROOTS.includes(packageRoot))
        issues.push(
          diagnostic(
            'unsupported-package',
            `$.frameworkPackages[${index}]`,
            `Unsupported package root: ${String(packageRoot)}.`,
          ),
        );
      if (seen.has(packageRoot))
        issues.push(
          diagnostic(
            'duplicate-package',
            `$.frameworkPackages[${index}]`,
            `Duplicate package root: ${packageRoot}.`,
          ),
        );
      seen.add(packageRoot);
    }
  }

  addUniqueIds(issues, value.scenes, '$.scenes');
  if (Array.isArray(value.scenes)) {
    value.scenes.forEach((scene, index) => {
      if (!isRecord(scene)) return;
      if (!isStableId(scene.mapId))
        issues.push(
          diagnostic('invalid-id', `$.scenes[${index}].mapId`, 'Expected a stable map ID.'),
        );
      if (!isStableId(scene.startAnchorId))
        issues.push(
          diagnostic(
            'invalid-id',
            `$.scenes[${index}].startAnchorId`,
            'Expected a stable starting anchor ID.',
          ),
        );
      addPathDiagnostic(
        issues,
        scene.worldDefinitionPath,
        `$.scenes[${index}].worldDefinitionPath`,
      );
    });
  }
  const start = value.start;
  if (!isRecord(start))
    issues.push(
      diagnostic('expected-object', '$.start', 'Starting scene, map, and anchor are required.'),
    );
  else {
    const scene = Array.isArray(value.scenes)
      ? value.scenes.find((entry) => isRecord(entry) && entry.id === start.sceneId)
      : undefined;
    if (!scene)
      issues.push(
        diagnostic(
          'unknown-start-scene',
          '$.start.sceneId',
          'Starting scene must reference a declared scene.',
        ),
      );
    else if (scene.mapId !== start.mapId || scene.startAnchorId !== start.anchorId)
      issues.push(
        diagnostic(
          'start-location-mismatch',
          '$.start',
          'Starting map and anchor must match the selected scene declaration.',
        ),
      );
  }

  const assets = value.assets;
  if (!isRecord(assets))
    issues.push(
      diagnostic('expected-object', '$.assets', 'Asset catalog and record paths are required.'),
    );
  else {
    addPathDiagnostic(issues, assets.catalogPath, '$.assets.catalogPath');
    addPathDiagnostic(issues, assets.assetRecordsPath, '$.assets.assetRecordsPath');
    if (!Array.isArray(assets.references))
      issues.push(
        diagnostic('expected-array', '$.assets.references', 'Asset references must be an array.'),
      );
    else {
      const ids = new Set();
      assets.references.forEach((reference, index) => {
        const path = `$.assets.references[${index}]`;
        if (!isRecord(reference)) return;
        if (!isStableId(reference.assetId))
          issues.push(diagnostic('invalid-id', `${path}.assetId`, 'Expected a stable asset ID.'));
        else if (ids.has(reference.assetId))
          issues.push(
            diagnostic(
              'duplicate-asset',
              `${path}.assetId`,
              `Duplicate asset reference: ${reference.assetId}.`,
            ),
          );
        ids.add(reference.assetId);
        if (!['shared', 'game-local'].includes(reference.source))
          issues.push(
            diagnostic(
              'invalid-asset-source',
              `${path}.source`,
              'Asset source must be shared or game-local.',
            ),
          );
        addPathDiagnostic(issues, reference.runtimePath, `${path}.runtimePath`);
      });
    }
  }

  const content = value.content;
  if (!isRecord(content))
    issues.push(diagnostic('expected-object', '$.content', 'Content references are required.'));
  else {
    if (!Array.isArray(content.characterDefinitionPaths))
      issues.push(
        diagnostic(
          'expected-array',
          '$.content.characterDefinitionPaths',
          'Character definition paths must be an array.',
        ),
      );
    else
      content.characterDefinitionPaths.forEach((path, index) =>
        addPathDiagnostic(issues, path, `$.content.characterDefinitionPaths[${index}]`),
      );
    for (const field of [
      'narrativeDefinitionPath',
      'gameplayDefinitionPath',
      'animationMappingPath',
    ])
      if (content[field] !== null && content[field] !== undefined)
        addPathDiagnostic(issues, content[field], `$.content.${field}`);
    if (content.timelineDefinitionPaths !== undefined) {
      if (!Array.isArray(content.timelineDefinitionPaths))
        issues.push(
          diagnostic(
            'expected-array',
            '$.content.timelineDefinitionPaths',
            'Timeline reference must be an array.',
          ),
        );
      else if (content.timelineDefinitionPaths.length > 0)
        issues.push(
          diagnostic(
            'timeline-runtime-deferred',
            '$.content.timelineDefinitionPaths',
            'Timeline authoring is deferred until the runtime timeline API is verified.',
          ),
        );
    }
    if (
      content.narrativeDefinitionPath &&
      (!Array.isArray(packages) || !packages.includes('waypoint-rpg-narrative'))
    )
      issues.push(
        diagnostic(
          'module-not-installed',
          '$.content.narrativeDefinitionPath',
          'Add waypoint-rpg-narrative to frameworkPackages before referencing narrative content.',
        ),
      );
    if (
      content.gameplayDefinitionPath &&
      (!Array.isArray(packages) || !packages.includes('waypoint-rpg-gameplay'))
    )
      issues.push(
        diagnostic(
          'module-not-installed',
          '$.content.gameplayDefinitionPath',
          'Add waypoint-rpg-gameplay to frameworkPackages before referencing gameplay content.',
        ),
      );
  }

  const accessibility = value.accessibility;
  if (!isRecord(accessibility))
    issues.push(
      diagnostic('expected-object', '$.accessibility', 'Accessibility configuration is required.'),
    );
  else {
    if (!['ltr', 'rtl', 'auto'].includes(accessibility.direction))
      issues.push(
        diagnostic(
          'invalid-direction',
          '$.accessibility.direction',
          'Direction must be ltr, rtl, or auto.',
        ),
      );
    if (accessibility.reducedMotion !== 'respect')
      issues.push(
        diagnostic(
          'reduced-motion-required',
          '$.accessibility.reducedMotion',
          'Projects must respect the operating-system reduced-motion preference.',
        ),
      );
    if (accessibility.keyboard !== true || accessibility.touch !== true)
      issues.push(
        diagnostic(
          'input-accessibility-required',
          '$.accessibility',
          'Keyboard and touch input must both remain available.',
        ),
      );
  }

  const save = value.save;
  if (!isRecord(save))
    issues.push(
      diagnostic('expected-object', '$.save', 'Save namespace and schema version are required.'),
    );
  else {
    if (!isStableId(save.namespace))
      issues.push(
        diagnostic(
          'invalid-id',
          '$.save.namespace',
          'Save namespace must be a stable lowercase kebab-case ID.',
        ),
      );
    if (!Number.isSafeInteger(save.schemaVersion) || save.schemaVersion < 1)
      issues.push(
        diagnostic(
          'invalid-save-version',
          '$.save.schemaVersion',
          'Save schema version must be a positive safe integer.',
        ),
      );
    if (
      !Array.isArray(save.compatibleSchemaVersions) ||
      save.compatibleSchemaVersions.some((version) => !Number.isSafeInteger(version) || version < 1)
    )
      issues.push(
        diagnostic(
          'invalid-compatible-versions',
          '$.save.compatibleSchemaVersions',
          'Compatible schema versions must be positive safe integers.',
        ),
      );
  }

  const commands = value.commands;
  if (!isRecord(commands))
    issues.push(
      diagnostic(
        'expected-object',
        '$.commands',
        'Development and verification script names are required.',
      ),
    );
  else
    for (const action of ACTIONS) {
      if (typeof commands[action] !== 'string' || !/^[a-z0-9:_-]+$/u.test(commands[action]))
        issues.push(
          diagnostic(
            'invalid-command-name',
            `$.commands.${action}`,
            'Use an npm script name; shell command strings are not supported.',
          ),
        );
    }

  return { ok: issues.length === 0, diagnostics: issues };
}

export function createGameProjectManifest({
  id,
  displayName,
  frameworkPackages = ['waypoint-rpg-core'],
  supportedLocales = ['en'],
  defaultLocale = supportedLocales[0] ?? 'en',
}) {
  const scene = {
    id: 'scene-main',
    mapId: 'map-main',
    worldDefinitionPath: 'src/world.ts',
    startAnchorId: 'anchor-spawn',
  };
  return {
    schemaVersion: GAME_PROJECT_SCHEMA_VERSION,
    game: { id, version: '0.1.0', displayName, supportedLocales, defaultLocale },
    frameworkPackages: [...frameworkPackages],
    scenes: [scene],
    start: { sceneId: scene.id, mapId: scene.mapId, anchorId: scene.startAnchorId },
    assets: {
      catalogPath: 'assets/catalog.json',
      assetRecordsPath: 'assets/asset-records.json',
      references: [],
    },
    content: {
      characterDefinitionPaths: ['src/content/characters.ts'],
      narrativeDefinitionPath: null,
      gameplayDefinitionPath: null,
      animationMappingPath: 'src/content/animations.json',
      timelineDefinitionPaths: [],
    },
    accessibility: { direction: 'auto', reducedMotion: 'respect', keyboard: true, touch: true },
    save: { namespace: id, schemaVersion: 1, compatibleSchemaVersions: [] },
    commands: { dev: 'dev', build: 'build', test: 'test', preview: 'preview', capture: 'capture' },
  };
}

export async function readGameProjectManifest(projectRoot) {
  const manifestPath = resolve(projectRoot, GAME_PROJECT_FILE);
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function isWithin(root, path) {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function readFrameworkPackageMetadata(bytes, expectedName) {
  if (bytes.byteLength > MAX_FRAMEWORK_TARBALL_BYTES)
    throw new Error(
      `Framework package archive exceeds the ${MAX_FRAMEWORK_TARBALL_BYTES / 1024 / 1024} MiB limit.`,
    );
  const tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.byteLength;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const readField = (start, length) =>
      tar
        .subarray(offset + start, offset + start + length)
        .toString('utf8')
        .replace(/\0.*$/su, '');
    const name = readField(0, 100);
    const prefix = readField(345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeText = readField(124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.byteLength)
      throw new Error('Framework archive contains a malformed tar entry.');
    if (path === 'package/package.json') {
      const manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'));
      if (manifest.name !== expectedName || typeof manifest.version !== 'string')
        throw new Error(
          `Expected archive package ${expectedName}, received ${String(manifest.name)}.`,
        );
      return { name: manifest.name, version: manifest.version };
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Framework archive has no package/package.json for ${expectedName}.`);
}

async function resolveProjectFile(projectRoot, relativePath) {
  if (!isRelativeProjectPath(relativePath))
    throw new Error(`Invalid project-relative path: ${String(relativePath)}.`);
  const root = await realpath(projectRoot);
  const candidate = resolve(root, ...relativePath.split('/'));
  if (!isWithin(root, candidate))
    throw new Error(`Project path escapes the game directory: ${relativePath}.`);
  const actual = await realpath(candidate);
  if (!isWithin(root, actual))
    throw new Error(`Project path resolves outside the game directory: ${relativePath}.`);
  const info = await stat(actual);
  if (!info.isFile()) throw new Error(`Project reference is not a file: ${relativePath}.`);
  return actual;
}

export async function validateGameProject(projectRoot) {
  const diagnostics = [];
  let manifest;
  try {
    manifest = await readGameProjectManifest(projectRoot);
  } catch (error) {
    return {
      ok: false,
      manifest: null,
      diagnostics: [
        diagnostic(
          'manifest-read-failed',
          GAME_PROJECT_FILE,
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }
  const manifestReport = validateGameProjectManifest(manifest);
  diagnostics.push(...manifestReport.diagnostics);
  if (!manifestReport.ok) return { ok: false, manifest, diagnostics };

  let root;
  try {
    root = await realpath(projectRoot);
  } catch (error) {
    return {
      ok: false,
      manifest,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          'project-root-missing',
          '.',
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }

  const paths = new Set();
  for (const scene of manifest.scenes ?? [])
    if (isRecord(scene)) paths.add(scene.worldDefinitionPath);
  const assets = manifest.assets;
  if (isRecord(assets)) {
    paths.add(assets.catalogPath);
    paths.add(assets.assetRecordsPath);
    for (const reference of assets.references ?? [])
      if (isRecord(reference)) paths.add(reference.runtimePath);
  }
  const content = manifest.content;
  if (isRecord(content)) {
    for (const path of content.characterDefinitionPaths ?? []) paths.add(path);
    for (const field of [
      'narrativeDefinitionPath',
      'gameplayDefinitionPath',
      'animationMappingPath',
    ])
      if (content[field]) paths.add(content[field]);
  }
  for (const path of paths) {
    if (!isRelativeProjectPath(path)) continue;
    try {
      await resolveProjectFile(root, path);
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'project-file-invalid',
          path,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  try {
    const packageJson = JSON.parse(
      await readFile(await resolveProjectFile(root, 'package.json'), 'utf8'),
    );
    for (const action of ACTIONS) {
      const script = manifest.commands?.[action];
      if (typeof script === 'string' && typeof packageJson.scripts?.[script] !== 'string')
        diagnostics.push(
          diagnostic(
            'missing-npm-script',
            `package.json.scripts.${script}`,
            `Required ${action} script is not defined.`,
          ),
        );
    }
    for (const packageRoot of manifest.frameworkPackages ?? []) {
      if (!FRAMEWORK_PACKAGE_ROOTS.includes(packageRoot)) continue;
      const archive = `vendor/${packageRoot}.tgz`;
      if (packageJson.dependencies?.[packageRoot] !== `file:${archive}`)
        diagnostics.push(
          diagnostic(
            'package-archive-mismatch',
            `package.json.dependencies.${packageRoot}`,
            `Expected dependency file:${archive}.`,
          ),
        );
      try {
        await resolveProjectFile(root, archive);
      } catch (error) {
        diagnostics.push(
          diagnostic(
            'package-archive-missing',
            archive,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'package-manifest-invalid',
        'package.json',
        error instanceof Error ? error.message : String(error),
      ),
    );
  }

  if (assets?.catalogPath && isRelativeProjectPath(assets.catalogPath)) {
    try {
      const catalogPath = await resolveProjectFile(root, assets.catalogPath);
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
      for (const issue of validateAssetCatalog(catalog))
        diagnostics.push(
          diagnostic(
            `catalog-${issue.code}`,
            `${assets.catalogPath}${issue.path.replace(/^\$/u, '')}`,
            issue.message,
          ),
        );
      const catalogIds = new Set(
        Array.isArray(catalog.assets) ? catalog.assets.map((asset) => asset.id) : [],
      );
      for (const [index, reference] of (assets.references ?? []).entries()) {
        if (isRecord(reference) && !catalogIds.has(reference.assetId))
          diagnostics.push(
            diagnostic(
              'unknown-catalog-asset',
              `assets.references[${index}].assetId`,
              `Asset ${reference.assetId} is not present in the referenced catalog.`,
            ),
          );
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'catalog-invalid',
          assets.catalogPath,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  return { ok: diagnostics.length === 0, manifest, diagnostics };
}

export async function inspectGameProject(projectRoot) {
  const result = await validateGameProject(projectRoot);
  const manifest = result.manifest;
  if (!manifest) return { ...result, summary: null };
  return {
    ...result,
    summary: {
      id: manifest.game?.id,
      displayName: manifest.game?.displayName,
      version: manifest.game?.version,
      frameworkPackages: manifest.frameworkPackages ?? [],
      scenes: (manifest.scenes ?? []).map(({ id, mapId, startAnchorId }) => ({
        id,
        mapId,
        startAnchorId,
      })),
      assetReferences: manifest.assets?.references ?? [],
      narrative: manifest.content?.narrativeDefinitionPath ?? null,
      gameplay: manifest.content?.gameplayDefinitionPath ?? null,
      save: manifest.save ?? null,
    },
  };
}

async function templateFiles(manifest, frameworkPackages, archiveInfo) {
  const [toolchain, lockTemplate] = await Promise.all([
    readFile(join(TEMPLATE_ROOT, 'toolchain.json'), 'utf8').then(JSON.parse),
    readFile(join(TEMPLATE_ROOT, 'toolchain-lock.json'), 'utf8').then(JSON.parse),
  ]);
  const frameworkDependencies = Object.fromEntries(
    frameworkPackages.map((name) => [name, `file:vendor/${name}.tgz`]),
  );
  const packageManifest = {
    name: `game-${manifest.game.id}`,
    private: true,
    version: manifest.game.version,
    type: 'module',
    engines: { node: '>=22.0.0' },
    scripts: {
      dev: 'vite --host 127.0.0.1 --port 4175 --strictPort',
      build: 'tsc -b && vite build',
      test: 'vitest run src',
      preview: 'vite preview --host 127.0.0.1 --port 4176 --strictPort',
      capture: 'playwright test --config playwright.config.ts',
    },
    dependencies: {
      ...toolchain.dependencies,
      ...frameworkDependencies,
    },
    devDependencies: toolchain.devDependencies,
  };
  const htmlEscape = (text) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  const markdownEscape = (text) => text.replace(/[\\`*_{}[\]()#+.!|>~-]/gu, '\\$&');
  const values = {
    GAME_ID_JSON: JSON.stringify(manifest.game.id),
    WAYPOINT_GAME_NAME_BASE64: Buffer.from(manifest.game.displayName, 'utf8').toString('base64'),
    GAME_NAME_HTML: htmlEscape(manifest.game.displayName),
    GAME_NAME_MD: markdownEscape(manifest.game.displayName),
    DEFAULT_LOCALE_HTML: htmlEscape(manifest.game.defaultLocale),
    DIRECTION_HTML: manifest.accessibility.direction,
    PACKAGE_JSON: `${JSON.stringify(packageManifest, null, 2)}\n`,
    PROJECT_JSON: `${JSON.stringify(manifest, null, 2)}\n`,
    PACKAGE_ROOTS_JSON: JSON.stringify(frameworkPackages, null, 2),
  };
  const packageLock = {
    name: packageManifest.name,
    version: packageManifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: packageManifest.name,
        version: packageManifest.version,
        dependencies: packageManifest.dependencies,
        devDependencies: packageManifest.devDependencies,
      },
      ...lockTemplate.packages,
    },
  };
  for (const packageRoot of frameworkPackages) {
    packageLock.packages[`node_modules/${packageRoot}`] = {
      version: archiveInfo[packageRoot].version,
      resolved: `file:vendor/${packageRoot}.tgz`,
      integrity: archiveInfo[packageRoot].integrity,
    };
  }
  const files = new Map();
  for (const name of [
    'README.md',
    'index.html',
    'playwright.config.ts',
    'tsconfig.json',
    'vite.config.ts',
    'src/game.ts',
    'src/game.test.ts',
    'src/main.tsx',
    'src/vite-env.d.ts',
    'src/styles.css',
    'src/world.ts',
    'tests/preview.spec.ts',
    'assets/asset-records.json',
    'assets/catalog.json',
    'src/content/animations.json',
    'src/content/characters.ts',
    'toolchain.json',
    'gitignore.template',
  ]) {
    let content = await readFile(join(TEMPLATE_ROOT, name), 'utf8');
    for (const [key, replacement] of Object.entries(values))
      content = content.replaceAll(`{{${key}}}`, replacement);
    files.set(name === 'gitignore.template' ? '.gitignore' : name, content);
  }
  files.set(GAME_PROJECT_FILE, values.PROJECT_JSON);
  files.set('package.json', values.PACKAGE_JSON);
  files.set('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);
  return files;
}

export async function createGameProject({
  directory,
  id,
  displayName,
  frameworkPackages = ['waypoint-rpg-core'],
  supportedLocales = ['en'],
  defaultLocale = supportedLocales[0] ?? 'en',
  frameworkArchives = {},
}) {
  if (typeof directory !== 'string' || directory.trim() === '')
    throw new Error('A destination directory is required.');
  const manifest = createGameProjectManifest({
    id,
    displayName,
    frameworkPackages,
    supportedLocales,
    defaultLocale,
  });
  const report = validateGameProjectManifest(manifest);
  if (!report.ok)
    throw new Error(
      report.diagnostics.map(({ path, message }) => `${path}: ${message}`).join('\n'),
    );
  const archiveInfo = {};
  for (const packageRoot of frameworkPackages) {
    const archivePath = frameworkArchives[packageRoot];
    if (typeof archivePath !== 'string')
      throw new Error(
        `Provide a local ${packageRoot} tarball with --${packageRoot.replace('waypoint-rpg-', '')}-tarball.`,
      );
    const fileInfo = await stat(archivePath).catch(() => null);
    if (!fileInfo?.isFile())
      throw new Error(`Framework tarball does not exist or is not a file: ${archivePath}.`);
    const bytes = await readFile(archivePath);
    const metadata = readFrameworkPackageMetadata(bytes, packageRoot);
    archiveInfo[packageRoot] = {
      bytes,
      version: metadata.version,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
  }

  const target = resolve(directory);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const targetInfo = await access(target)
    .then(() => true)
    .catch(() => false);
  if (targetInfo) throw new Error(`Refusing to overwrite existing project path: ${target}.`);
  const stage = join(parent, `.waypoint-game-${randomUUID()}`);
  await mkdir(stage, { recursive: false });
  try {
    const files = await templateFiles(manifest, frameworkPackages, archiveInfo);
    for (const [relativePath, content] of files) {
      const path = join(stage, ...relativePath.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, { flag: 'wx' });
    }
    for (const packageRoot of frameworkPackages) {
      const archive = join(stage, 'vendor', `${packageRoot}.tgz`);
      await mkdir(dirname(archive), { recursive: true });
      await writeFile(archive, archiveInfo[packageRoot].bytes, { flag: 'wx' });
    }
    await rename(stage, target);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, manifest };
}

export async function runGameProjectCommand(projectRoot, action, args = []) {
  if (!ACTIONS.includes(action)) throw new Error(`Unsupported project command: ${action}.`);
  const result = await validateGameProject(projectRoot);
  if (!result.ok)
    throw new Error(
      result.diagnostics.map(({ path, message }) => `${path}: ${message}`).join('\n'),
    );
  const script = result.manifest.commands[action];
  const commandArgs = ['run', script, ...(args.length ? ['--', ...args] : [])];
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolveExit, reject) => {
    const child = spawn(npm, commandArgs, {
      cwd: resolve(projectRoot),
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
}
