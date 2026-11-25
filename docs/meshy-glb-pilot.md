# Meshy GLB integration pilot

This is a local development pilot for consuming externally produced GLBs in
the Garden of Stories sample. It deliberately does not modify source model
bytes or geometry. The existing Kids RPG conversion pipeline remains separate.

## Intake and byte preservation

Run the repeatable import with the local source folder and a private staging
directory outside the repository:

```powershell
npm run models:meshy:import -- --source-dir '../../models' --output-dir "$env:TEMP\waypoint-rpg-meshy-pilot"
```

When run from a worktree under `.worktrees/<name>`, `../../models` points back
to the original checkout's source directory. From the original checkout, use
`./models`. The command uses the existing `waypoint-rpg-creator` GLB inspector/importer,
with byte-preserving mode enabled. The GLBs in `sources/` and `models/` in the
private staging directory are byte-identical. No conversion, geometry edit,
normal generation, index conversion, UV edit, texture operation, or rigging is
performed. Runtime normalization is done by object transforms in the
directory.

The before/after optimization comparison for every model is intentionally
identity: runtime bytes, SHA-256, triangle count, vertex count, and bounds all
match the source because no optimization or geometry rewrite was run.

Each GLB is a self-contained glTF 2.0 file with one scene node (`mesh_node`),
one mesh and one indexed triangle primitive. All have a `POSITION` attribute
only: no normals, UVs, vertex colors, materials, textures, skins, joints,
animation clips, morph targets, or required/optional glTF extensions. There
are no external buffer or image dependencies. The models are structurally
valid and load through the standard Three.js GLTFLoader. The renderer selects
flat shading when normals are absent; it does not write normals back to the
GLB. The sage is a static T-pose model. The other models are also static and
need no animation data to pass import or preview.

The measured axis convention is Y-up and -Z forward. GLB does not carry a
reliable real-world unit declaration; catalog dimensions below are measured
in source GLTF units. The Garden places and scales models with wrapper-object
transforms and aligns the transformed bounding-box minimum to the ground.
Source node transforms are identity. Bounding-box queries are read-only.

## Source and runtime measurements

The report was generated from the original local files on 2026-11-25. Source
generation date evidence comes from the filenames only; no per-asset Meshy
generation receipts were supplied. Source and runtime hashes match exactly.
Decoded geometry bytes are a typed-array estimate and exclude renderer and
driver overhead.

| Source filename / stable ID                                                       | SHA-256 (source = runtime)                                         |     Bytes | Vertices / triangles | Bounds (X × Y × Z, source units; min Y) | Decoded estimate |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------: | -------------------: | --------------------------------------- | ---------------: |
| `Meshy_AI_Ancient_Stone_Fountain_20261125_generate.glb` / `meshy-garden-fountain` | `5c3962f3776bac60d3dcbcfe6b8512f289365297a62fcf288a56db1df404f68b` | 6,374,504 |    177,025 / 354,118 | 1.90069 × 1.25842 × 1.90057; −0.63173   |      6,373,716 B |
| `Meshy_AI_Golden_Golem_Sentinel_20261125_generate.glb` / `meshy-garden-guardian`  | `cde253c4bc8bc002692a91ed68a232ab2e8a13cef15457fed9a96d2d87455111` | 2,997,208 |     83,238 / 166,464 | 1.89939 × 1.42722 × 0.75023; −0.71589   |      2,996,424 B |
| `Meshy_AI_Pink_Polygon_Tree_20261125_generate.glb` / `meshy-garden-blossom-tree`  | `2046fdd2bd391daf1b1e9548cf4c92b92a977726581ab5755b0384acd54c6bd8` | 2,868,744 |     79,643 / 159,354 | 1.89796 × 1.20920 × 1.35817; −0.60625   |      2,867,964 B |
| `Meshy_AI_Roseglass_Shrine_20261125_generate.glb` / `meshy-garden-shrine`         | `0cf29cd415ada97aa3ebe082d5b8d09d0af0679a7012060e4a9403fbf2faec6e` | 4,737,904 |    131,568 / 263,192 | 1.49812 × 1.89847 × 1.24891; −0.95000   |      4,737,120 B |
| `Meshy_AI_T_Pose_Sage_20261125_generate.glb` / `meshy-garden-sage`                | `39080ef18f6a1f5461608d5e1767ba82b6076edbcd71c362ac630ceab6111d27` | 2,766,832 |     76,812 / 153,692 | 1.73483 × 1.89904 × 0.50512; −0.95000   |      2,766,048 B |

Across all five sources: 19,745,192 bytes, 1,096,820 triangles, and an
estimated 19,741,272 decoded geometry bytes (about 18.8 MiB). Each source
imports directly. There were no rejected models or importer compatibility
workarounds.

## Budget policy and performance recommendations

Structural validity, runtime compatibility, performance advice, game resource
budgets, and release eligibility are separate checks. The importer default
remains 60,000 triangles per asset. The local pilot explicitly supplies a
trusted 400,000-triangle per-asset policy. The loader also applies trusted
aggregate limits for Garden: five loaded assets, 32 MiB decoded geometry, and
1.5 million active-scene triangles. The private dev route is enabled only by
`WAYPOINT_MESHY_PILOT_DIR`, is loopback-only, confines reads to its real staging
directory, and serves only manifest-listed files. A query string selects the
rendering mode; it does not enable file access or change budgets. The source
manifest cannot change these trusted policies. Existing file-size and GLB
structural safety limits remain in force.

These models exceed the preferred budgets for future production assets. Those
numbers are external asset-production targets, not instructions to alter this
pilot's files:

| Asset        | Measured triangles / bytes | Suggested external target |
| ------------ | -------------------------: | ------------------------: |
| Fountain     |          354,118 / 6.37 MB |   4,000 triangles / 2 MiB |
| Guardian     |          166,464 / 3.00 MB |   8,000 triangles / 3 MiB |
| Blossom tree |          159,354 / 2.87 MB |   4,000 triangles / 2 MiB |
| Shrine       |          263,192 / 4.74 MB |   4,000 triangles / 2 MiB |
| Sage         |          153,692 / 2.77 MB |   8,000 triangles / 3 MiB |

Garden runtime captures reported one mesh and one draw call per imported
model. Measurements from the browser pilot:

| Model        | Garden triangles | Draw calls | Decoded geometry bytes | First observed load |
| ------------ | ---------------: | ---------: | ---------------------: | ------------------: |
| Fountain     |          354,118 |          1 |              6,373,716 |             68.7 ms |
| Guardian     |          166,464 |          1 |              2,996,424 |             68.3 ms |
| Blossom tree |          159,354 |          1 |              2,867,964 |             73.9 ms |
| Shrine       |          263,192 |          1 |              4,737,120 |             83.2 ms |
| Sage         |          153,692 |          1 |              2,766,048 |             31.4 ms |

The browser comparison captured the same default village state and village
square anchor at a 1440 × 900 page viewport (758 × 520 canvas):

| Representation                    | Geometries | Textures | Draw calls | Scene triangles |
| --------------------------------- | ---------: | -------: | ---------: | --------------: |
| Procedural village                |         36 |        1 |         36 |           4,398 |
| Meshy village (fountain and sage) |         33 |        1 |         33 |         511,632 |
| Change                            |         −3 |        0 |         −3 |        +507,234 |

The pilot reduces three renderer geometries and draw calls in this view, while
adding about 116 times the total triangles (about 115 times the baseline as an
increase). The high-poly asset cost dominates the village scene even though
each imported model is one mesh and one draw call. This is the clearest reason
to ask an external asset generator for substantially lower triangle targets.

Load timing is one local Chromium run, not a cross-device benchmark. First
observations were 31–83 ms, with later scene reloads measured at 29–122 ms;
these are local route/fetch/parse timings, not physical-device cold or warm
startup claims. A bounded walk in Chromium software rendering took 133.3 ms
across six rendered frames (approximately 45 observed FPS); this is not a
physical mobile result. The application reports active render intervals, not
an idle FPS value. Garden resource counts after repeated transitions were
stable at 31 geometries, 1 texture, and 31 draw calls on repeated Garden
entry; triangle count also matched at 432,850. GPU memory and physical-device
timing were not measured.

## Provenance and release gate

The private catalog records Meshy as provider, original filename and source
hash, runtime hash/path, import metrics, conversion options, Garden consumer,
technical checks, and CC BY 4.0 rights evidence. Meshy states that Free-plan
generated assets use CC BY 4.0 and require attribution; the catalog records
commercial use and redistribution as permitted under that license. It does not
claim ownership, CC0, or release approval. Independent approval records are
empty, and every asset remains `not approved` for public release. The local
high-poly exception does not satisfy Garden production budgets or the release
gate. Release validation must check actual file integrity, the consuming
game's configured budgets, and independent approval evidence.

Rights evidence is kept with the private staged catalog under
`rights/meshy-free-plan-cc-by-4.0.md`. See the current [Meshy Free-plan
terms](https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan),
[Meshy terms of use](https://www.meshy.ai/terms-of-use), and [Creative Commons
Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Verify the
terms again when preparing any public release.

## Consumer integration and fallbacks

`waypoint-rpg-three` owns only verified GLB intake, hash checking, cache
identity, independent instances and skeletons, cancellation, resource leases,
material cloning/overrides, and disposal. Three.js is a peer dependency.
Three, React, camera choreography, gameplay, and narrative policy remain out
of the pure core, narrative, and gameplay packages. Static models need no
clips. Animated GLBs preserve source bytes and original clips; stable
`clip-N` identifiers handle absent and duplicate source names, while semantic
mapping by original name is accepted only when unambiguous.

The Garden's explicit local pilot mode is `?assets=meshy`, and it falls back
to the original procedural visuals if the pilot server is disabled, a model is
missing, or hash/GLB loading fails. The fountain and guardian retain their
existing targets and gameplay. The blossom tree remains controlled by the
committed quest fact and is visible after reload only when that fact is
present. The shrine is decorative. The static T-pose sage is used only in the
local pilot presentation; it has no skeletal animation. None of the imported
visuals can mutate game state.

The guardian and sage contain zero skins and joints. They are static mesh
candidates, not rigged or animation-ready assets. The sage has a visually
clear, approximately symmetric T-pose with recognizable arms, hands, legs,
and feet, making it a reasonable external rigging candidate; joint placement
and deformation quality have not been validated. The guardian reads as a
bulky humanoid sentinel with broad armored limbs; its hand, foot, and joint
regions are less clearly exposed in the source silhouette, so external
rigging would need careful review. Neither model was automatically rigged,
reposed, or weight-painted. The local presentation uses object-level
transforms only.

The creator preview can select each of the five catalog assets, render them,
fit their bounds to the ground, and report errors. The Phase 5 scene demo now
consumes the shared package. Private browser captures and their JSON
provenance are written outside the repository at
`%TEMP%\waypoint-rpg-meshy-pilot\screenshots\`. The records include source
commit, asset hashes, browser, viewport, screenshot hash, and release-approval
state. Unapproved GLBs, manifests, metadata, and screenshots are not committed
or copied into public builds. An artifact-isolation test builds with a
populated private stage and scans the production output for leakage.

## Verification and captures

The repeatable checks are:

```powershell
npm run models:meshy:test
npm run models:meshy:security:test
npm run creator:preview:meshy
npm run framework:scene-consumer
npm run framework:garden-consumer
npm run sample:garden:test
npm run sample:garden:build
npm run sample:garden:e2e
npm run verify
```

Set `WAYPOINT_MESHY_PILOT_DIR` to the private stage for local preview and E2E
commands. Set `WAYPOINT_MESHY_SCREENSHOT_DIR` to a directory under the same
private temp root to capture screenshots. Exact results and hashes for the
final run are recorded in the task report; these captures are intentionally
not repository assets.

The gallery includes the original procedural village, the Meshy fountain
village, shrine garden, guardian encounter, completed-quest blossom tree,
mobile portrait, procedural fallback, and creator preview for all five
models. It uses actual browser renders. Chromium runs here use software WebGL
(SwiftShader); low-end mobile performance remains unverified.

For this pilot, the importer suite passed 19 tests, the creator/catalog suite
passed 31, creator preview passed typecheck, four browser tests, and production
build, and the five-model creator capture passed. The framework scene, Garden,
and generated-game independent-consumer checks passed. Garden passed 26 unit
tests, its 20 standard browser acceptance tests, and five private Meshy browser
tests. The source-preservation test verified all five staged files byte for
byte; the private-route and artifact-isolation suite passed seven tests.
Garden and creator preview builds emit the existing Vite large-chunk warning
(1.31 MB and 1.19 MB JavaScript respectively).

The first repository-wide `npm run verify` exposed a Windows-only false
failure in `creator:mahalle-catalog`: its checked-in catalog has CRLF line
endings while the generator comparison emits LF. The check now normalizes
line endings before comparing contents; the catalog values remain unchanged.
The check passes, with a non-fatal local inspector warning that optional
`KHR_materials_specular` is unavailable. No catalog regeneration was
performed. The final repository-wide `npm run verify` passed, including 591
tests, typecheck, migration validation, production bundle budgets, deployment
shape checks, and the Hello World and scene-demo builds. Existing draft-content,
placeholder-asset, and large-chunk warnings were non-fatal.
