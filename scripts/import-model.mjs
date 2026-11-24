#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importModel, parseArguments } from '../tools/creator/src/model-import.mjs';

// Compatibility entry point for existing repository scripts and documentation.
// New projects use the packaged `waypoint-rpg asset import` command.
const legacyDefaults = {
  outputDirectory: resolve(process.cwd(), 'examples/scene-demo/public/models'),
  manifestPath: resolve(process.cwd(), 'examples/scene-demo/src/animation/asset-records.json'),
};

export { DEFAULT_BUDGET, importModel, parseArguments } from '../tools/creator/src/model-import.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await importModel({
      ...legacyDefaults,
      ...parseArguments(process.argv.slice(2)),
    });
    console.log(`Imported ${result.record.id} to ${result.record.runtimePath}`);
    console.log(`Output SHA-256: ${result.record.outputSha256}`);
    console.log(`Metrics: ${JSON.stringify(result.record.metrics)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
