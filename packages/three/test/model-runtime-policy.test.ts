import { describe, expect, it } from 'vitest';
import { resolveModelRuntimePolicy } from '../src/index.js';
import { createModelAssetLoader } from '../src/model-loader.js';

const production = { mode: 'production' } as const;
const completePolicy = {
  maxTrianglesPerAsset: 1_000_000,
  maxLoadedAssets: 64,
  maxDecodedGeometryBytes: 512 * 1024 * 1024,
  maxSceneTriangles: 4_000_000,
  allowUnapproved: false,
};

describe('resolveModelRuntimePolicy', () => {
  it('resolves a frozen runtime policy using the existing defaults', () => {
    const policy = resolveModelRuntimePolicy();

    expect(policy).toEqual({
      maxTrianglesPerAsset: 60_000,
      maxLoadedAssets: 20,
      maxDecodedGeometryBytes: 256 * 1024 * 1024,
      maxSceneTriangles: 300_000,
      allowUnapproved: false,
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('merges partial runtime overrides for the local Meshy pilot', () => {
    expect(
      resolveModelRuntimePolicy({ maxTrianglesPerAsset: 250_000, allowUnapproved: true }),
    ).toEqual({
      maxTrianglesPerAsset: 250_000,
      maxLoadedAssets: 20,
      maxDecodedGeometryBytes: 256 * 1024 * 1024,
      maxSceneTriangles: 300_000,
      allowUnapproved: true,
    });
  });

  it('accepts a complete production policy at the existing hard ceilings', () => {
    expect(resolveModelRuntimePolicy(completePolicy, production)).toEqual(completePolicy);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'policy'],
    ['a Date', new Date(0)],
    ['an inherited override', Object.create({ maxLoadedAssets: 4 })],
  ])('rejects %s as a policy object', (_label, value: unknown) => {
    expect(() => resolveModelRuntimePolicy(value)).toThrow(/plain object/);
  });

  it('rejects unknown policy keys', () => {
    expect(() => resolveModelRuntimePolicy({ maxLoadedAsset: 4 })).toThrow(/maxLoadedAsset/);
    expect(() => resolveModelRuntimePolicy({ [Symbol('extra')]: true })).toThrow(/Symbol\(extra\)/);
  });

  it.each([undefined, 0, 'false', null])(
    'rejects a non-boolean allowance (%j)',
    (allowUnapproved) => {
      expect(() => resolveModelRuntimePolicy({ allowUnapproved })).toThrow(/allowUnapproved/);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5', null, undefined])(
    'rejects invalid numeric limits (%j)',
    (maxLoadedAssets) => {
      expect(() => resolveModelRuntimePolicy({ maxLoadedAssets })).toThrow(/maxLoadedAssets/);
    },
  );

  it.each([
    ['maxTrianglesPerAsset', 1_000_001],
    ['maxLoadedAssets', 65],
    ['maxDecodedGeometryBytes', 512 * 1024 * 1024 + 1],
    ['maxSceneTriangles', 4_000_001],
  ])('rejects a %s value above its hard ceiling', (key, limit) => {
    expect(() => resolveModelRuntimePolicy({ ...completePolicy, [key]: limit })).toThrow(
      new RegExp(key),
    );
    expect(() =>
      resolveModelRuntimePolicy({ ...completePolicy, [key]: limit }, production),
    ).toThrow(new RegExp(key));
  });

  it('rejects a per-asset triangle cap above the active-scene cap', () => {
    expect(() => resolveModelRuntimePolicy({ maxSceneTriangles: 50_000 })).toThrow(
      /scene triangle/,
    );
    expect(() =>
      resolveModelRuntimePolicy({ ...completePolicy, maxSceneTriangles: 50_000 }, production),
    ).toThrow(/scene triangle/);
  });

  it.each(Object.keys(completePolicy))('requires an explicit %s in production', (key) => {
    const incompletePolicy = new Map(Object.entries(completePolicy));
    incompletePolicy.delete(key);

    expect(() =>
      resolveModelRuntimePolicy(Object.fromEntries(incompletePolicy), production),
    ).toThrow(new RegExp(key));
  });

  it('requires an explicit false allowance in production', () => {
    expect(() =>
      resolveModelRuntimePolicy({ ...completePolicy, allowUnapproved: true }, production),
    ).toThrow(/allowUnapproved.*false/);
  });
});

describe('createModelAssetLoader runtime policy', () => {
  it('rejects an unknown policy field before using any model assets', () => {
    const policy = { maxLoadedAssets: 4, maxLoadedAsset: 5 };

    expect(() => createModelAssetLoader([], { policy })).toThrow(/maxLoadedAsset/);
  });
});
