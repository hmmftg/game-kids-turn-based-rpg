# waypoint-rpg-three

Verified, same-origin GLB loading for Three.js applications. The package checks
asset hashes before parsing, shares immutable source resources across leases,
and gives each lease its own transform tree, skeleton, and materials.

```ts
import { createModelAssetLoader } from 'waypoint-rpg-three';

const loader = createModelAssetLoader(assetRecords, {
  policy: {
    maxTrianglesPerAsset: 60_000,
    maxLoadedAssets: 20,
    maxDecodedGeometryBytes: 256 * 1024 * 1024,
    maxSceneTriangles: 300_000,
  },
});
const controller = new AbortController();
const lease = await loader.load('guardian', controller.signal);
scene.add(lease.root);
lease.release();
loader.dispose();
```

`resolveModelRuntimePolicy(policy, { mode: 'production' })` validates a complete
game-owned release policy with the same positive-integer limits and hard safety
ceilings enforced by the loader. It also requires an explicit `false` value for
`allowUnapproved`. Development tools such as a private local asset pilot can
use the default `runtime` mode for partial trusted overrides.

Three.js is a peer dependency so applications keep one renderer runtime. The
loader caches verified GLB revisions by asset ID and SHA-256. Each load returns
an independent transform tree and, for rigged models, an independent skeleton.
Immutable geometry and textures are shared; lease materials are cloned. Treat
shared geometry and textures as read-only. Use object transforms and
`materialOverride` options for per-instance presentation changes.

Call `release()` when an instance leaves the scene. It detaches the instance and
disposes its lease-owned materials and skeleton, then disposes the cached source
geometry and textures after the final lease is released. A request's abort signal only
cancels that consumer's wait; shared fetch work continues while another consumer
is waiting. `replace(record)` switches future loads to a new record revision
without invalidating leases on the previous hash.

Static GLBs need no animation metadata. Animated leases expose their original
clips and stable source-order IDs (`clip-1`, `clip-2`, …); semantic mappings may
also use a unique original clip name. Duplicate or unnamed source names must be
addressed by stable ID. `createCharacterAnimationController` gives each scene
instance independent semantic state, bounded idle playback, cross-fades,
interruptions, reduced-motion poses, and explicit cleanup. The exported
timeline compiler/player validates game-owned camera, animation, dialogue,
audio, effect, and wait cues; games own the choreography and cue presentation.

The optional runtime policy is trusted application configuration. Records and
URL parameters never alter it. Defaults retain the 60,000-triangle per-asset
limit. The local Meshy pilot may pass an explicit higher policy from its
configured developer route; release consumers must use their game budgets and
independent rights approval evidence.
