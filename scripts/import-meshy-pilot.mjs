#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { error, log } from 'node:console';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { importModel } from '../tools/creator/src/model-import.mjs';
import {
  addSpecifiedAsset,
  createAssetCatalog,
  markAssetSourced,
  markAssetValidated,
  recordAssetImport,
  serializeAssetCatalog,
  verifyAssetFiles,
} from 'waypoint-rpg-creator/asset-catalog';

const PILOT_TRIANGLE_LIMIT = 400_000;
const PILOT_SOURCE_DATE = '2026-11-25';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const MESHY_FREE_PLAN_EVIDENCE_URL =
  'https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan';
const MESHY_TERMS_URL = 'https://www.meshy.ai/terms-of-use';
const ATTRIBUTION = 'Model created with Meshy – CC BY 4.0 License';
const GAME_ID = 'garden-adventure';
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const COMMON_GIT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  }).trim(),
);
const REPOSITORY_ROOTS = [...new Set([REPOSITORY_ROOT, dirname(COMMON_GIT_DIRECTORY)])];

function pathIsInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === '' ||
    (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

function pathsOverlap(left, right) {
  return pathIsInside(left, right) || pathIsInside(right, left);
}

async function resolveFuturePath(path) {
  let current = resolve(path);
  const missingParts = [];
  while (true) {
    const actual = await realpath(current).catch(() => null);
    if (actual) return resolve(actual, ...missingParts.reverse());
    const parent = dirname(current);
    if (parent === current) throw new Error(`Cannot resolve destination path ${path}.`);
    missingParts.push(basename(current));
    current = parent;
  }
}

async function validatePrivateStaging(sourceDirectory, outputDirectory) {
  const sourceRoot = await realpath(sourceDirectory);
  const outputRoot = await resolveFuturePath(outputDirectory);
  if (REPOSITORY_ROOTS.some((root) => pathIsInside(root, outputRoot)))
    throw new Error('Private pilot staging must be outside the checkout.');
  if (pathsOverlap(sourceRoot, outputRoot))
    throw new Error('Private pilot source and staging directories must be isolated.');
  return { sourceRoot, outputRoot };
}

export const MESHY_PILOT_ASSETS = Object.freeze([
  {
    id: 'meshy-garden-fountain',
    sourceFilename: 'Meshy_AI_Ancient_Stone_Fountain_20261125_generate.glb',
    description: 'Ancient stone fountain landmark used in the Garden of Stories village.',
    preferredTriangles: 4_000,
    preferredBytes: 2 * 1024 * 1024,
  },
  {
    id: 'meshy-garden-guardian',
    sourceFilename: 'Meshy_AI_Golden_Golem_Sentinel_20261125_generate.glb',
    description: 'Static golden golem sentinel used by the Garden of Stories encounter.',
    preferredTriangles: 8_000,
    preferredBytes: 3 * 1024 * 1024,
  },
  {
    id: 'meshy-garden-blossom-tree',
    sourceFilename: 'Meshy_AI_Pink_Polygon_Tree_20261125_generate.glb',
    description: 'Pink blossom tree shown after the Garden of Stories restoration quest.',
    preferredTriangles: 4_000,
    preferredBytes: 2 * 1024 * 1024,
  },
  {
    id: 'meshy-garden-shrine',
    sourceFilename: 'Meshy_AI_Roseglass_Shrine_20261125_generate.glb',
    description: 'Decorative roseglass shrine landmark in the Garden of Stories.',
    preferredTriangles: 4_000,
    preferredBytes: 2 * 1024 * 1024,
  },
  {
    id: 'meshy-garden-sage',
    sourceFilename: 'Meshy_AI_T_Pose_Sage_20261125_generate.glb',
    description: 'Static T-pose sage candidate for the Garden of Stories traveler.',
    preferredTriangles: 8_000,
    preferredBytes: 3 * 1024 * 1024,
  },
]);

const RIGHTS_EVIDENCE = `# Meshy Free-plan model licensing evidence

The supplied models were generated and downloaded on the Meshy Free plan, as
reported for this local pilot. Meshy's terms make Free-plan output available
under the Creative Commons Attribution 4.0 International license, subject to
appropriate credit. This pilot records that license and keeps every model
unapproved for release until the consuming game completes its own review.

Attribution: ${ATTRIBUTION}

Meshy Free-plan license evidence: ${MESHY_FREE_PLAN_EVIDENCE_URL}

License text: ${LICENSE_URL}

Meshy terms: ${MESHY_TERMS_URL}

The source filenames contain the date ${PILOT_SOURCE_DATE}. This is filename
evidence only. Per-model generation records were not supplied for this pilot.
`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readGlbJson(bytes, sourcePath) {
  if (
    bytes.byteLength < 20 ||
    bytes.toString('ascii', 0, 4) !== 'glTF' ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.byteLength
  )
    throw new Error(`${sourcePath}: invalid GLB header.`);
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength % 4 !== 0 || 20 + jsonLength > bytes.byteLength)
    throw new Error(`${sourcePath}: invalid GLB JSON chunk length.`);
  const jsonText = bytes.toString('utf8', 20, 20 + jsonLength);
  let jsonEnd = jsonText.length;
  while (
    jsonEnd > 0 &&
    (jsonText.charCodeAt(jsonEnd - 1) === 0 || jsonText.charCodeAt(jsonEnd - 1) === 0x20)
  )
    jsonEnd -= 1;
  return JSON.parse(jsonText.slice(0, jsonEnd));
}

function nodeTree(document) {
  const scene = document.scenes?.[document.scene ?? 0];
  const nodes = document.nodes ?? [];
  const createNode = (index, ancestry = new Set()) => {
    const node = nodes[index];
    if (!node) return { index, missing: true };
    if (ancestry.has(index)) return { index, cycle: true };
    const nextAncestry = new Set(ancestry).add(index);
    return {
      index,
      name: node.name ?? '',
      mesh: node.mesh ?? null,
      skin: node.skin ?? null,
      children: (node.children ?? []).map((child) => createNode(child, nextAncestry)),
    };
  };
  return {
    scene: scene?.name ?? '',
    roots: (scene?.nodes ?? []).map((index) => createNode(index)),
  };
}

function inspectSource(asset, sourceBytes, importedRecord) {
  const document = readGlbJson(sourceBytes, asset.sourceFilename);
  const meshes = document.meshes ?? [];
  const primitives = meshes.flatMap((mesh, meshIndex) =>
    (mesh.primitives ?? []).map((primitive, primitiveIndex) => ({
      mesh: mesh.name || `mesh-${meshIndex + 1}`,
      primitive: primitiveIndex,
      mode: primitive.mode ?? 4,
      attributes: Object.keys(primitive.attributes ?? {}).sort(),
      positionAccessor: primitive.attributes?.POSITION,
      material: primitive.material ?? null,
      indexed: Number.isSafeInteger(primitive.indices),
    })),
  );
  const accessors = document.accessors ?? [];
  const vertexCount = primitives.reduce(
    (sum, primitive) => sum + (accessors[primitive.positionAccessor]?.count ?? 0),
    0,
  );
  const min = importedRecord.bounds.min;
  const max = importedRecord.bounds.max;
  const bounds = {
    min,
    max,
    dimensions: max.map((value, axis) => Number((value - min[axis]).toFixed(5))),
  };
  const materials = (document.materials ?? []).map((material, index) => ({
    index,
    name: material.name ?? `material-${index + 1}`,
    pbrMetallicRoughness: material.pbrMetallicRoughness ?? null,
    normalTexture: material.normalTexture ?? null,
    emissiveFactor: material.emissiveFactor ?? null,
    alphaMode: material.alphaMode ?? 'OPAQUE',
    doubleSided: material.doubleSided ?? false,
  }));
  const textures = (document.images ?? []).map((image, index) => ({
    index,
    name: image.name ?? `image-${index + 1}`,
    mimeType: image.mimeType ?? 'unknown',
    width: null,
    height: null,
    note: 'Image dimensions are unavailable in the source inspection record.',
  }));
  const localWarnings = [];
  if (importedRecord.metrics.triangles > asset.preferredTriangles)
    localWarnings.push(
      `${importedRecord.metrics.triangles} triangles exceed the ${asset.preferredTriangles}-triangle recommendation.`,
    );
  if (sourceBytes.byteLength > asset.preferredBytes)
    localWarnings.push(
      `${sourceBytes.byteLength} bytes exceed the ${asset.preferredBytes}-byte recommendation.`,
    );

  return {
    sourceFilename: asset.sourceFilename,
    assetId: asset.id,
    sourceDateEvidence: { value: PILOT_SOURCE_DATE, basis: 'filename only' },
    sourceBytes: sourceBytes.byteLength,
    sourceSha256: sha256(sourceBytes),
    runtimeBytes: importedRecord.metrics.outputBytes,
    runtimeSha256: importedRecord.outputSha256,
    bytesPreserved: sourceBytes.byteLength === importedRecord.metrics.outputBytes,
    geometry: {
      meshes: meshes.length,
      primitives: primitives.length,
      vertices: vertexCount,
      triangles: importedRecord.metrics.triangles,
      primitivesDetail: primitives,
      vertexColors: primitives.some((primitive) => primitive.attributes.includes('COLOR_0')),
      bounds,
      groundMinimumY: min[1],
      groundOffset: Number((-min[1]).toFixed(5)),
      coordinateConvention: {
        sourceUpAxis: importedRecord.normalization.sourceUpAxis,
        sourceForwardAxis: importedRecord.normalization.sourceForwardAxis,
        runtimeUpAxis: importedRecord.normalization.upAxis,
        runtimeForwardAxis: importedRecord.normalization.forwardAxis,
      },
    },
    nodeHierarchy: nodeTree(document),
    materials,
    textures,
    skeletons: (document.skins ?? []).length,
    joints: importedRecord.metrics.jointCount,
    animations: importedRecord.clipInventory,
    morphTargets: importedRecord.metrics.morphTargetNames,
    extensions: {
      used: document.extensionsUsed ?? [],
      required: document.extensionsRequired ?? [],
    },
    estimatedDecodedGeometryBytes: importedRecord.metrics.estimatedDecodedBytes,
    importerCompatible: true,
    importPath: 'self-contained GLB byte-preserving import',
    preferredRuntimeBudget: {
      triangles: asset.preferredTriangles,
      bytes: asset.preferredBytes,
    },
    performanceWarnings: localWarnings,
    releaseApproval: 'not approved',
  };
}

function catalogInspection(report, importedRecord) {
  return {
    geometry: {
      triangles: importedRecord.metrics.triangles,
      primitives: importedRecord.metrics.primitiveCount,
    },
    materials: importedRecord.materialNames,
    textures: [],
    bones: importedRecord.metrics.jointCount,
    morphTargets: importedRecord.metrics.morphTargetNames,
    animations: importedRecord.clipInventory.map(({ sourceName, durationSeconds }) => ({
      name: sourceName,
      durationSeconds,
    })),
    normalization: {
      metersPerUnit: importedRecord.normalization.metersPerUnit,
      upAxis: importedRecord.normalization.upAxis,
      forwardAxis: importedRecord.normalization.forwardAxis,
    },
    warnings: report.performanceWarnings,
    compatibilityNotes: [
      'Source GLB bytes are copied unchanged.',
      'Flat shading remains selected by the consuming Three.js renderer for primitives without normals.',
      'Game-specific approval and release budgets remain pending.',
    ],
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function markdownReport(reports) {
  const lines = [
    '# Meshy GLB pilot inspection',
    '',
    `Generated ${new Date().toISOString()} using the local byte-preserving importer.`,
    '',
    'Source and runtime files are byte-identical. No geometry or source materials were modified.',
    '',
    '| Asset | Triangles | Vertices | Source/runtime bytes | SHA-256 identity | Decoded estimate | Recommendations |',
    '| --- | ---: | ---: | ---: | --- | ---: | --- |',
  ];
  for (const report of reports) {
    lines.push(
      `| ${report.assetId} | ${report.geometry.triangles.toLocaleString('en-US')} | ${report.geometry.vertices.toLocaleString('en-US')} | ${report.sourceBytes.toLocaleString('en-US')} | ${report.bytesPreserved ? 'match' : 'mismatch'} | ${report.estimatedDecodedGeometryBytes.toLocaleString('en-US')} | ${report.performanceWarnings.join(' ')} |`,
    );
  }
  lines.push(
    '',
    'The recommended budgets in this report describe future external asset production. The local pilot uses a trusted 400,000-triangle per-asset ceiling and retains the importer hard limits.',
    '',
    'Source generation date is evidenced by the filenames only. No asset-specific Meshy generation records were provided. Meshy Free-plan output is recorded as CC BY 4.0 with attribution. All five models remain unapproved for release.',
    '',
  );
  return lines.join('\n');
}

export async function importMeshyPilot({ sourceDirectory, outputDirectory } = {}) {
  if (typeof sourceDirectory !== 'string' || sourceDirectory.trim() === '')
    throw new Error('Provide the original models directory with --source-dir.');
  const { sourceRoot, outputRoot } = await validatePrivateStaging(
    sourceDirectory,
    outputDirectory ?? join(tmpdir(), 'waypoint-rpg-meshy-pilot'),
  );
  await Promise.all(
    ['models', 'sources', 'metadata', 'rights'].map((directory) =>
      mkdir(join(outputRoot, directory), { recursive: true }),
    ),
  );
  const rightsEvidencePath = 'rights/meshy-free-plan-cc-by-4.0.md';
  await writeFile(join(outputRoot, rightsEvidencePath), RIGHTS_EVIDENCE, 'utf8');

  let catalog = createAssetCatalog();
  const runtimeRecords = [];
  const reports = [];
  const failures = [];
  for (const asset of MESHY_PILOT_ASSETS) {
    catalog = addSpecifiedAsset(catalog, {
      id: asset.id,
      category: 'static-model',
      description: asset.description,
      consumerGameIds: [GAME_ID],
    });
    const sourcePath = join(sourceRoot, asset.sourceFilename);
    let sourceBytes;
    try {
      sourceBytes = await readFile(sourcePath);
    } catch (cause) {
      failures.push({
        assetId: asset.id,
        sourceFilename: asset.sourceFilename,
        error: String(cause),
      });
      continue;
    }

    const sourceHash = sha256(sourceBytes);
    const sourceCopy = `sources/${asset.sourceFilename}`;
    await copyFile(sourcePath, join(outputRoot, sourceCopy));
    const copiedHash = sha256(await readFile(join(outputRoot, sourceCopy)));
    if (copiedHash !== sourceHash) {
      failures.push({
        assetId: asset.id,
        sourceFilename: asset.sourceFilename,
        error: 'Private source copy SHA-256 differs from the original model.',
      });
      continue;
    }

    const metadata = {
      id: asset.id,
      sourceOrigin: `Meshy Free-plan generated GLB, ${asset.sourceFilename}`,
      rights: {
        licenseId: 'CC-BY-4.0',
        attribution: ATTRIBUTION,
        commercialUse: true,
        redistribution: true,
        approved: false,
      },
      normalization: {
        metersPerUnit: 1,
        sourceUpAxis: 'Y',
        sourceForwardAxis: '-Z',
      },
      clips: {},
      fallbackAction: 'static',
    };
    const metadataPath = join(outputRoot, 'metadata', `${asset.id}.json`);
    await writeJson(metadataPath, metadata);

    let importResult;
    try {
      importResult = await importModel({
        sourcePath,
        metadataPath,
        outputDirectory: join(outputRoot, 'models'),
        manifestPath: join(outputRoot, 'importer-records.json'),
        budget: { maxTriangles: PILOT_TRIANGLE_LIMIT },
        preserveGlbBytes: true,
        requireApproval: false,
      });
    } catch (cause) {
      failures.push({
        assetId: asset.id,
        sourceFilename: asset.sourceFilename,
        sourceSha256: sourceHash,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      continue;
    }

    if (sourceHash !== importResult.record.outputSha256) {
      failures.push({
        assetId: asset.id,
        sourceFilename: asset.sourceFilename,
        error: 'Imported runtime SHA-256 differs from the original source.',
      });
      continue;
    }

    const report = inspectSource(asset, sourceBytes, importResult.record);
    reports.push(report);
    runtimeRecords.push(importResult.record);
    catalog = markAssetSourced(catalog, asset.id, {
      provider: 'Meshy',
      reference: `Meshy Free-plan GLB ${asset.sourceFilename}. Filename date is ${PILOT_SOURCE_DATE}.`,
      originalPath: sourceCopy,
      originalSha256: sourceHash,
      generated: true,
    });
    catalog = recordAssetImport(catalog, asset.id, {
      runtimePath: importResult.record.runtimePath,
      runtimeSha256: importResult.record.outputSha256,
      rights: {
        licenseId: 'CC-BY-4.0',
        licenseUrl: LICENSE_URL,
        attribution: ATTRIBUTION,
        commercialUse: true,
        redistribution: true,
        evidencePath: rightsEvidencePath,
        approvalStatus: 'not approved',
        sourceDateEvidence: 'filename only',
      },
      conversion: {
        tool: importResult.record.importer,
        version: importResult.record.importerVersion,
        options: {
          method: 'byte-preserving import',
          preserveGeometryAndVertexAttributes: true,
          preserveSourceBytes: true,
          explicitPilotTriangleLimit: PILOT_TRIANGLE_LIMIT,
        },
      },
      inspection: catalogInspection(report, importResult.record),
      budgets: {
        maxTriangles: asset.preferredTriangles,
        maxFileBytes: asset.preferredBytes,
        localPilotTriangleLimit: PILOT_TRIANGLE_LIMIT,
        hardMaximumFileBytes: 12 * 1024 * 1024,
        estimatedDecodedGeometryBytes: importResult.record.metrics.estimatedDecodedBytes,
      },
    });
    catalog = markAssetValidated(catalog, asset.id, {
      validatedBy: 'waypoint-rpg-creator byte-preserving importer',
      checks: [
        {
          id: 'source-runtime-hash',
          passed: true,
          evidence: `Source and runtime SHA-256 both equal ${sourceHash}.`,
        },
        {
          id: 'glb-structure',
          passed: true,
          evidence: 'Self-contained glTF 2.0 GLB parsed by the existing creator importer.',
        },
        {
          id: 'local-pilot-triangle-budget',
          passed: true,
          evidence: `${importResult.record.metrics.triangles} triangles, limit ${PILOT_TRIANGLE_LIMIT}.`,
        },
      ],
    });
  }

  const fileIssues = await verifyAssetFiles(catalog, outputRoot);
  if (fileIssues.length > 0)
    throw new Error(fileIssues.map(({ path, code }) => `${path}: ${code}`).join('\n'));
  await writeJson(join(outputRoot, 'asset-records.json'), runtimeRecords);
  await writeFile(join(outputRoot, 'asset-catalog.json'), serializeAssetCatalog(catalog), 'utf8');
  await writeJson(join(outputRoot, 'inspection-report.json'), reports);
  await writeFile(join(outputRoot, 'inspection-report.md'), markdownReport(reports), 'utf8');

  return { outputDirectory: outputRoot, records: runtimeRecords, reports, failures };
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index];
    if (name !== '--source-dir' && name !== '--output-dir')
      throw new Error(`Unknown argument ${name}.`);
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
    values.set(name, value);
    index += 1;
  }
  const sourceDirectory = values.get('--source-dir');
  if (!sourceDirectory)
    throw new Error(
      'Usage: node scripts/import-meshy-pilot.mjs --source-dir <models-directory> [--output-dir <private-directory>].',
    );
  return { sourceDirectory: resolve(sourceDirectory), outputDirectory: values.get('--output-dir') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await importMeshyPilot(parseArguments(process.argv.slice(2)));
    log(`Imported ${result.records.length} Meshy GLBs to ${result.outputDirectory}.`);
    for (const failure of result.failures) error(`${failure.assetId}: ${failure.error}`);
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
