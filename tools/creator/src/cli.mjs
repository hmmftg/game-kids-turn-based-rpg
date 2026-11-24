#!/usr/bin/env node

import { resolve } from 'node:path';
import { error as logError, log } from 'node:console';
import process from 'node:process';
import { importModel } from './model-import.mjs';

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

async function main(args) {
  const [group, command, ...rest] = args;
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
