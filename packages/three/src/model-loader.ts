import { Group, SkinnedMesh } from 'three';
import type { AnimationClip, BufferGeometry, Material, Object3D, Skeleton, Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  MODEL_IMPORT_BUDGET,
  DEFAULT_MODEL_RUNTIME_POLICY,
  animationClipId,
  validateModelAssetRecord,
  type ModelRuntimePolicy,
  type ModelAssetRecord,
} from './contracts.js';

export interface ModelLease {
  readonly root: Group;
  readonly clips: readonly AnimationClip[];
  readonly clipIds: readonly string[];
  readonly record: ModelAssetRecord;
  release(): void;
}

export interface ModelAssetLoader {
  load(
    assetId: string,
    signal: AbortSignal,
    options?: { readonly materialOverride?: MaterialOverride },
  ): Promise<ModelLease>;
  replace(record: unknown): void;
  dispose(): void;
}

export interface MaterialOverride {
  readonly color?: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly transparent?: boolean;
}

export interface ModelLoaderDependencies {
  readonly fetcher?: typeof fetch;
  readonly parse?: (bytes: ArrayBuffer, resourcePath: string) => Promise<GLTF>;
  readonly digest?: (bytes: ArrayBuffer) => Promise<string>;
  readonly baseUrl?: () => string;
  readonly policy?: Partial<ModelRuntimePolicy>;
}

interface CachedSource {
  readonly key: string;
  readonly record: ModelAssetRecord;
  readonly controller: AbortController;
  promise: Promise<GLTF>;
  source?: GLTF;
  waiters: number;
  leases: number;
  settled: boolean;
  retired: boolean;
  triangles: number;
  decodedGeometryBytes: number;
}

interface LeaseResources {
  readonly materials: Set<Material>;
  readonly skeletons: Set<Skeleton>;
}

interface GlbGeometryMetrics {
  readonly triangles: number;
  readonly primitiveCount: number;
  readonly decodedGeometryBytes: number;
}

const MAX_RUNTIME_POLICY = Object.freeze({
  maxTrianglesPerAsset: 1_000_000,
  maxLoadedAssets: 64,
  maxDecodedGeometryBytes: 512 * 1024 * 1024,
  maxSceneTriangles: 4_000_000,
});
const MAX_DECODED_GEOMETRY_BYTES_PER_ASSET = MODEL_IMPORT_BUDGET.maxDecodedTextureBytes * 2;
const MAX_RUNTIME_NODE_REFERENCES = 16_384;

function abortError(): DOMException {
  return new DOMException('Model load was cancelled.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : abortError();
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(signal.reason instanceof Error ? signal.reason : abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function readLimited(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes)
    throw new Error(`Model asset exceeds the ${maxBytes}-byte download limit.`);
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes)
      throw new Error(`Model asset exceeds the ${maxBytes}-byte download limit.`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error(`Model asset exceeds the ${maxBytes}-byte download limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function throwInvalidGlb(assetId: string): never {
  throw new Error(`Runtime GLB must be self-contained and valid (${assetId}).`);
}

function assertSelfContainedGlb(bytes: ArrayBuffer, assetId: string): Record<string, unknown> {
  if (bytes.byteLength < 20) throwInvalidGlb(assetId);
  const view = new DataView(bytes);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throwInvalidGlb(assetId);

  let offset = 12;
  let jsonBytes: Uint8Array | null = null;
  let binaryByteLength: number | null = null;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throwInvalidGlb(assetId);
    const chunkByteLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkByteLength;
    if (chunkByteLength % 4 !== 0 || chunkEnd > bytes.byteLength) throwInvalidGlb(assetId);
    if (chunkType === 0x4e4f534a) {
      if (offset !== 12 || jsonBytes !== null) throwInvalidGlb(assetId);
      jsonBytes = new Uint8Array(bytes, chunkStart, chunkByteLength);
    } else if (chunkType === 0x004e4942) {
      if (jsonBytes === null || binaryByteLength !== null) throwInvalidGlb(assetId);
      binaryByteLength = chunkByteLength;
    } else {
      throwInvalidGlb(assetId);
    }
    offset = chunkEnd;
  }
  if (offset !== bytes.byteLength || jsonBytes === null) throwInvalidGlb(assetId);

  let document: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes ?? throwInvalidGlb(assetId)),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throwInvalidGlb(assetId);
    document = parsed as Record<string, unknown>;
  } catch {
    throwInvalidGlb(assetId);
  }
  if (document === null) throwInvalidGlb(assetId);
  const asset = document.asset;
  if (!asset || typeof asset !== 'object' || (asset as Record<string, unknown>).version !== '2.0')
    throwInvalidGlb(assetId);

  const buffers = document.buffers;
  let bufferList: unknown[] = [];
  if (buffers !== undefined) {
    if (!Array.isArray(buffers) || buffers.length > 1) throwInvalidGlb(assetId);
    bufferList = buffers;
    for (const buffer of bufferList) {
      if (!buffer || typeof buffer !== 'object' || Object.hasOwn(buffer, 'uri'))
        throwInvalidGlb(assetId);
      const declaredLength = (buffer as Record<string, unknown>).byteLength;
      if (!Number.isSafeInteger(declaredLength) || (declaredLength as number) < 0)
        throwInvalidGlb(assetId);
      if ((declaredLength as number) > (binaryByteLength ?? 0)) throwInvalidGlb(assetId);
      if (binaryByteLength !== null && binaryByteLength - (declaredLength as number) > 3)
        throwInvalidGlb(assetId);
    }
  }
  if (bufferList.length === 0 && binaryByteLength !== null) throwInvalidGlb(assetId);

  const images = document.images;
  if (images !== undefined) {
    if (!Array.isArray(images)) throwInvalidGlb(assetId);
    for (const image of images) {
      if (!image || typeof image !== 'object' || Object.hasOwn(image, 'uri'))
        throwInvalidGlb(assetId);
    }
  }
  return document;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function inspectGlbGeometry(
  document: Record<string, unknown>,
  assetId: string,
): GlbGeometryMetrics {
  const meshes = document.meshes;
  const accessors = document.accessors;
  const nodes = document.nodes;
  const scenes = document.scenes;
  if (
    !Array.isArray(meshes) ||
    meshes.length === 0 ||
    !Array.isArray(accessors) ||
    !Array.isArray(nodes) ||
    !Array.isArray(scenes) ||
    scenes.length === 0
  )
    throw new Error(`Asset ${assetId} GLB contains no inspectable mesh geometry.`);
  const unsupportedRequiredExtensions = new Set([
    'KHR_draco_mesh_compression',
    'KHR_texture_basisu',
    'EXT_meshopt_compression',
    'EXT_texture_webp',
    'EXT_texture_avif',
    'EXT_mesh_gpu_instancing',
  ]);
  if (Array.isArray(document.extensionsRequired)) {
    for (const extension of document.extensionsRequired) {
      if (typeof extension !== 'string' || unsupportedRequiredExtensions.has(extension))
        throw new Error(
          `Asset ${assetId} requires unsupported glTF extension ${String(extension)}.`,
        );
    }
  }

  const referencedAccessors = new Set<number>();
  let triangles = 0;
  let primitiveCount = 0;
  let nodeReferences = 0;
  const sceneIndex = document.scene === undefined ? 0 : document.scene;
  if (!Number.isSafeInteger(sceneIndex)) throwInvalidGlb(assetId);
  const scene = objectRecord(scenes[sceneIndex as number]);
  const roots = scene?.nodes;
  if (!Array.isArray(roots)) throwInvalidGlb(assetId);
  const activeNodes = new Set<number>();
  const visitedNodes = new Set<number>();
  const stack: { readonly index: number; readonly exit: boolean }[] = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const nodeIndex = roots[index];
    if (!Number.isSafeInteger(nodeIndex) || (nodeIndex as number) < 0) throwInvalidGlb(assetId);
    stack.push({ index: nodeIndex as number, exit: false });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exit) {
      activeNodes.delete(frame.index);
      visitedNodes.add(frame.index);
      continue;
    }
    if (activeNodes.has(frame.index) || visitedNodes.has(frame.index)) throwInvalidGlb(assetId);
    const node = objectRecord(nodes[frame.index]);
    if (!node) throwInvalidGlb(assetId);
    nodeReferences += 1;
    if (nodeReferences > MAX_RUNTIME_NODE_REFERENCES)
      throw new Error(
        `Asset ${assetId} has more than ${MAX_RUNTIME_NODE_REFERENCES} reachable nodes.`,
      );
    activeNodes.add(frame.index);
    stack.push({ index: frame.index, exit: true });
    if (node.mesh !== undefined) {
      if (!Number.isSafeInteger(node.mesh) || (node.mesh as number) < 0) throwInvalidGlb(assetId);
      const mesh = objectRecord(meshes[node.mesh as number]);
      const primitives = mesh?.primitives;
      if (!Array.isArray(primitives)) throwInvalidGlb(assetId);
      for (const primitiveValue of primitives) {
        const primitive = objectRecord(primitiveValue);
        const attributes = objectRecord(primitive?.attributes);
        if (!primitive || !attributes || !Number.isSafeInteger(attributes.POSITION))
          throwInvalidGlb(assetId);
        primitiveCount += 1;
        if (primitiveCount > MODEL_IMPORT_BUDGET.maxPrimitives)
          throw new Error(
            `Asset ${assetId} has ${primitiveCount} rendered primitives; the hard limit is ${MODEL_IMPORT_BUDGET.maxPrimitives}.`,
          );
        const positionIndex = attributes.POSITION as number;
        const positionAccessor = objectRecord(accessors[positionIndex]);
        if (!positionAccessor || !Number.isSafeInteger(positionAccessor.count))
          throwInvalidGlb(assetId);
        const index = primitive.indices;
        const indexAccessor =
          typeof index === 'number' && Number.isSafeInteger(index)
            ? objectRecord(accessors[index])
            : positionAccessor;
        if (!indexAccessor || !Number.isSafeInteger(indexAccessor.count)) throwInvalidGlb(assetId);
        const elementCount = indexAccessor.count as number;
        const mode = primitive.mode === undefined ? 4 : primitive.mode;
        if (!Number.isSafeInteger(mode) || (mode as number) < 0 || (mode as number) > 6)
          throwInvalidGlb(assetId);
        if (mode === 4) triangles += Math.floor(elementCount / 3);
        else if (mode === 5 || mode === 6) triangles += Math.max(0, elementCount - 2);

        for (const accessorIndex of Object.values(attributes)) {
          if (typeof accessorIndex !== 'number' || !Number.isSafeInteger(accessorIndex))
            throwInvalidGlb(assetId);
          referencedAccessors.add(accessorIndex);
        }
        if (typeof index === 'number') referencedAccessors.add(index);
        if (Array.isArray(primitive.targets)) {
          for (const targetValue of primitive.targets) {
            const target = objectRecord(targetValue);
            if (!target) throwInvalidGlb(assetId);
            for (const accessorIndex of Object.values(target)) {
              if (typeof accessorIndex !== 'number' || !Number.isSafeInteger(accessorIndex))
                throwInvalidGlb(assetId);
              referencedAccessors.add(accessorIndex);
            }
          }
        }
      }
    }
    const children = node.children;
    if (children !== undefined && !Array.isArray(children)) throwInvalidGlb(assetId);
    if (Array.isArray(children)) {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const childIndex = children[index];
        if (!Number.isSafeInteger(childIndex) || (childIndex as number) < 0)
          throwInvalidGlb(assetId);
        stack.push({ index: childIndex as number, exit: false });
      }
    }
  }
  if (primitiveCount === 0) throw new Error(`Asset ${assetId} GLB contains no mesh primitives.`);

  const itemSizes: Readonly<Record<string, number>> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16,
  };
  const componentSizes: Readonly<Record<number, number>> = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  };
  let decodedGeometryBytes = 0;
  for (const accessorIndex of referencedAccessors) {
    const accessor = objectRecord(accessors[accessorIndex]);
    const count = accessor?.count;
    const itemSize = typeof accessor?.type === 'string' ? itemSizes[accessor.type] : undefined;
    const componentSize =
      typeof accessor?.componentType === 'number'
        ? componentSizes[accessor.componentType]
        : undefined;
    if (!accessor || !Number.isSafeInteger(count) || !itemSize || !componentSize)
      throwInvalidGlb(assetId);
    decodedGeometryBytes += (count as number) * itemSize * componentSize;
    const sparse = objectRecord(accessor.sparse);
    if (sparse) {
      const sparseCount = sparse.count;
      const indices = objectRecord(sparse.indices);
      const values = objectRecord(sparse.values);
      const indexSize =
        typeof indices?.componentType === 'number'
          ? componentSizes[indices.componentType]
          : undefined;
      if (!Number.isSafeInteger(sparseCount) || !indexSize || !values) throwInvalidGlb(assetId);
      decodedGeometryBytes += (sparseCount as number) * (indexSize + itemSize * componentSize);
    }
    if (!Number.isSafeInteger(decodedGeometryBytes)) throwInvalidGlb(assetId);
  }
  if (decodedGeometryBytes > MAX_DECODED_GEOMETRY_BYTES_PER_ASSET)
    throw new Error(
      `Asset ${assetId} decoded geometry is estimated at ${decodedGeometryBytes} bytes, above the per-asset safety limit ${MAX_DECODED_GEOMETRY_BYTES_PER_ASSET}.`,
    );
  return { triangles, primitiveCount, decodedGeometryBytes };
}

function measureParsedGeometry(scene: Object3D): GlbGeometryMetrics {
  const geometries = new Set<BufferGeometry>();
  let triangles = 0;
  let primitiveCount = 0;
  scene.traverse((object) => {
    if (!(object as Object3D & { isMesh?: boolean }).isMesh) return;
    const renderable = object as Object3D & { geometry?: BufferGeometry };
    if (!renderable.geometry) return;
    primitiveCount += 1;
    const geometry = renderable.geometry;
    const index = geometry.index;
    if (index) triangles += Math.floor(index.count / 3);
    else if (geometry.getAttribute('position'))
      triangles += Math.floor(geometry.getAttribute('position').count / 3);
    geometries.add(geometry);
  });
  let decodedGeometryBytes = 0;
  const countedArrays = new Set<ArrayBufferView>();
  for (const geometry of geometries) {
    const attributes = [
      ...Object.values(geometry.attributes),
      ...(geometry.index ? [geometry.index] : []),
      ...Object.values(geometry.morphAttributes).flatMap((morphs) => morphs ?? []),
    ];
    for (const attribute of attributes) {
      const data = 'data' in attribute ? attribute.data.array : attribute.array;
      if (!countedArrays.has(data)) {
        countedArrays.add(data);
        decodedGeometryBytes += data.byteLength;
      }
    }
  }
  return { triangles, primitiveCount, decodedGeometryBytes };
}

async function digestSha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('This browser does not provide Web Crypto SHA-256.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function defaultBaseUrl(): string {
  const currentUrl = globalThis.location?.href ?? 'http://localhost/';
  return new URL('.', currentUrl).href;
}

function defaultParser(): (bytes: ArrayBuffer, resourcePath: string) => Promise<GLTF> {
  const loader = new GLTFLoader();
  return (bytes, resourcePath) => loader.parseAsync(bytes, resourcePath);
}

function objectUrl(record: ModelAssetRecord, baseUrl: string): URL {
  const base = new URL(baseUrl, globalThis.location?.href ?? 'http://localhost/');
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`;
  const url = new URL(record.runtimePath, base);
  if (url.origin !== base.origin || url.username !== '' || url.password !== '')
    throw new Error(`Asset ${record.id} must resolve to the same origin.`);
  return url;
}

function cloneFrozen<T>(value: T): T {
  const cloned = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      for (const nested of Object.values(item)) freeze(nested);
      Object.freeze(item);
    }
  };
  freeze(cloned);
  return cloned;
}

function findTextureValues(material: Material): readonly [string, Texture][] {
  const textures: [string, Texture][] = [];
  for (const [key, value] of Object.entries(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture === true)
      textures.push([key, value as Texture]);
  }
  return textures;
}

function applyMaterialOverride(material: Material, override: MaterialOverride | undefined): void {
  if (!override) return;
  const values = material as Material & {
    color?: { set(value: string): void };
    emissive?: { set(value: string): void };
    roughness?: number;
    metalness?: number;
    emissiveIntensity?: number;
  };
  if (override.color !== undefined) values.color?.set(override.color);
  if (override.roughness !== undefined && values.roughness !== undefined)
    values.roughness = override.roughness;
  if (override.metalness !== undefined && values.metalness !== undefined)
    values.metalness = override.metalness;
  if (override.emissive !== undefined) values.emissive?.set(override.emissive);
  if (override.emissiveIntensity !== undefined && values.emissiveIntensity !== undefined)
    values.emissiveIntensity = override.emissiveIntensity;
  if (override.opacity !== undefined) material.opacity = override.opacity;
  if (override.transparent !== undefined) material.transparent = override.transparent;
  material.needsUpdate = true;
}

function ownCloneResources(root: Object3D, override?: MaterialOverride): LeaseResources {
  const resources: LeaseResources = {
    materials: new Set(),
    skeletons: new Set(),
  };
  const materials = new Map<Material, Material>();

  root.traverse((object) => {
    const renderable = object as Object3D & {
      material?: Material | Material[];
    };
    if (renderable.material) {
      const cloneMaterial = (source: Material) => {
        let material = materials.get(source);
        if (!material) {
          material = source.clone();
          materials.set(source, material);
          resources.materials.add(material);
          applyMaterialOverride(material, override);
        }
        return material;
      };
      renderable.material = Array.isArray(renderable.material)
        ? renderable.material.map(cloneMaterial)
        : cloneMaterial(renderable.material);
    }

    if (object instanceof SkinnedMesh) resources.skeletons.add(object.skeleton);
  });
  return resources;
}

function disposeOwnedResources(root: Object3D, resources: LeaseResources): void {
  root.removeFromParent();
  for (const skeleton of resources.skeletons) skeleton.dispose();
  for (const material of resources.materials) material.dispose();
  resources.skeletons.clear();
  resources.materials.clear();
}

function disposeSource(gltf: GLTF): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  for (const scene of gltf.scenes) {
    scene.traverse((object) => {
      const renderable = object as Object3D & {
        geometry?: BufferGeometry;
        material?: Material | Material[];
      };
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) {
        for (const material of Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material]) {
          materials.add(material);
          for (const [, texture] of findTextureValues(material)) textures.add(texture);
        }
      }
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    });
  }
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function cloneLease(
  record: ModelAssetRecord,
  source: GLTF,
  materialOverride: MaterialOverride | undefined,
  onRelease: () => void,
): ModelLease {
  const clonedScene = cloneSkeleton(source.scene);
  const owned = ownCloneResources(clonedScene, materialOverride);
  const root = new Group();
  root.name = `asset:${record.id}`;
  root.quaternion.fromArray([...record.normalization.rootRotation]);
  root.scale.setScalar(record.normalization.metersPerUnit);
  root.add(clonedScene);
  const clipIds = source.animations.map((_clip, index) => animationClipId(index));
  let released = false;
  return {
    root,
    clips: Object.freeze([...source.animations]),
    clipIds: Object.freeze(clipIds),
    record,
    release() {
      if (released) return;
      released = true;
      root.removeFromParent();
      disposeOwnedResources(clonedScene, owned);
      onRelease();
    },
  };
}

function resolveRuntimePolicy(overrides: Partial<ModelRuntimePolicy> = {}): ModelRuntimePolicy {
  const policy = { ...DEFAULT_MODEL_RUNTIME_POLICY, ...overrides };
  for (const key of Object.keys(MAX_RUNTIME_POLICY) as (keyof typeof MAX_RUNTIME_POLICY)[]) {
    const value = policy[key];
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_RUNTIME_POLICY[key])
      throw new RangeError(
        `Runtime model policy ${key} must be a positive integer no greater than ${MAX_RUNTIME_POLICY[key]}.`,
      );
  }
  if (policy.maxTrianglesPerAsset > policy.maxSceneTriangles)
    throw new RangeError(
      'Per-asset triangle policy cannot exceed the active-scene triangle policy.',
    );
  if (typeof policy.allowUnapproved !== 'boolean')
    throw new TypeError('Runtime model policy allowUnapproved must be a boolean.');
  return Object.freeze(policy);
}

function formatRecordDiagnostics(
  diagnostics: readonly { readonly path: string; readonly message: string }[],
): string {
  return diagnostics.map(({ path, message }) => `${path}: ${message}`).join('; ');
}

export function createModelAssetLoader(
  authoredRecords: readonly unknown[],
  dependencies: ModelLoaderDependencies = {},
): ModelAssetLoader {
  const policy = resolveRuntimePolicy(dependencies.policy);
  const records = new Map<string, ModelAssetRecord>();
  for (const authored of authoredRecords) {
    const diagnostics = validateModelAssetRecord(authored, policy);
    if (diagnostics.length > 0)
      throw new Error(`Invalid model record: ${formatRecordDiagnostics(diagnostics)}.`);
    const record = cloneFrozen(authored) as ModelAssetRecord;
    if (records.has(record.id)) throw new Error(`Duplicate model asset ID: ${record.id}.`);
    records.set(record.id, record);
  }

  const fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
  const parse = dependencies.parse ?? defaultParser();
  const digest = dependencies.digest ?? digestSha256;
  const baseUrl = dependencies.baseUrl ?? defaultBaseUrl;
  const cache = new Map<string, CachedSource>();
  let disposed = false;
  let activeSceneTriangles = 0;
  let pendingSceneTriangles = 0;

  const cacheKey = (record: ModelAssetRecord) => `${record.id}:${record.outputSha256}`;
  const cachedGeometryBytes = () =>
    [...cache.values()].reduce((sum, entry) => sum + entry.decodedGeometryBytes, 0);

  function disposeUnusedEntry(entry: CachedSource): void {
    if (entry.waiters > 0 || entry.leases > 0 || !entry.settled) return;
    if (cache.get(entry.key) === entry) cache.delete(entry.key);
    if (entry.source) {
      disposeSource(entry.source);
      delete entry.source;
    }
    entry.retired = true;
  }

  const loadSource = (record: ModelAssetRecord): CachedSource => {
    const key = cacheKey(record);
    const cached = cache.get(key);
    if (cached) return cached;
    if (cache.size + 1 > policy.maxLoadedAssets)
      throw new Error(
        `Asset ${record.id} would load ${cache.size + 1} model revisions; the active-asset limit is ${policy.maxLoadedAssets}.`,
      );
    const initialGeometryBytes = record.metrics.estimatedDecodedBytes;
    if (cachedGeometryBytes() + initialGeometryBytes > policy.maxDecodedGeometryBytes)
      throw new Error(
        `Asset ${record.id} would use at least ${cachedGeometryBytes() + initialGeometryBytes} decoded bytes; the shared geometry limit is ${policy.maxDecodedGeometryBytes}.`,
      );
    const controller = new AbortController();
    const entry: CachedSource = {
      key,
      record,
      controller,
      promise: Promise.resolve(null as unknown as GLTF),
      waiters: 0,
      leases: 0,
      settled: false,
      retired: false,
      triangles: record.metrics.triangles,
      decodedGeometryBytes: initialGeometryBytes,
    };
    const url = objectUrl(record, baseUrl());
    const sourceBase = new URL('.', url).href;
    entry.promise = (async () => {
      const response = await fetcher(url, {
        signal: controller.signal,
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
      });
      if (response.url && new URL(response.url).origin !== url.origin)
        throw new Error(`Asset ${record.id} redirected to another origin.`);
      const bytes = await readLimited(
        response,
        MODEL_IMPORT_BUDGET.maxFileBytes,
        controller.signal,
      );
      if (record.metrics.outputBytes !== bytes.byteLength)
        throw new Error(`Asset ${record.id} byte length does not match its approved record.`);
      const hash = await digest(bytes);
      if (hash !== record.outputSha256)
        throw new Error(`Asset ${record.id} SHA-256 does not match its approved record.`);
      throwIfAborted(controller.signal);
      const document = assertSelfContainedGlb(bytes, record.id);
      const measured = inspectGlbGeometry(document, record.id);
      if (measured.triangles !== record.metrics.triangles)
        throw new Error(
          `Asset ${record.id} record reports ${record.metrics.triangles} triangles but its GLB contains ${measured.triangles}.`,
        );
      if (measured.primitiveCount !== record.metrics.primitiveCount)
        throw new Error(
          `Asset ${record.id} record reports ${record.metrics.primitiveCount} rendered primitives but its GLB contains ${measured.primitiveCount}.`,
        );
      if (measured.triangles > policy.maxTrianglesPerAsset)
        throw new Error(
          `Asset ${record.id} has ${measured.triangles} triangles; the per-asset limit is ${policy.maxTrianglesPerAsset}.`,
        );
      if (measured.decodedGeometryBytes > policy.maxDecodedGeometryBytes)
        throw new Error(
          `Asset ${record.id} geometry uses an estimated ${measured.decodedGeometryBytes} bytes; the shared geometry limit is ${policy.maxDecodedGeometryBytes}.`,
        );
      entry.triangles = measured.triangles;
      entry.decodedGeometryBytes = measured.decodedGeometryBytes;
      if (cachedGeometryBytes() > policy.maxDecodedGeometryBytes)
        throw new Error(
          `Loading asset ${record.id} would use ${cachedGeometryBytes()} decoded geometry bytes; the shared geometry limit is ${policy.maxDecodedGeometryBytes}.`,
        );
      const gltf = await parse(bytes, sourceBase);
      if (controller.signal.aborted) {
        disposeSource(gltf);
        throw abortError();
      }
      const parsedGeometry = measureParsedGeometry(gltf.scene);
      if (parsedGeometry.triangles !== record.metrics.triangles)
        throw new Error(
          `Asset ${record.id} record reports ${record.metrics.triangles} runtime triangles but the parsed scene contains ${parsedGeometry.triangles}.`,
        );
      if (parsedGeometry.primitiveCount !== record.metrics.primitiveCount)
        throw new Error(
          `Asset ${record.id} record reports ${record.metrics.primitiveCount} runtime primitives but the parsed scene contains ${parsedGeometry.primitiveCount}.`,
        );
      if (parsedGeometry.triangles > policy.maxTrianglesPerAsset) {
        disposeSource(gltf);
        throw new Error(
          `Asset ${record.id} has ${parsedGeometry.triangles} runtime triangles; the per-asset limit is ${policy.maxTrianglesPerAsset}.`,
        );
      }
      entry.triangles = parsedGeometry.triangles;
      entry.decodedGeometryBytes = Math.max(
        measured.decodedGeometryBytes,
        parsedGeometry.decodedGeometryBytes,
      );
      if (cachedGeometryBytes() > policy.maxDecodedGeometryBytes) {
        disposeSource(gltf);
        throw new Error(
          `Loading asset ${record.id} would use ${cachedGeometryBytes()} decoded geometry bytes; the shared geometry limit is ${policy.maxDecodedGeometryBytes}.`,
        );
      }
      return gltf;
    })()
      .then((gltf) => {
        entry.settled = true;
        entry.source = gltf;
        return gltf;
      })
      .catch((error: unknown) => {
        entry.settled = true;
        if (cache.get(key) === entry) cache.delete(key);
        throw error;
      });
    cache.set(key, entry);
    return entry;
  };

  return {
    async load(assetId, signal, options = {}) {
      if (disposed) throw new Error('Model asset loader is disposed.');
      throwIfAborted(signal);
      const record = records.get(assetId);
      if (!record) throw new Error(`Unknown model asset ID: ${assetId}.`);
      const declaredTriangles = record.metrics.triangles;
      if (
        activeSceneTriangles + pendingSceneTriangles + declaredTriangles >
        policy.maxSceneTriangles
      )
        throw new Error(
          `Loading asset ${assetId} would raise active scene geometry to ${activeSceneTriangles + pendingSceneTriangles + declaredTriangles} triangles; the scene limit is ${policy.maxSceneTriangles}.`,
        );
      pendingSceneTriangles += declaredTriangles;
      let entry: CachedSource | null = null;
      let reservationCommitted = false;
      try {
        const requestEntry = loadSource(record);
        entry = requestEntry;
        requestEntry.waiters += 1;
        let source: GLTF;
        try {
          source = await withAbort(requestEntry.promise, signal);
        } finally {
          requestEntry.waiters -= 1;
          if (!requestEntry.settled && requestEntry.waiters === 0) {
            if (cache.get(requestEntry.key) === requestEntry) cache.delete(requestEntry.key);
            requestEntry.retired = true;
            requestEntry.controller.abort();
          }
        }
        throwIfAborted(signal);
        if (disposed) throw new Error('Model asset loader is disposed.');
        const actualTriangles = requestEntry.triangles;
        if (actualTriangles !== record.metrics.triangles)
          throw new Error(
            `Asset ${assetId} record reports ${record.metrics.triangles} runtime triangles but the parsed GLB contains ${actualTriangles}.`,
          );
        const nextSceneTriangles =
          activeSceneTriangles + pendingSceneTriangles - declaredTriangles + actualTriangles;
        if (nextSceneTriangles > policy.maxSceneTriangles)
          throw new Error(
            `Loading asset ${assetId} would raise active scene geometry to ${nextSceneTriangles} triangles; the scene limit is ${policy.maxSceneTriangles}.`,
          );
        const lease = cloneLease(record, source, options.materialOverride, () => {
          requestEntry.leases -= 1;
          activeSceneTriangles -= actualTriangles;
          disposeUnusedEntry(requestEntry);
        });
        pendingSceneTriangles -= declaredTriangles;
        activeSceneTriangles += actualTriangles;
        requestEntry.leases += 1;
        reservationCommitted = true;
        return lease;
      } catch (error) {
        if (!reservationCommitted) pendingSceneTriangles -= declaredTriangles;
        if (entry) disposeUnusedEntry(entry);
        throw error;
      }
    },
    replace(authored) {
      if (disposed) throw new Error('Model asset loader is disposed.');
      const diagnostics = validateModelAssetRecord(authored, policy);
      if (diagnostics.length > 0)
        throw new Error(`Invalid model record: ${formatRecordDiagnostics(diagnostics)}.`);
      const replacement = cloneFrozen(authored) as ModelAssetRecord;
      const existing = records.get(replacement.id);
      if (!existing) throw new Error(`Cannot replace unknown model asset ID: ${replacement.id}.`);
      if (existing.outputSha256 === replacement.outputSha256) {
        records.set(replacement.id, replacement);
        return;
      }
      records.set(replacement.id, replacement);
      const oldEntry = cache.get(cacheKey(existing));
      if (oldEntry) {
        oldEntry.retired = true;
        disposeUnusedEntry(oldEntry);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of cache.values()) {
        entry.retired = true;
        if (!entry.settled) entry.controller.abort();
        disposeUnusedEntry(entry);
      }
    },
  };
}
