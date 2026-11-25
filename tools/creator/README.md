# Waypoint RPG Creator

Offline-first developer tooling for importing local game assets and creating
portable RPG projects. The CLI uses downloaded local files; it does not need a
provider account or a remote asset service.

## Import a model

```sh
waypoint-rpg asset import \
  --source ./downloads/guardian.glb \
  --metadata ./assets/guardian.asset.json \
  --output-directory ./public/models \
  --manifest ./assets/asset-records.json
```

The source can be GLB or glTF 2.0 with local files. Import creates a
self-contained runtime GLB. Metadata records provenance, license rights,
normalization, and any existing semantic clip mapping. The clip inventory is
reported separately; source clip names are not rewritten to imply game meaning.
Use `--replace` to intentionally replace a changed model with the same stable
asset ID. `--require-release-approval` enforces the legacy release approval
flag; otherwise import is a technical step and does not grant release approval.

Trusted local tooling may call `importModel` with `preserveGlbBytes: true` for a
self-contained GLB. This inspects the source while copying its bytes unchanged,
so the source and runtime SHA-256 values must match. The default per-asset limit
is 60,000 triangles. A local pilot may explicitly pass `budget: {
maxTriangles: 400000 }`; all other resource limits remain at or below their
hard defaults. Budget values must come from trusted developer configuration,
not asset metadata.

FBX, OBJ, and Blender source files are not parsed directly. Convert them locally
to glTF/GLB with the documented optional Blender workflow first.

The `scripts/import-model.mjs` repository command remains as a compatibility
wrapper for the existing scene-demo registry. New projects should use this
package CLI and their own paths.

## Shared asset catalog

The `waypoint-rpg-creator/asset-catalog` public ESM entry provides a versioned
JSON catalog and immutable transition helpers. Technical inspection moves an
asset through `specified`, `sourced/generated`, `imported`, and `validated`.
Game approvals are stored separately and tied to the inspected runtime SHA-256;
each consuming game must provide its own rights review and release evidence.
Opening or previewing a model does not grant approval.

```js
import {
  addSpecifiedAsset,
  createAssetCatalog,
  serializeAssetCatalog,
} from 'waypoint-rpg-creator/asset-catalog';

const catalog = addSpecifiedAsset(createAssetCatalog(), {
  id: 'garden-guardian',
  category: 'animated-model',
  description: 'Guardian character for the Garden sample.',
  consumerGameIds: ['garden-adventure'],
});
```

Store catalog file paths relative to the catalog root. `verifyAssetFiles` checks
source/runtime hashes, evidence-file presence, and symlink confinement. Owned
AI-generated assets need their actual ownership evidence recorded; they are not
implicitly CC0.

## Generate and validate a game

The `waypoint-rpg-creator/game-project` ESM entry defines the versioned
`game.project.json` contract and single-scene starter. The core package is
required; narrative and tactical gameplay packages are optional and installed
only when selected. The starter uses a game-owned state reducer, one 3D scene,
DOM controls, and local package tarballs. It does not copy another sample's
runtime.

Pack the desired framework modules, then pass those local archives to the
creator. This does not contact a package registry or model provider:

```sh
npm pack --ignore-scripts --workspace=packages/core --pack-destination ./archives
npm pack --ignore-scripts --workspace=packages/narrative --pack-destination ./archives
waypoint-rpg game create --directory "./games/Leaf Story" --id leaf-story \
  --name "Leaf Story" --packages core,narrative \
  --core-tarball ./archives/waypoint-rpg-core-0.1.0.tgz \
  --narrative-tarball ./archives/waypoint-rpg-narrative-0.1.0.tgz
waypoint-rpg game validate "./games/Leaf Story"
waypoint-rpg game inspect "./games/Leaf Story"
waypoint-rpg game build "./games/Leaf Story"
waypoint-rpg game test "./games/Leaf Story"
waypoint-rpg game capture "./games/Leaf Story"
```

Use `--packages core` for a narrative-free project. A tactical project selects
`--packages core,gameplay` and supplies the matching gameplay archive. Project
paths are portable relative paths; IDs use lowercase kebab-case. Creation
refuses to replace an existing destination. The generated `vendor/` tarballs
are local install inputs, not published assets; `.gitignore` excludes them by
default. Developer tools (Vite, React, TypeScript, Vitest, and Playwright) are
separate from framework runtime packages. After the developer toolchain and
package archives are present in the local cache, run `npm ci --offline` in the
generated project. The generated lockfile pins the template toolchain and local
framework archives. If a first-time developer-tool install has not populated
the npm cache, bootstrap that toolchain once while online; later installs use
the locked cache without a registry connection.

## Verify generated projects independently

From the repository root, run:

```sh
npm run creator:test
npm run creator:import-consumer
npm run framework:generated-games
```

The generated-game gate builds and packs the core, narrative, gameplay, and
creator artifacts once, then reuses those exact archives for both generated
consumers. The narrative fixture installs core+narrative and the tactical
fixture installs core+gameplay; each runs outside the workspace with offline
package installation, public-root/deep-import and source-boundary checks,
NodeNext/Bundler declaration probes, unit tests, production build, and Chromium
save/reload/playthrough tests. `docs/previews/creator/` receives screenshots
from the rendered consumers. These are verification fixtures, not portfolio
releases. CI runs this focused gate and uploads the screenshots as an artifact
for manual review; it does not create a pull request or change release approval.

Manifest validation checks package roots, locale and save declarations,
scene/map/start-anchor consistency, local project paths, asset catalog
references, script names, and required framework archives. Timeline references
are rejected in schema version 1 because the runtime timeline contract is not
yet public. Kids RPG World Builder v1 remains application-owned and is not
rewritten by this template.

## Local model preview

Start the creator preview from the repository root:

```sh
npm run creator:preview
```

It opens bundled technical fixtures by default. To inspect a game project, point
the preview server at its root and open
`http://127.0.0.1:4175/?records=/__creator/asset-records.json`:

```powershell
$env:WAYPOINT_CREATOR_GAME_ROOT = (Resolve-Path .).Path
npm run creator:preview
```

The preview reads that project's local `assets/asset-records.json` and `public/`
model files. It validates the local manifest, does not fetch external asset
resources, and never changes approval metadata. Its browser panel provides
orbit/zoom, two independent instances, source clip and semantic mapping controls,
reduced-motion preview, geometry/material diagnostics, and observed renderer
resource counts. Capture the verified fixture screenshot with
`npm run creator:preview:test`.
