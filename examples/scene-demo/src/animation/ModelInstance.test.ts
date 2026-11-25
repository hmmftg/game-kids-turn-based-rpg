import { describe, expect, it } from 'vitest';
import type { ModelAssetLoader, ModelLease } from 'waypoint-rpg-three';
import { modelLeaseForRequest } from './model-instance-lease.js';

const loader = {} as ModelAssetLoader;
const lease = { release() {} } as ModelLease;
const loaded = { assetId: 'static', instanceId: 'preview', loader, lease };

describe('model instance lease selection', () => {
  it('never returns a prior asset lease for a changed asset ID', () => {
    expect(
      modelLeaseForRequest(loaded, { assetId: 'rigged', instanceId: 'preview', loader }),
    ).toBeNull();
  });

  it('keeps the lease only while its complete instance identity still matches', () => {
    expect(modelLeaseForRequest(loaded, { assetId: 'static', instanceId: 'preview', loader })).toBe(
      lease,
    );
    expect(
      modelLeaseForRequest(loaded, { assetId: 'static', instanceId: 'other', loader }),
    ).toBeNull();
    expect(
      modelLeaseForRequest(loaded, {
        assetId: 'static',
        instanceId: 'preview',
        loader: {} as ModelAssetLoader,
      }),
    ).toBeNull();
  });
});
