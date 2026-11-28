export const MODEL_ASSET_SCHEMA_VERSION = 1 as const;

export const MODEL_IMPORT_BUDGET = Object.freeze({
  maxFileBytes: 12 * 1024 * 1024,
  maxTriangles: 60_000,
  maxPrimitives: 256,
  maxTextureDimension: 2048,
  maxDecodedTextureBytes: 24 * 1024 * 1024,
  maxJoints: 64,
  maxClips: 16,
  maxClipSeconds: 180,
});

export interface ModelRuntimePolicy {
  readonly maxTrianglesPerAsset: number;
  readonly maxLoadedAssets: number;
  readonly maxDecodedGeometryBytes: number;
  readonly maxSceneTriangles: number;
  readonly allowUnapproved?: boolean;
}

export const DEFAULT_MODEL_RUNTIME_POLICY: ModelRuntimePolicy = Object.freeze({
  maxTrianglesPerAsset: MODEL_IMPORT_BUDGET.maxTriangles,
  maxLoadedAssets: 20,
  maxDecodedGeometryBytes: 256 * 1024 * 1024,
  maxSceneTriangles: 300_000,
  allowUnapproved: false,
});

const MAX_RUNTIME_POLICY = Object.freeze({
  maxTrianglesPerAsset: 1_000_000,
  maxLoadedAssets: 64,
  maxDecodedGeometryBytes: 512 * 1024 * 1024,
  maxSceneTriangles: 4_000_000,
});

export type SemanticAction = 'idle' | 'move' | 'interact' | 'combat' | 'defeat';
export type RuntimeModelFormat = 'glb';
export type AxisDirection = 'X' | '-X' | 'Y' | '-Y' | 'Z' | '-Z';

export interface ModelAssetRights {
  readonly licenseId: string;
  readonly attribution: string;
  readonly commercialUse: boolean;
  readonly redistribution: boolean;
  readonly approved: boolean;
}

export interface ModelAssetRecord {
  readonly schemaVersion: typeof MODEL_ASSET_SCHEMA_VERSION;
  readonly id: string;
  readonly runtimePath: string;
  readonly runtimeFormat: RuntimeModelFormat;
  readonly sourceFormat: string;
  readonly sourceOrigin: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly importer: string;
  readonly importerVersion: string;
  readonly conversionOptions: {
    readonly outputFormat: 'glb';
    readonly preserveSkinning: true;
    readonly preserveMorphTargets: true;
    readonly preserveAnimations: true;
  };
  readonly rights: ModelAssetRights;
  readonly normalization: {
    readonly metersPerUnit: number;
    readonly sourceUpAxis: AxisDirection;
    readonly sourceForwardAxis: AxisDirection;
    readonly upAxis: 'Y';
    readonly forwardAxis: '-Z';
    readonly rootRotation: readonly [number, number, number, number];
  };
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly metrics: {
    readonly sourceBytes: number;
    readonly outputBytes: number;
    readonly triangles: number;
    readonly primitiveCount: number;
    readonly textureCount: number;
    readonly textureBytes: number;
    readonly maxTextureDimension: number;
    readonly jointCount: number;
    readonly skinCount: number;
    readonly morphTargetNames: readonly string[];
    readonly estimatedDecodedBytes: number;
  };
  readonly extensions: readonly string[];
  readonly materialNames: readonly string[];
  readonly clipInventory: readonly {
    readonly name: string;
    readonly durationSeconds: number;
  }[];
  readonly clips: Readonly<Record<string, string>>;
  readonly fallbackAction: 'idle' | 'static';
  readonly warnings: readonly string[];
}

export interface ModelAssetDiagnostic {
  readonly path: string;
  readonly message: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AXES: readonly AxisDirection[] = ['X', '-X', 'Y', '-Y', 'Z', '-Z'];
const ACTIONS: readonly SemanticAction[] = ['idle', 'move', 'interact', 'combat', 'defeat'];

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return !Object.keys(value).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key));
}

function finiteTuple(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  );
}

function finiteQuaternion(value: unknown): value is readonly [number, number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((component) => typeof component === 'number' && Number.isFinite(component))
  )
    return false;
  const magnitude = Math.hypot(...value);
  return Math.abs(magnitude - 1) < 1e-4;
}

function nonNegativeInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

export function resolveModelRuntimePolicy(
  value: unknown = {},
  options: { readonly mode?: 'runtime' | 'production' } = {},
): ModelRuntimePolicy {
  const { mode = 'runtime' } = options;
  if (!record(value)) throw new TypeError('Runtime model policy must be a plain object.');

  for (const key of Reflect.ownKeys(value)) {
    if (key !== 'allowUnapproved' && !Object.hasOwn(MAX_RUNTIME_POLICY, key))
      throw new TypeError(`Unknown runtime model policy field ${String(key)}.`);
  }

  const field = (key: keyof ModelRuntimePolicy): unknown => {
    if (Object.hasOwn(value, key)) return value[key];
    if (mode === 'production')
      throw new TypeError(`Production model policy requires an explicit ${key}.`);
    return DEFAULT_MODEL_RUNTIME_POLICY[key];
  };

  const limit = (key: keyof typeof MAX_RUNTIME_POLICY): number => {
    const actual = field(key);
    const maximum = MAX_RUNTIME_POLICY[key];
    if (!nonNegativeInteger(actual, maximum) || actual === 0)
      throw new RangeError(
        `Runtime model policy ${key} must be a positive integer no greater than ${maximum}.`,
      );
    return actual;
  };

  const maxTrianglesPerAsset = limit('maxTrianglesPerAsset');
  const maxLoadedAssets = limit('maxLoadedAssets');
  const maxDecodedGeometryBytes = limit('maxDecodedGeometryBytes');
  const maxSceneTriangles = limit('maxSceneTriangles');

  if (maxTrianglesPerAsset > maxSceneTriangles)
    throw new RangeError(
      'Per-asset triangle policy cannot exceed the active-scene triangle policy.',
    );

  const allowUnapproved = field('allowUnapproved');
  if (typeof allowUnapproved !== 'boolean')
    throw new TypeError('Runtime model policy allowUnapproved must be a boolean.');
  if (mode === 'production' && allowUnapproved)
    throw new TypeError('Production model policy allowUnapproved must be explicitly false.');

  return Object.freeze({
    maxTrianglesPerAsset,
    maxLoadedAssets,
    maxDecodedGeometryBytes,
    maxSceneTriangles,
    allowUnapproved,
  });
}

export function validateModelAssetRecord(
  value: unknown,
  policy: Pick<
    ModelRuntimePolicy,
    'maxTrianglesPerAsset' | 'allowUnapproved'
  > = DEFAULT_MODEL_RUNTIME_POLICY,
): readonly ModelAssetDiagnostic[] {
  const errors: ModelAssetDiagnostic[] = [];
  const issue = (path: string, message: string) => errors.push({ path, message });
  if (!record(value)) return [{ path: '$', message: 'Expected a JSON object.' }];

  if (value.schemaVersion !== MODEL_ASSET_SCHEMA_VERSION)
    issue('schemaVersion', 'Unsupported model asset schema version.');
  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id))
    issue('id', 'Use a stable lowercase kebab-case asset ID.');
  if (
    typeof value.runtimePath !== 'string' ||
    !/^models\/[a-zA-Z0-9._/-]+\.glb$/.test(value.runtimePath) ||
    value.runtimePath.includes('..')
  )
    issue('runtimePath', 'Use a local models/ path without traversal.');
  if (value.runtimeFormat !== 'glb')
    issue('runtimeFormat', 'Runtime assets must be self-contained GLB files.');
  if (typeof value.sourceFormat !== 'string' || value.sourceFormat.length === 0)
    issue('sourceFormat', 'Record the original source format.');
  if (typeof value.sourceOrigin !== 'string' || value.sourceOrigin.length === 0)
    issue('sourceOrigin', 'Record a source URL, provider, or generated fixture origin.');
  for (const key of ['sourceSha256', 'outputSha256'] as const) {
    if (typeof value[key] !== 'string' || !SHA256.test(value[key]))
      issue(key, 'Record the lowercase SHA-256 digest.');
  }
  for (const key of ['importer', 'importerVersion'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0)
      issue(key, 'Record the tool and version used to produce the runtime file.');
  }

  if (!record(value.conversionOptions)) {
    issue('conversionOptions', 'Record the preserving glTF-to-GLB conversion contract.');
  } else {
    if (value.conversionOptions.outputFormat !== 'glb')
      issue('conversionOptions.outputFormat', 'Release output must be GLB.');
    for (const key of ['preserveSkinning', 'preserveMorphTargets', 'preserveAnimations'] as const) {
      if (value.conversionOptions[key] !== true)
        issue(`conversionOptions.${key}`, 'Animated model data must be preserved.');
    }
  }

  if (!record(value.rights)) {
    issue('rights', 'Record license and redistribution rights.');
  } else {
    if (typeof value.rights.licenseId !== 'string' || value.rights.licenseId.length === 0)
      issue('rights.licenseId', 'Record the applicable license or ownership terms.');
    if (typeof value.rights.attribution !== 'string')
      issue(
        'rights.attribution',
        'Record attribution, including an empty string when not required.',
      );
    for (const key of ['commercialUse', 'redistribution', 'approved'] as const) {
      if (typeof value.rights[key] !== 'boolean') issue(`rights.${key}`, 'Expected a boolean.');
    }
    if (value.rights.approved !== true && policy.allowUnapproved !== true)
      issue('rights.approved', 'Unapproved assets cannot be used by the release consumer.');
  }

  if (!record(value.normalization)) {
    issue('normalization', 'Record the normalized coordinate convention.');
  } else {
    if (
      typeof value.normalization.metersPerUnit !== 'number' ||
      !Number.isFinite(value.normalization.metersPerUnit) ||
      value.normalization.metersPerUnit <= 0
    )
      issue('normalization.metersPerUnit', 'Expected a positive finite scale.');
    if (value.normalization.upAxis !== 'Y')
      issue('normalization.upAxis', 'Runtime up axis must be Y.');
    if (value.normalization.forwardAxis !== '-Z')
      issue('normalization.forwardAxis', 'Runtime forward axis must be -Z.');
    if (!AXES.includes(value.normalization.sourceUpAxis as AxisDirection))
      issue('normalization.sourceUpAxis', 'Use a signed X, Y, or Z source axis.');
    if (!AXES.includes(value.normalization.sourceForwardAxis as AxisDirection))
      issue('normalization.sourceForwardAxis', 'Use a signed X, Y, or Z source axis.');
    if (
      typeof value.normalization.sourceUpAxis === 'string' &&
      typeof value.normalization.sourceForwardAxis === 'string' &&
      value.normalization.sourceUpAxis.replace('-', '') ===
        value.normalization.sourceForwardAxis.replace('-', '')
    )
      issue('normalization', 'Source up and forward axes must be perpendicular.');
    if (!finiteQuaternion(value.normalization.rootRotation))
      issue('normalization.rootRotation', 'Expected a finite unit quaternion.');
  }

  const bounds = value.bounds;
  const boundsMin = record(bounds) ? bounds.min : undefined;
  const boundsMax = record(bounds) ? bounds.max : undefined;
  if (!finiteTuple(boundsMin) || !finiteTuple(boundsMax)) {
    issue('bounds', 'Expected finite three-dimensional minimum and maximum bounds.');
  } else if (boundsMin.some((coordinate, index) => coordinate > boundsMax[index]!)) {
    issue('bounds', 'Each minimum coordinate must be less than or equal to its maximum.');
  }

  if (!record(value.metrics)) {
    issue('metrics', 'Expected import and decoded-resource measurements.');
  } else {
    const limits = {
      sourceBytes: MODEL_IMPORT_BUDGET.maxFileBytes,
      outputBytes: MODEL_IMPORT_BUDGET.maxFileBytes,
      triangles: policy.maxTrianglesPerAsset,
      primitiveCount: MODEL_IMPORT_BUDGET.maxPrimitives,
      textureCount: MODEL_IMPORT_BUDGET.maxPrimitives,
      textureBytes: MODEL_IMPORT_BUDGET.maxDecodedTextureBytes,
      maxTextureDimension: MODEL_IMPORT_BUDGET.maxTextureDimension,
      jointCount: MODEL_IMPORT_BUDGET.maxJoints,
      skinCount: MODEL_IMPORT_BUDGET.maxPrimitives,
      estimatedDecodedBytes: MODEL_IMPORT_BUDGET.maxDecodedTextureBytes * 2,
    } as const;
    for (const [key, maximum] of Object.entries(limits)) {
      const actual = value.metrics[key];
      if (!nonNegativeInteger(actual, maximum)) {
        const detail =
          key === 'triangles' && typeof actual === 'number' && Number.isFinite(actual)
            ? `Measured ${actual} triangles exceeds the configured per-asset threshold ${maximum}.`
            : `Received ${String(actual)}; expected a non-negative integer no greater than ${maximum}.`;
        issue(`metrics.${key}`, detail);
      }
    }
    if (
      !Array.isArray(value.metrics.morphTargetNames) ||
      !value.metrics.morphTargetNames.every((name) => typeof name === 'string')
    )
      issue('metrics.morphTargetNames', 'Expected the named morph-target inventory.');
  }

  for (const key of ['extensions', 'materialNames', 'warnings'] as const) {
    if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === 'string'))
      issue(key, 'Expected an array of strings.');
  }

  const clipNames = new Map<string, number>();
  const clipIds = new Set<string>();
  if (!Array.isArray(value.clipInventory)) {
    issue('clipInventory', 'Expected a named animation inventory.');
  } else {
    if (value.clipInventory.length > MODEL_IMPORT_BUDGET.maxClips)
      issue('clipInventory', `At most ${MODEL_IMPORT_BUDGET.maxClips} clips are supported.`);
    value.clipInventory.forEach((clip, index) => {
      if (!record(clip) || typeof clip.name !== 'string') {
        issue(`clipInventory.${index}`, 'Each clip needs a source name.');
        return;
      }
      clipNames.set(clip.name, (clipNames.get(clip.name) ?? 0) + 1);
      clipIds.add(animationClipId(index));
      if (
        typeof clip.durationSeconds !== 'number' ||
        !Number.isFinite(clip.durationSeconds) ||
        clip.durationSeconds < 0 ||
        clip.durationSeconds > MODEL_IMPORT_BUDGET.maxClipSeconds
      )
        issue(
          `clipInventory.${index}.durationSeconds`,
          'Clip duration is outside the supported range.',
        );
    });
  }

  if (!record(value.clips)) {
    issue('clips', 'Expected a semantic-action to source-clip mapping.');
  } else {
    for (const [action, clip] of Object.entries(value.clips)) {
      if (!ACTIONS.includes(action as SemanticAction))
        issue(`clips.${action}`, 'Unknown semantic action.');
      if (typeof clip !== 'string' || clip.length === 0)
        issue(`clips.${action}`, 'Clip names must be non-empty strings.');
      else if (!clipIds.has(clip) && !clipNames.has(clip))
        issue(`clips.${action}`, 'Semantic mapping references a missing source clip.');
      else if (!clipIds.has(clip) && clipNames.get(clip) !== 1)
        issue(
          `clips.${action}`,
          'Clip name is ambiguous; reference its stable source-index clip ID instead.',
        );
    }
  }
  if (value.fallbackAction !== 'idle' && value.fallbackAction !== 'static')
    issue('fallbackAction', 'Fallback must be idle or static.');
  if (value.fallbackAction === 'idle' && record(value.clips) && !Object.hasOwn(value.clips, 'idle'))
    issue('fallbackAction', 'An idle fallback requires a declared idle clip.');
  return errors;
}

export function resolveSemanticClip(
  record: Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>,
  action: SemanticAction,
): string | null {
  return record.clips[action] ?? record.clips.idle ?? null;
}

export function animationClipId(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('Animation source index must be a non-negative safe integer.');
  return `clip-${index + 1}`;
}

export function findAnimationByClipReference<T extends { readonly name: string }>(
  animations: readonly T[],
  reference: string,
): T | null {
  const match = /^clip-([1-9][0-9]*)$/.exec(reference);
  if (match) return animations[Number(match[1]) - 1] ?? null;
  const matches = animations.filter((animation) => animation.name === reference);
  return matches.length === 1 ? matches[0]! : null;
}
