import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  createModelAssetLoader,
  MODEL_ASSET_SCHEMA_VERSION,
  type ModelAssetRecord,
} from 'waypoint-rpg-three';

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

function positionOnlyGlb(triangles: number, instances = 1): Uint8Array {
  const binaryByteLength = triangles * 3 * 3 * 4;
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: Array.from({ length: instances }, (_value, index) => index) }],
    nodes: Array.from({ length: instances }, () => ({ mesh: 0 })),
    buffers: [{ byteLength: binaryByteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binaryByteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: triangles * 3,
        type: 'VEC3',
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = (json.byteLength + 3) & ~3;
  const binaryLength = (binaryByteLength + 3) & ~3;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  return bytes;
}

const selfContainedGlb = glbDocument({
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    { count: 8, type: 'VEC3', componentType: 5126 },
    { count: 36, type: 'SCALAR', componentType: 5123 },
  ],
});

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
    estimatedDecodedBytes: 168,
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

function fakePositionOnlyGltf(triangles: number, instances = 1): GLTF {
  const scene = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles * 9), 3));
  for (let index = 0; index < instances; index += 1)
    scene.add(new Mesh(geometry, new MeshStandardMaterial()));
  return {
    scene,
    scenes: [scene],
    animations: [],
  } as unknown as GLTF;
}

function fakeRiggedGltf(): GLTF {
  const scene = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const rootBone = new Bone();
  rootBone.name = 'Root';
  const childBone = new Bone();
  childBone.name = 'Joint';
  rootBone.add(childBone);
  mesh.add(rootBone);
  mesh.bind(new Skeleton([rootBone, childBone]));
  scene.add(mesh);
  return {
    scene,
    scenes: [scene],
    animations: [new AnimationClip('', 1, []), new AnimationClip('Walk', 1, [])],
  } as unknown as GLTF;
}

function response(bytes = selfContainedGlb) {
  let consumed = false;
  return {
    ok: true,
    status: 200,
    url: 'http://localhost/models/fixture-model.glb',
    headers: {
      get: (name: string) => (name === 'content-length' ? String(bytes.byteLength) : null),
    },
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

describe('shared model asset loader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shares immutable geometry and texture while giving each lease isolated mutable materials', async () => {
    const source = fakeGltf();
    const sourceMesh = source.scene.children[0] as Mesh;
    const sourceGeometryDispose = vi.spyOn(sourceMesh.geometry, 'dispose');
    const sourceTextureDispose = vi.spyOn(
      (sourceMesh.material as MeshStandardMaterial).map!,
      'dispose',
    );
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
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    expect(firstMesh.material).not.toBe(secondMesh.material);
    expect((firstMesh.material as MeshStandardMaterial).map).toBe(
      (secondMesh.material as MeshStandardMaterial).map,
    );
    expect(first.root.scale.x).toBe(2);
    expect(first.clipIds).toEqual(['clip-1']);
    const sourcePositions = [...firstMesh.geometry.attributes.position!.array];
    first.root.position.set(4, 5, 6);
    expect(second.root.position.toArray()).toEqual([0, 0, 0]);
    expect([...firstMesh.geometry.attributes.position!.array]).toEqual(sourcePositions);
    const scene = new Group();
    scene.add(first.root);

    first.release();
    first.release();
    expect(first.root.parent).toBeNull();
    expect(sourceGeometryDispose).not.toHaveBeenCalled();
    expect(sourceTextureDispose).not.toHaveBeenCalled();
    expect(secondMesh.geometry.attributes.position).toBeDefined();
    second.release();
    expect(sourceGeometryDispose).toHaveBeenCalledTimes(1);
    expect(sourceTextureDispose).toHaveBeenCalledTimes(1);
    loader.dispose();
    expect(sourceGeometryDispose).toHaveBeenCalledTimes(1);
    expect(sourceTextureDispose).toHaveBeenCalledTimes(1);
  });

  it('lets one concurrent consumer cancel without aborting another consumer', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    let fetchSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });
    });
    const parse = vi.fn(async () => fakeGltf());
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse,
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = loader.load(record.id, firstController.signal);
    const second = loader.load(record.id, secondController.signal);
    await vi.waitFor(() => expect(fetchSignal).toBeDefined());

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal?.aborted).toBe(false);

    resolveResponse?.(response());
    const retained = await second;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    retained.release();
    loader.dispose();
  });

  it('isolates per-instance material overrides from another lease', async () => {
    const source = fakeGltf();
    const sourceMaterial = (source.scene.children[0] as Mesh).material as MeshStandardMaterial;
    const loader = createModelAssetLoader([record], {
      fetcher: async () => response(),
      parse: async () => source,
      digest: async () => record.outputSha256,
      baseUrl: () => 'http://localhost/',
    });

    const [colored, untouched] = await Promise.all([
      loader.load(record.id, new AbortController().signal, {
        materialOverride: { color: '#b88a47', roughness: 0.7, metalness: 0.2 },
      }),
      loader.load(record.id, new AbortController().signal),
    ]);
    const coloredMaterial = (colored.root.getObjectByProperty('type', 'Mesh') as Mesh)
      .material as MeshStandardMaterial;
    const untouchedMaterial = (untouched.root.getObjectByProperty('type', 'Mesh') as Mesh)
      .material as MeshStandardMaterial;

    expect(coloredMaterial).not.toBe(untouchedMaterial);
    expect(coloredMaterial.color.getHexString()).toBe('b88a47');
    expect(coloredMaterial.roughness).toBe(0.7);
    expect(untouchedMaterial.color.getHexString()).toBe('ffffff');
    expect(sourceMaterial.color.getHexString()).toBe('ffffff');
    colored.release();
    untouched.release();
    loader.dispose();
  });

  it('loads a replacement revision by hash while an older lease remains usable', async () => {
    const replacement: ModelAssetRecord = {
      ...record,
      runtimePath: 'models/replacement-fixture-model.glb',
      outputSha256: 'c'.repeat(64),
    };
    let digestCalls = 0;
    const fetcher = vi.fn(async () => response());
    const loader = createModelAssetLoader([record], {
      fetcher,
      parse: async () => fakeGltf(),
      digest: async () => (++digestCalls === 1 ? record.outputSha256 : replacement.outputSha256),
      baseUrl: () => 'http://localhost/',
    });

    const oldLease = await loader.load(record.id, new AbortController().signal);
    loader.replace(replacement);
    const newLease = await loader.load(record.id, new AbortController().signal);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(oldLease.record.outputSha256).toBe(record.outputSha256);
    expect(newLease.record.outputSha256).toBe(replacement.outputSha256);
    expect(oldLease.root.children).toHaveLength(1);
    expect(newLease.root.children).toHaveLength(1);
    oldLease.release();
    newLease.release();
    loader.dispose();
  });

  it('uses a trusted high-poly local policy for static position-only GLBs without changing attributes', async () => {
    const triangles = 60_001;
    const bytes = positionOnlyGlb(triangles);
    const localRecord: ModelAssetRecord = {
      ...record,
      id: 'pilot-position-only',
      runtimePath: 'models/pilot-position-only.glb',
      outputSha256: 'd'.repeat(64),
      rights: { ...record.rights, approved: false },
      metrics: {
        ...record.metrics,
        outputBytes: bytes.byteLength,
        triangles,
        estimatedDecodedBytes: triangles * 3 * 3 * 4,
      },
      clipInventory: [],
      clips: {},
      fallbackAction: 'static',
    };
    const defaultLoader = () =>
      createModelAssetLoader([localRecord], {
        fetcher: async () => response(bytes),
        parse: async () => fakePositionOnlyGltf(triangles),
        digest: async () => localRecord.outputSha256,
        baseUrl: () => 'http://localhost/',
      });
    expect(defaultLoader).toThrow(/60001.*60000/);

    const loader = createModelAssetLoader([localRecord], {
      fetcher: async () => response(bytes),
      parse: async () => fakePositionOnlyGltf(triangles),
      digest: async () => localRecord.outputSha256,
      baseUrl: () => 'http://localhost/',
      policy: {
        maxTrianglesPerAsset: 400_000,
        maxLoadedAssets: 5,
        maxDecodedGeometryBytes: 32 * 1024 * 1024,
        maxSceneTriangles: 1_500_000,
        allowUnapproved: true,
      },
    });
    const lease = await loader.load(localRecord.id, new AbortController().signal);
    const mesh = lease.root.getObjectByProperty('type', 'Mesh') as Mesh;
    const positionAttribute = mesh.geometry.getAttribute('position');
    expect(lease.clips).toEqual([]);
    expect(mesh.geometry.getAttribute('normal')).toBeUndefined();
    const sourcePositionArray = positionAttribute.array;
    const before = [...sourcePositionArray];
    lease.root.rotation.y = 0.5;
    lease.root.scale.setScalar(3);
    expect(positionAttribute.array).toBe(sourcePositionArray);
    expect([...positionAttribute.array]).toEqual(before);
    expect(localRecord.rights.approved).toBe(false);
    lease.release();
    loader.dispose();
  });

  it('counts each scene instance while sharing its decoded geometry', async () => {
    const glb = positionOnlyGlb(12, 2);
    const instancedRecord: ModelAssetRecord = {
      ...record,
      id: 'reused-mesh-instances',
      runtimePath: 'models/reused-mesh-instances.glb',
      outputSha256: 'e'.repeat(64),
      metrics: { ...record.metrics, outputBytes: glb.byteLength, triangles: 24, primitiveCount: 2 },
    };
    const loader = createModelAssetLoader([instancedRecord], {
      fetcher: async () => response(glb),
      parse: async () => fakePositionOnlyGltf(12, 2),
      digest: async () => instancedRecord.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const lease = await loader.load(instancedRecord.id, new AbortController().signal);
    const meshes = lease.root.children[0]!.children as Mesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes[0]!.geometry).toBe(meshes[1]!.geometry);
    lease.release();
    loader.dispose();
  });

  it('enforces aggregate loaded-asset, decoded-geometry, and active-scene budgets', async () => {
    const secondRecord: ModelAssetRecord = {
      ...record,
      id: 'second-fixture-model',
      runtimePath: 'models/second-fixture-model.glb',
      outputSha256: 'c'.repeat(64),
    };
    const records = [record, secondRecord];
    const dependencies = () => {
      let digestCalls = 0;
      return {
        fetcher: async () => response(),
        parse: async () => fakeGltf(),
        digest: async () =>
          ++digestCalls % 2 === 1 ? record.outputSha256 : secondRecord.outputSha256,
        baseUrl: () => 'http://localhost/',
      };
    };

    const sceneLimited = createModelAssetLoader(records, {
      ...dependencies(),
      policy: { maxTrianglesPerAsset: 12, maxSceneTriangles: 12 },
    });
    const firstSceneLease = await sceneLimited.load(record.id, new AbortController().signal);
    await expect(sceneLimited.load(secondRecord.id, new AbortController().signal)).rejects.toThrow(
      /scene limit is 12/,
    );
    firstSceneLease.release();
    const replacementSceneLease = await sceneLimited.load(
      secondRecord.id,
      new AbortController().signal,
    );
    replacementSceneLease.release();
    sceneLimited.dispose();

    const assetLimited = createModelAssetLoader(records, {
      ...dependencies(),
      policy: { maxLoadedAssets: 1 },
    });
    const firstAssetLease = await assetLimited.load(record.id, new AbortController().signal);
    await expect(assetLimited.load(secondRecord.id, new AbortController().signal)).rejects.toThrow(
      /active-asset limit is 1/,
    );
    firstAssetLease.release();
    const replacementAssetLease = await assetLimited.load(
      secondRecord.id,
      new AbortController().signal,
    );
    replacementAssetLease.release();
    assetLimited.dispose();

    const geometryLimited = createModelAssetLoader(records, {
      ...dependencies(),
      policy: { maxDecodedGeometryBytes: 1_000 },
    });
    const firstGeometryLease = await geometryLimited.load(record.id, new AbortController().signal);
    await expect(
      geometryLimited.load(secondRecord.id, new AbortController().signal),
    ).rejects.toThrow(/decoded bytes.*limit|geometry limit/i);
    firstGeometryLease.release();
    geometryLimited.dispose();
  });

  it('clones skeletons per lease and exposes deterministic clip IDs for unnamed source clips', async () => {
    const riggedRecord: ModelAssetRecord = {
      ...record,
      metrics: { ...record.metrics, jointCount: 2, skinCount: 1 },
      clipInventory: [
        { name: '', durationSeconds: 1 },
        { name: 'Walk', durationSeconds: 1 },
      ],
      clips: { idle: 'clip-1', move: 'Walk' },
    };
    const source = fakeRiggedGltf();
    const loader = createModelAssetLoader([riggedRecord], {
      fetcher: async () => response(),
      parse: async () => source,
      digest: async () => riggedRecord.outputSha256,
      baseUrl: () => 'http://localhost/',
    });
    const [first, second] = await Promise.all([
      loader.load(riggedRecord.id, new AbortController().signal),
      loader.load(riggedRecord.id, new AbortController().signal),
    ]);
    const firstMesh = first.root.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh;
    const secondMesh = second.root.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh;
    expect(first.clipIds).toEqual(['clip-1', 'clip-2']);
    expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton);
    expect(firstMesh.skeleton.bones[0]).not.toBe(secondMesh.skeleton.bones[0]);
    expect(firstMesh.skeleton.bones[0]).not.toBe(
      (source.scene.children[0] as SkinnedMesh).skeleton.bones[0],
    );
    first.release();
    second.release();
    loader.dispose();
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
