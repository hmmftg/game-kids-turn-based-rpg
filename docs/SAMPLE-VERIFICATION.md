# Sample and fixture verification

**Garden of Stories is the sole public-facing framework sample.** The root
Mahalle application remains a separate first-party product with its own
documentation, release, gameplay rules, and save system. Other applications
and projects stay in the repository to prove that the framework and creator
tools work independently; they are technical consumers, not a sample-game
portfolio.

## Capability ownership

| Consumer or fixture                 | Role                                               | Acceptance it retains                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/garden-adventure/`        | Flagship integration game                          | Core, narrative, gameplay, and Three package composition; both story outcomes; connected maps; inventory, progression, tactical combat, compatible saves; Garden-owned static/rigged GLB mapping, animation states, ending cinematics, fallback, RTL, and accessibility.                                    |
| Root Mahalle app                    | Independent first-party product                    | Child interaction contract, Persian RTL, IndexedDB profile lifecycle, migration, PWA/offline behavior, and its own optional-package integration. It is not folded into Garden.                                                                                                                              |
| `examples/hello-world/`             | Minimal consumer fixture                           | Core package root, runtime and persistence adapter without narrative/gameplay or the root app bundle.                                                                                                                                                                                                       |
| Generated narrative-only project    | Package fixture                                    | Narrative consumer builds from installed tarballs while omitting gameplay.                                                                                                                                                                                                                                  |
| Generated tactical-only project     | Package fixture                                    | Gameplay consumer builds from installed tarballs while omitting narrative.                                                                                                                                                                                                                                  |
| `examples/scene-demo/` / Blood Leaf | Independent narrative, scene and lifecycle fixture | Narrative choices/consequences, scene transitions, persistence, transaction rollback, two endings, and unique Phase 5 browser acceptance such as cancellation, reduced motion, renderer lifecycle and context recovery. Retain it until those unique checks have equivalent or stronger coverage elsewhere. |
| Synthetic and pinned Khronos GLBs   | Asset fixtures                                     | Static textured model, rigged skeleton and clips, independent cloned instances, cleanup, context recovery, and source/license provenance. Garden owns separate byte-verified licensed outputs.                                                                                                              |
| Cinematic regressions               | Three and Garden tests                             | Timeline validation, delay/hold/skip/cancel behavior, interruption, camera restoration, dialogue timing and reduced-motion meaning. Garden tests both existing outcomes and does not replay restored endings.                                                                                               |
| Creator importer/catalog/preview    | Development toolchain                              | Read-only GLB inspection, metadata/provenance, byte-preserving import, trusted budgets, independent release approval, preview security, project generation and omission checks. It is not a browser runtime dependency.                                                                                     |
| Installed-tarball and watch checks  | Package acceptance                                 | Offline installation, declarations, module independence, linked development, last-good output and recovery after a compile error.                                                                                                                                                                           |

Public game screenshots are Garden and Mahalle only. Blood Leaf, Phase 5,
generated-project, and creator captures remain under `docs/previews/` as
developer evidence and workflow artifacts.

## Main commands

Run the flagship from the repository root:

```sh
npm run sample:garden:dev
```

The main commands are:

| Purpose                                              | Command                               |
| ---------------------------------------------------- | ------------------------------------- |
| Garden development server                            | `npm run sample:garden:dev`           |
| Garden production preview                            | `npm run sample:garden:preview`       |
| Garden production build                              | `npm run sample:garden:build`         |
| Garden unit acceptance                               | `npm run sample:garden:test`          |
| Garden development-server browser regressions        | `npm run sample:garden:e2e:dev`       |
| Garden real-browser acceptance                       | `npm run sample:garden:e2e`           |
| Garden consumer from installed framework tarballs    | `npm run framework:garden-consumer`   |
| Capture Garden production gameplay screenshots       | `npm run sample:garden:previews`      |
| Check Garden actual assets and game-specific budgets | `npm run sample:garden:asset-check`   |
| Test Garden asset policy and integrity regressions   | `npm run sample:garden:asset-test`    |
| Check independent release approvals and budgets      | `npm run sample:garden:release:check` |
| Full root repository verification                    | `npm run verify`                      |

The release check requires a different reviewer and evidence for every exact
release asset hash. It currently stops until those approvals are recorded.
The source/output-integrity and technical-budget check does not grant release
approval.

The standalone Garden asset-check, asset-test, and release-check commands build
`waypoint-rpg-three` before validation. They use its public runtime-policy
resolver, and compare declared model bindings and map-instance budgets against
Garden's actual map and target definitions. The `:prepared` variants are for
root workflows that have already built the framework once.

## Asset preparation and private pilot

Use the creator CLI to prepare normal assets; supply game rights metadata and
the correct game policy when an import has trusted non-default limits:

```sh
npm run creator:asset:import -- --source path/to/model.glb --metadata path/to/model.asset.json --output-directory path/to/public/models --manifest path/to/assets/asset-records.json --preserve-glb-bytes --budget-policy path/to/budget-policy.json --require-release-approval
```

To opt into the local Garden Meshy pilot, first import the private source files
to a staging directory outside this repository and its common Git directory.
The importer rejects staging paths that resolve inside either repository:

```powershell
npm run models:meshy:import -- --source-dir 'D:\private\models' --output-dir "$env:TEMP\waypoint-rpg-meshy-pilot"
$env:WAYPOINT_MESHY_PILOT_DIR = "$env:TEMP\waypoint-rpg-meshy-pilot"
npm run sample:garden:meshy
```

`sample:garden:meshy` starts a development Vite server with the loopback-only
private route. Production preview and production builds never expose that
route. Private files and screenshots must stay in the external staging
directory; the repository ignores its local root `models/` folder. The
repeatable five-file byte-integrity check can also read the private originals:

```powershell
$env:WAYPOINT_MESHY_SOURCE_DIR = 'D:\private\models'
npm run models:meshy:test
```

## Independent framework and tool verification

`npm run verify` checks the root Mahalle product and Garden integration. The
following gates keep consumers independent and are also run in CI or focused
acceptance workflows as appropriate:

```sh
npm run framework:consumer
npm run framework:narrative-consumer
npm run framework:gameplay-consumer
npm run framework:scene-consumer
npm run framework:garden-consumer
npm run framework:mahalle-consumer
npm run framework:generated-games
npm run framework:watch:check
npm run creator:import-consumer
npm run creator:preview:typecheck
npm run creator:preview:test
npm run sample:phase5:previews
npm run sample:scene:previews
```

The creator preview is opened with `npm run creator:preview`. The CLI and
creator preview prepare assets and projects locally; Garden only consumes
public package APIs and its own bundled assets at runtime.
