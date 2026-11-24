# waypoint-rpg-gameplay

An optional, game-neutral TypeScript ESM package for validated RPG gameplay definitions. It has no runtime dependencies and does not import `waypoint-rpg-core`, the narrative package, React, Three.js, browser APIs, or application code.

The package provides a versioned schema, precise authoring validation, and an immutable compiled-definition boundary. It initializes playthrough snapshots, derives progression levels and ability unlocks from experience, and applies bounded inventory grants, consumption, and equipment changes atomically. Tactical combat, status effects, encounter outcomes, and versioned save decoding are included; independent scene-demo integration remains a later Phase 4 milestone.

The package also exports an optional deterministic lightweight 1v1 encounter module. Authored definitions provide action/intent outcome matrices; the library validates the matrix, applies weakness bonuses and one-turn intent overrides, and runs the `intro → playerChoice → playerResolution → enemyResolution → roundCheck → victory/defeat` state machine. Its run state is transient unless an application deliberately persists it. Tactical-grid and lightweight encounters are separate models.

The package has one supported public entry, `waypoint-rpg-gameplay`. Deep imports are intentionally blocked. Definitions contain data only; executable callbacks and scripts are not supported.

The lightweight encounter API is `validateLightweightEncounter`, `compileLightweightEncounter`, `createLightweightEncounter`, and `transitionLightweightEncounter`. Definitions are generic: action, intent, opponent, and outcome IDs carry no package-owned game policy. `createLightweightEncounter` accepts the application's already-authorized unlocked abilities; the UI must not use that argument as a substitute for gameplay progression checks.

## Development

From the repository root, run `npm run framework:gameplay:check`, `npm run framework:gameplay:build`, and `npm run framework:gameplay:test:prepared`. Verify the installed tarball with `npm run framework:gameplay-consumer`. `npm run verify` orchestrates the framework build before the prepared package, tarball, and application checks.

The package declares a Node.js runtime floor of 22.0.0 for native ESM. Its TypeScript build tool belongs to repository development tooling and runs on the root project's Node.js engine. Inventory capacity counts occupied item stacks, including equipped items, because equipment remains owned in inventory. The runtime floor does not claim support for any particular browser.
