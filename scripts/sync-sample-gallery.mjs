#!/usr/bin/env node
// Runs after the three production-built samples have been rendered by Chromium.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const readmePath = 'README.md';
const start = '<!-- sample-games:begin -->';
const end = '<!-- sample-games:end -->';
const tick = String.fromCharCode(96);

const games = [
  {
    name: 'محله مهربانی',
    status: 'Implemented and playable',
    description:
      'The production reference game consumes public ' +
      tick +
      'waypoint-rpg-core' +
      tick +
      ', ' +
      tick +
      'waypoint-rpg-narrative' +
      tick +
      ', and ' +
      tick +
      'waypoint-rpg-gameplay' +
      tick +
      ' for runtime/navigation, replayable quest progression, and deterministic child micro-battles. Its physical interaction policy, rendering, and profile persistence remain app-owned.',
    readme: 'README.md',
    run: 'npm ci && npm run dev',
    folder: 'docs/previews/legacy-sample',
    images: [
      '01-title.png',
      '02-avatar-select.png',
      '03-headwear-select.png',
      '04-town-hub.png',
      '05-town-portrait.png',
      '06-guardian-dialogue.png',
      '07-encounter-choice.png',
      '08-physical-interaction.png',
      '09-sticker-reward.png',
      '10-replayed-quest.png',
      '11-lightweight-battle.png',
      '12-world-discovery.png',
      '13-restored-profile.png',
    ],
    columns: [
      ['04-town-hub.png', 'Town hub'],
      ['05-town-portrait.png', 'Town hub · portrait'],
      ['06-guardian-dialogue.png', 'Persian NPC dialogue'],
      ['07-encounter-choice.png', 'Encounter choice'],
      ['08-physical-interaction.png', 'Completed physical interaction'],
      ['09-sticker-reward.png', 'Sticker reward'],
      ['10-replayed-quest.png', 'Completed quest replay'],
      ['11-lightweight-battle.png', 'Real micro-battle'],
      ['12-world-discovery.png', 'Persistent world discovery'],
      ['13-restored-profile.png', 'Restored profile progress'],
    ],
  },
  {
    name: 'برگ خون',
    status: 'Technical demonstration',
    description:
      'An independent two-scene consumer demonstrating framework narrative, scene loading, ' +
      'transitions, persistence, and runtime-fact projection.',
    readme: 'examples/scene-demo/README.md',
    run: 'npm run example:scene-build',
    folder: 'docs/previews/blood-leaf',
    images: ['01-courtyard.png', '02-dialogue.png', '03-lit-lantern.png'],
    columns: [
      ['01-courtyard.png', 'Village courtyard'],
      ['02-dialogue.png', 'Persian story choice'],
      ['03-lit-lantern.png', 'Narrative-driven lantern'],
    ],
  },
  {
    name: 'Phase 5 — Animation and Cinematics',
    status: 'Technical demonstration',
    description:
      'The Blood Leaf scene demo also contains an example-owned static/rigged GLB adapter, independent character animation, and an optional timeline whose cues cannot change durable story state.',
    readme: 'examples/scene-demo/README.md',
    run: 'npm run sample:phase5:previews',
    folder: 'docs/previews/phase5',
    images: [
      '01-static-model.png',
      '02-two-rigged-characters.png',
      '03-moving-character.png',
      '04-character-interaction.png',
      '05-cinematic-camera.png',
      '06-cinematic-dialogue.png',
      '07-lantern-consequence.png',
      '08-reduced-motion.png',
      '09-mobile-portrait.png',
    ],
    columns: [
      ['01-static-model.png', 'Textured static GLB'],
      ['02-two-rigged-characters.png', 'Independent rig instances'],
      ['04-character-interaction.png', 'Guardian interaction'],
      ['06-cinematic-dialogue.png', 'RTL cinematic dialogue'],
      ['08-reduced-motion.png', 'Reduced motion'],
      ['09-mobile-portrait.png', 'Portrait viewport'],
    ],
  },
  {
    name: 'باغ قصه‌ها',
    status: 'Implemented and playable',
    description:
      'A complete Persian 3D adventure using the installed public core, narrative, and gameplay packages. ' +
      'Two story paths include a real tactical encounter, visible garden changes, and persistent progress.',
    readme: 'examples/garden-adventure/README.md',
    run: 'npm run sample:garden:dev',
    folder: 'docs/previews/garden-adventure',
    images: [
      '01-title.png',
      '02-village.png',
      '03-dialogue.png',
      '04-inventory.png',
      '05-garden-before.png',
      '06-garden-restored.png',
      '07-tactical-battle.png',
      '08-ability-effect.png',
      '09-guardian-outcome.png',
      '10-ending.png',
      '11-mobile.png',
      '12-restored.png',
    ],
    columns: [
      ['02-village.png', 'Village'],
      ['03-dialogue.png', 'Persian NPC dialogue'],
      ['04-inventory.png', 'Inventory and equipment'],
      ['05-garden-before.png', 'Garden before the objective'],
      ['06-garden-restored.png', 'Garden · gardener path'],
      ['07-tactical-battle.png', '5×5 tactical battle'],
      ['08-ability-effect.png', 'Ability and status effect'],
      ['09-guardian-outcome.png', 'Garden · guardian path'],
      ['10-ending.png', 'Story ending'],
      ['12-restored.png', 'Restored saved garden'],
    ],
  },
];

function verifyImageSet(game) {
  const manifestPath = `${game.folder}/provenance.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    !Number.isInteger(manifest.schemaVersion) ||
    manifest.schemaVersion < 1 ||
    manifest.schemaVersion > 2 ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)
  ) {
    throw new Error(`Invalid screenshot provenance manifest: ${manifestPath}`);
  }
  if (manifest.schemaVersion === 2) {
    const models = manifest.models;
    if (
      !Array.isArray(models) ||
      models.length === 0 ||
      models.some(
        (model) =>
          !/^[0-9a-f]{64}$/.test(model.sourceSha256) ||
          typeof model.licenseId !== 'string' ||
          model.licenseId.length === 0 ||
          typeof model.attribution !== 'string' ||
          model.attribution.length === 0,
      )
    ) {
      throw new Error(`Model source hashes and license attributions are required: ${manifestPath}`);
    }
  }
  const records = new Map(manifest.images.map((image) => [image.file, image]));
  for (const file of game.images) {
    const path = `${game.folder}/${file}`;
    const record = records.get(file);
    if (!record) throw new Error(`Missing screenshot record: ${path}`);
    if (
      game.folder === 'docs/previews/legacy-sample' &&
      (typeof record.checkpoint !== 'string' || record.checkpoint.length < 10)
    ) {
      throw new Error(`Gameplay checkpoint is missing from screenshot provenance: ${path}`);
    }
    const bytes = readFileSync(path);
    const size = statSync(path).size;
    if (size <= 5_000) throw new Error(`Missing or unexpectedly small screenshot: ${path}`);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`Screenshot is not a PNG: ${path}`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (
      width <= 300 ||
      height <= 300 ||
      record.bytes !== size ||
      record.width !== width ||
      record.height !== height ||
      record.sha256 !== sha256
    ) {
      throw new Error(`Screenshot does not match its provenance record: ${path}`);
    }
  }
  if (records.size !== game.images.length) {
    throw new Error(`Unexpected screenshot entry in provenance manifest: ${manifestPath}`);
  }
}

for (const game of games) verifyImageSet(game);

// prettier-ignore
const section = [
  start,
  '<!-- prettier-ignore-start -->',
  '',
  '## Samples / Playable Games',
  '',
  'These independent samples show how the reusable packages fit into different games. ' +
    'Screenshots below come from Chromium rendering each production build. Captures are ' +
    'documentation previews, not pixel-perfect regression baselines.',
  '',
  ...games.flatMap((game) => [
    '### ' + game.name + ' — ' + game.status,
    '',
    game.description,
    '',
    '[Game guide](' + game.readme + ') · ' + tick + game.run + tick,
    '',
    '| Capture | Actual browser rendering |',
    '| --- | --- |',
    ...game.columns.map(([file, label]) =>
      '| ' + label + ' | ![Actual ' + game.name + ' — ' + label + '](' + game.folder + '/' + file + ') |',
    ),
    '',
    game.images.length > game.columns.length
      ? 'Other captures: ' + game.images
          .filter((file) => !game.columns.some(([shown]) => shown === file))
          .map((file) => '[' + file.replace('.png', '') + '](' + game.folder + '/' + file + ')')
          .join(' · ') + '.'
      : '',
    '',
    game.name === 'محله مهربانی'
      ? '> **Draft content.** The existing game still contains educational and religious placeholders that require review; its screenshots do not imply content approval.'
      : '',
    '',
  ]),
  '**Status key:** Implemented and playable means the sample can be completed; Technical demonstration means it focuses on framework integration. ' +
    'The Shahnameh proof of concept is **Planned**. Verification beyond Chromium with software WebGL and on physical devices is **Not yet verified**.',
  '',
  '<!-- prettier-ignore-end -->',
  end,
].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');

const existing = readFileSync(readmePath, 'utf8');
const newline = existing.includes('\r\n') ? '\r\n' : '\n';
const original = existing.replace(/\r\n/g, '\n');
const before = original.indexOf(start);
const after = original.indexOf(end);
let updated;
if (before >= 0 || after >= 0) {
  if (before < 0 || after < before) throw new Error('Invalid sample gallery markers');
  updated = original.slice(0, before) + section + original.slice(after + end.length);
} else {
  const anchor = '<!-- framework-roadmap:end -->';
  const offset = original.indexOf(anchor);
  if (offset < 0) throw new Error('Missing framework roadmap insertion point');
  const position = offset + anchor.length;
  updated = original.slice(0, position) + '\n\n' + section + original.slice(position);
}
updated = updated.replace(/\n/g, newline);
if (updated !== existing) {
  writeFileSync(readmePath, updated, 'utf8');
  console.log('Updated the source-rendered sample game gallery.');
} else {
  console.log('Sample game gallery already up to date.');
}
