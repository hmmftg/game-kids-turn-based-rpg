#!/usr/bin/env node

import { resolve } from 'node:path';
import { error as logError, log } from 'node:console';
import process from 'node:process';
import { importModel } from './model-import.mjs';
import {
  createGameProject,
  inspectGameProject,
  runGameProjectCommand,
  validateGameProject,
} from './game-project.mjs';

function fail(message) {
  throw new Error(message);
}

function parseAssetImportArguments(args) {
  const options = {
    outputDirectory: resolve(process.cwd(), 'public/models'),
    manifestPath: resolve(process.cwd(), 'assets/asset-records.json'),
    requireApproval: false,
    replace: false,
  };
  const fields = new Map([
    ['--source', 'sourcePath'],
    ['--metadata', 'metadataPath'],
    ['--output-directory', 'outputDirectory'],
    ['--manifest', 'manifestPath'],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--replace') {
      options.replace = true;
      continue;
    }
    if (argument === '--require-release-approval') {
      options.requireApproval = true;
      continue;
    }
    const field = fields.get(argument);
    if (!field) fail(`Unknown argument: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
    options[field] = resolve(value);
    index += 1;
  }
  if (!options.sourcePath || !options.metadataPath)
    fail(
      'Usage: waypoint-rpg asset import --source <local.glb|local.gltf> --metadata <asset.json> [--output-directory <dir>] [--manifest <file>] [--replace] [--require-release-approval]',
    );
  return options;
}

const PACKAGE_ALIASES = new Map([
  ['core', 'waypoint-rpg-core'],
  ['narrative', 'waypoint-rpg-narrative'],
  ['gameplay', 'waypoint-rpg-gameplay'],
]);

function parseGameCreateArguments(args) {
  const options = {
    frameworkPackages: ['waypoint-rpg-core'],
    supportedLocales: ['en'],
    frameworkArchives: {},
  };
  const simpleFields = new Map([
    ['--directory', 'directory'],
    ['--id', 'id'],
    ['--name', 'displayName'],
    ['--default-locale', 'defaultLocale'],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
    const simpleField = simpleFields.get(argument);
    if (simpleField) {
      options[simpleField] = simpleField === 'directory' ? resolve(value) : value;
      index += 1;
      continue;
    }
    if (argument === '--packages') {
      const packages = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => PACKAGE_ALIASES.get(item) ?? item);
      options.frameworkPackages = [...new Set(packages)];
      index += 1;
      continue;
    }
    if (argument === '--locales') {
      options.supportedLocales = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    const archiveMatch = /^--(core|narrative|gameplay)-tarball$/u.exec(argument);
    if (archiveMatch) {
      options.frameworkArchives[PACKAGE_ALIASES.get(archiveMatch[1])] = resolve(value);
      index += 1;
      continue;
    }
    fail(`Unknown game create option: ${argument}.`);
  }
  for (const required of ['directory', 'id', 'displayName'])
    if (!options[required])
      fail(`Missing required option --${required === 'displayName' ? 'name' : required}.`);
  if (
    options.frameworkPackages.includes('waypoint-rpg-core') &&
    !options.frameworkArchives['waypoint-rpg-core']
  )
    fail('Provide --core-tarball with a locally packed waypoint-rpg-core archive.');
  if (
    options.frameworkPackages.includes('waypoint-rpg-narrative') &&
    !options.frameworkArchives['waypoint-rpg-narrative']
  )
    fail('Provide --narrative-tarball with a locally packed waypoint-rpg-narrative archive.');
  if (
    options.frameworkPackages.includes('waypoint-rpg-gameplay') &&
    !options.frameworkArchives['waypoint-rpg-gameplay']
  )
    fail('Provide --gameplay-tarball with a locally packed waypoint-rpg-gameplay archive.');
  return options;
}

async function runGameCommand(command, args) {
  if (command === 'create') {
    const created = await createGameProject(parseGameCreateArguments(args));
    log(`Created ${created.manifest.game.displayName} at ${created.directory}`);
    return;
  }
  const projectRoot = resolve(args[0] && !args[0].startsWith('--') ? args[0] : process.cwd());
  const forwardedArgs = args[0] && !args[0].startsWith('--') ? args.slice(1) : args;
  if (['validate', 'inspect'].includes(command)) {
    const result =
      command === 'validate'
        ? await validateGameProject(projectRoot)
        : await inspectGameProject(projectRoot);
    log(
      JSON.stringify(
        command === 'validate' ? { ok: result.ok, diagnostics: result.diagnostics } : result,
        null,
        2,
      ),
    );
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (['dev', 'build', 'test', 'preview', 'capture'].includes(command)) {
    const exitCode = await runGameProjectCommand(projectRoot, command, forwardedArgs);
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }
  fail(
    'Usage: waypoint-rpg game <create|validate|inspect|dev|build|test|preview|capture> [project] [options].',
  );
}

async function main(args) {
  const [group, command, ...rest] = args;
  if (group === 'game') return runGameCommand(command, rest);
  if (group !== 'asset' || command !== 'import')
    fail('Usage: waypoint-rpg asset import [options].');
  const result = await importModel(parseAssetImportArguments(rest));
  log(`Imported ${result.record.id} to ${result.record.runtimePath}`);
  log(`Output SHA-256: ${result.record.outputSha256}`);
  log(`Metrics: ${JSON.stringify(result.record.metrics)}`);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
