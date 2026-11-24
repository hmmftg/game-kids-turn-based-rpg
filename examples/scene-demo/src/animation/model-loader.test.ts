import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_ASSET_SCHEMA_VERSION, type ModelAssetRecord } from './contracts.js';
import { createModelAssetLoader } from './model-loader.js';

function glbDocument(document: Record<string, unknown>): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = (json.byteLength + 3) & ~3;
  const bytes = new Uint8Array(20 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  return bytes;
}

const selfContainedGlb = glbDocument({ asset: { version: '2.0' }, scene: 0, scenes: [{}] });

const record: ModelAssetRecord = {
  schemaVersion: MODEL_ASSET_SCHEMA_VERSION,
  id: 'fixture-model',
  runtimePath: 'models/fixture-model.glb',
  runtimeFormat: 'glb',
  sourceFormat: 'glb',
  sourceOrigin: 'Local test fixture.',
  sourceSha256: 'a'.repeat(64),
  outputSha256: 'b'.repeat(64),
  importer: 'test',
  importerVersion: '1',
  conversionOptions: {
    outputFormat: 'glb',
    preserveSkinning: true,
    preserveMorphTargets: true,
    preserveAnimations: true,
  },
  rights: {
    licenseId: 'MIT',
    attribution: 'Test fixture.',
    commercialUse: true,
    redistribution: true,
    approved: true,
  },
  normalization: {
    metersPerUnit: 2,
    sourceUpAxis: 'Y',
    sourceForwardAxis: '-Z',
    upAxis: 'Y',
    forwardAxis: '-Z',
    rootRotation: [0, 0, 0, 1],
  },
  bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
  metrics: {
    sourceBytes: 4,
    outputBytes: selfContainedGlb.byteLength,
    triangles: 12,
    primitiveCount: 1,
    textureCount: 0,
    textureBytes: 0,
    maxTextureDimension: 0,
    jointCount: 0,
    skinCount: 0,
    morphTargetNames: [],
    estimatedDecodedBytes: 4,
  },
  extensions: [],
  materialNames: ['Fixture'],
  clipInventory: [{ name: 'Idle', durationSeconds: 1 }],
  clips: { idle: 'Idle' },
  fallbackAction: 'idle',
  warnings: [],
};

function fakeGltf(): GLTF {
  const scene = new Group();
  const texture = new Texture({ width: 2, height: 2 });
  const material = new MeshStandardMaterial({ map: texture });
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  scene.add(mesh);
  return {
    scene,
    scenes: [scene],
    animations: [new AnimationClip('Idle', 1, [])],
  } as unknown as GLTF;
}

function response(bytes = selfContainedGlb) {
  let consumed = false;
  return {
    ok: true,
    status: 200,
    url: 'http://localhost/models/fixture-model.glb',
    headers: { get: (name: string) => (name === 'content-length' ? '4' : null) },
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: bytes };
        },
        cancel: async () => {},
        releaseLock: () => {},
      }),
    },
  } as unknown as Response;
}

describe('example model asset loader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares one immutable parse while giving each lease isolated mutable resources', async () => {
    const source = fakeGltf();
    const sourceMesh = source.scene.children[0] as Mesh;
    const sourceGeometryDispose = vi.spyOn(sourceMesh.geometry, 'dispose');
    const fetcher = vi.fn(async () => response());
    const parse = vi.fn(async () => source);
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse,
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });

    const [first, second] = await Promise.all([
      loader.load(record.id, new AbortController().signal),
      loader.load(record.id, new AbortController().signal),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(first.root).not.toBe(second.root);
    const firstMesh = first.root.getObjectByProperty('type', 'Mesh') as Mesh;
    const secondMesh = second.root.getObjectByProperty('type', 'Mesh') as Mesh;
    expect(firstMesh.geometry).not.toBe(secondMesh.geometry);
    expect(firstMesh.material).not.toBe(secondMesh.material);
    expect((firstMesh.material as MeshStandardMaterial).map).not.toBe(
      (secondMesh.material as MeshStandardMaterial).map,
    );
    expect(first.root.scale.x).toBe(2);

    const firstGeometryDispose = vi.spyOn(firstMesh.geometry, 'dispose');
    first.release();
    first.release();
    expect(firstGeometryDispose).toHaveBeenCalledTimes(1);
    expect(sourceGeometryDispose).not.toHaveBeenCalled();
    expect(secondMesh.geometry.attributes.position).toBeDefined();
    second.release();
    loader.dispose();
    expect(sourceGeometryDispose).toHaveBeenCalledTimes(1);
  });

  it('rejects unregistered assets and content whose hash differs from the approved record', async () => {
    let digestCalls = 0;
    const fetcher = vi.fn(async () => response());
    const parse = vi.fn(async () => fakeGltf());
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse,
      digest: async () => (++digestCalls === 1 ? 'c'.repeat(64) : record.outputSha256),
      baseUrl: () => 'http://localhost/',
    });
    await expect(loader.load('not-registered', new AbortController().signal)).rejects.toThrow(
      'Unknown model asset ID',
    );
    await expect(loader.load(record.id, new AbortController().signal)).rejects.toThrow(
      'SHA-256 does not match',
    );
    const retried = await loader.load(record.id, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledTimes(1);
    retried.release();
    loader.dispose();
    await expect(loader.load(record.id, new AbortController().signal)).rejects.toThrow('disposed');
  });

  it('rejects runtime GLBs with external resources before invoking the parser', async () => {
    const externalGlb = glbDocument({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{}],
      buffers: [{ uri: 'textures/remote.bin', byteLength: 4 }],
    });
    const externalRecord = {
      ...record,
      metrics: { ...record.metrics, outputBytes: externalGlb.byteLength },
    };
    const parse = vi.fn(async () => fakeGltf());
    const loader = createModelAssetLoader([externalRecord], {
      fetcher: async () => response(externalGlb),
      parse,
      digest: async () => externalRecord.outputSha256,
      baseUrl: () => 'http://localhost/',
    });

    await expect(loader.load(record.id, new AbortController().signal)).rejects.toThrow(
      'Runtime GLB must be self-contained',
    );
    expect(parse).not.toHaveBeenCalled();
    loader.dispose();
  });

  it('cancels an abandoned pending request and permits a clean retry', async () => {
    let fetchSignal: AbortSignal | undefined;
    let requests = 0;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requests += 1;
      fetchSignal = init?.signal as AbortSignal;
      if (requests > 1) return Promise.resolve(response());
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse: async () => fakeGltf(),
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const controller = new AbortController();
    const pending = loader.load(record.id, controller.signal);
    await vi.waitFor(() => expect(fetchSignal).toBeDefined());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetchSignal?.aborted).toBe(true));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const retried = await loader.load(record.id, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
    retried.release();
    loader.dispose();
  });

  it('disposes a parsed result that arrives after its request was cancelled', async () => {
    const source = fakeGltf();
    const sourceMesh = source.scene.children[0] as Mesh;
    const sourceGeometryDispose = vi.spyOn(sourceMesh.geometry, 'dispose');
    let resolveParse: ((gltf: GLTF) => void) | undefined;
    let notifyParseStarted: (() => void) | undefined;
    const parseStarted = new Promise<void>((resolve) => {
      notifyParseStarted = resolve;
    });
    const loader = createModelAssetLoader([record], {
      fetcher: async () => response(),
      parse: async () => {
        notifyParseStarted?.();
        return new Promise<GLTF>((resolve) => {
          resolveParse = resolve;
        });
      },
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const controller = new AbortController();
    const pending = loader.load(record.id, controller.signal);
    await parseStarted;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolveParse?.(source);
    await vi.waitFor(() => expect(sourceGeometryDispose).toHaveBeenCalledTimes(1));
    loader.dispose();
  });

  it('starts a fresh same-ID request while an abandoned parse is still finishing', async () => {
    let resolveOldParse: ((gltf: GLTF) => void) | undefined;
    let notifyOldParseStarted: (() => void) | undefined;
    const oldParseStarted = new Promise<void>((resolve) => {
      notifyOldParseStarted = resolve;
    });
    let parseCalls = 0;
    const fetcher = vi.fn(async () => response());
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse: async () => {
        parseCalls += 1;
        if (parseCalls > 1) return fakeGltf();
        notifyOldParseStarted?.();
        return new Promise<GLTF>((resolve) => {
          resolveOldParse = resolve;
        });
      },
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const controller = new AbortController();
    const abandoned = loader.load(record.id, controller.signal);
    await oldParseStarted;
    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });

    const retryPromise = loader.load(record.id, new AbortController().signal);
    try {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2), { timeout: 100 });
      const retry = await retryPromise;
      expect(parseCalls).toBe(2);
      retry.release();
    } finally {
      resolveOldParse?.(fakeGltf());
      await Promise.allSettled([abandoned, retryPromise]);
      loader.dispose();
    }
  });
});
