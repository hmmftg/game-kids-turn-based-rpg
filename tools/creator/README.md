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

FBX, OBJ, and Blender source files are not parsed directly. Convert them locally
to glTF/GLB with the documented optional Blender workflow first.

The `scripts/import-model.mjs` repository command remains as a compatibility
wrapper for the existing scene-demo registry. New projects should use this
package CLI and their own paths.
