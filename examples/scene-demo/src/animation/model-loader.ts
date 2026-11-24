import { Group, SkinnedMesh } from 'three';
import type { AnimationClip, BufferGeometry, Material, Object3D, Skeleton, Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  MODEL_IMPORT_BUDGET,
  validateModelAssetRecord,
  type ModelAssetRecord,
} from './contracts.js';

export interface ModelLease {
  readonly root: Group;
  readonly clips: readonly AnimationClip[];
  readonly record: ModelAssetRecord;
  release(): void;
}

export interface ModelAssetLoader {
  load(assetId: string, signal: AbortSignal): Promise<ModelLease>;
  dispose(): void;
}

export interface ModelLoaderDependencies {
  readonly fetcher?: typeof fetch;
  readonly parse?: (bytes: ArrayBuffer, resourcePath: string) => Promise<GLTF>;
  readonly digest?: (bytes: ArrayBuffer) => Promise<string>;
  readonly baseUrl?: () => string;
}

interface CachedSource {
  readonly controller: AbortController;
  promise: Promise<GLTF>;
  source?: GLTF;
  waiters: number;
  settled: boolean;
}

interface OwnedResources {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly textures: Set<Texture>;
  readonly skeletons: Set<Skeleton>;
}

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

function assertSelfContainedGlb(bytes: ArrayBuffer, assetId: string): void {
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
}

async function digestSha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('This browser does not provide Web Crypto SHA-256.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function defaultBaseUrl(): string {
  const currentUrl = globalThis.location?.href ?? 'http://localhost/';
  return new URL(import.meta.env.BASE_URL, currentUrl).href;
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

function ownCloneResources(root: Object3D): OwnedResources {
  const resources: OwnedResources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    skeletons: new Set(),
  };
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const materials = new Map<Material, Material>();
  const textures = new Map<Texture, Texture>();

  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (renderable.geometry) {
      let geometry = geometries.get(renderable.geometry);
      if (!geometry) {
        geometry = renderable.geometry.clone();
        geometries.set(renderable.geometry, geometry);
        resources.geometries.add(geometry);
      }
      renderable.geometry = geometry;
    }

    if (renderable.material) {
      const cloneMaterial = (source: Material) => {
        let material = materials.get(source);
        if (!material) {
          material = source.clone();
          materials.set(source, material);
          resources.materials.add(material);
          for (const [key, sourceTexture] of findTextureValues(source)) {
            let texture = textures.get(sourceTexture);
            if (!texture) {
              texture = sourceTexture.clone();
              textures.set(sourceTexture, texture);
              resources.textures.add(texture);
            }
            (material as unknown as Record<string, unknown>)[key] = texture;
          }
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

function disposeOwnedResources(root: Object3D, resources: OwnedResources): void {
  root.removeFromParent();
  for (const skeleton of resources.skeletons) skeleton.dispose();
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
  for (const texture of resources.textures) texture.dispose();
  resources.skeletons.clear();
  resources.geometries.clear();
  resources.materials.clear();
  resources.textures.clear();
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

function cloneLease(record: ModelAssetRecord, source: GLTF): ModelLease {
  const clonedScene = cloneSkeleton(source.scene);
  const owned = ownCloneResources(clonedScene);
  const root = new Group();
  root.name = `asset:${record.id}`;
  root.quaternion.fromArray([...record.normalization.rootRotation]);
  root.scale.setScalar(record.normalization.metersPerUnit);
  root.add(clonedScene);
  let released = false;
  return {
    root,
    clips: Object.freeze([...source.animations]),
    record,
    release() {
      if (released) return;
      released = true;
      disposeOwnedResources(clonedScene, owned);
    },
  };
}

export function createModelAssetLoader(
  authoredRecords: readonly unknown[],
  dependencies: ModelLoaderDependencies = {},
): ModelAssetLoader {
  const records = new Map<string, ModelAssetRecord>();
  for (const authored of authoredRecords) {
    const diagnostics = validateModelAssetRecord(authored);
    if (diagnostics.length > 0)
      throw new Error(`Invalid model record: ${diagnostics.map(({ path }) => path).join(', ')}.`);
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

  const loadSource = (record: ModelAssetRecord): CachedSource => {
    const cached = cache.get(record.id);
    if (cached) return cached;
    const controller = new AbortController();
    const entry: CachedSource = {
      controller,
      promise: Promise.resolve(null as unknown as GLTF),
      waiters: 0,
      settled: false,
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
      assertSelfContainedGlb(bytes, record.id);
      const gltf = await parse(bytes, sourceBase);
      if (controller.signal.aborted) {
        disposeSource(gltf);
        throw abortError();
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
        if (cache.get(record.id) === entry) cache.delete(record.id);
        throw error;
      });
    cache.set(record.id, entry);
    return entry;
  };

  return {
    async load(assetId, signal) {
      if (disposed) throw new Error('Model asset loader is disposed.');
      throwIfAborted(signal);
      const record = records.get(assetId);
      if (!record) throw new Error(`Unknown model asset ID: ${assetId}.`);
      const entry = loadSource(record);
      entry.waiters += 1;
      let source: GLTF;
      try {
        source = await withAbort(entry.promise, signal);
      } finally {
        entry.waiters -= 1;
        if (!entry.settled && entry.waiters === 0) {
          if (cache.get(record.id) === entry) cache.delete(record.id);
          entry.controller.abort();
        }
      }
      throwIfAborted(signal);
      if (disposed) throw new Error('Model asset loader is disposed.');
      return cloneLease(record, source);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [id, entry] of cache) {
        if (!entry.settled) entry.controller.abort();
        else if (entry.source) disposeSource(entry.source);
        cache.delete(id);
      }
    },
  };
}
