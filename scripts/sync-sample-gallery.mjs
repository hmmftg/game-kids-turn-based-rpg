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
    name: 'باغ قصه‌ها',
    status: 'Flagship framework sample',
    description:
      'The single flagship sample integrates public ' +
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
      ', plus ' +
      tick +
      'waypoint-rpg-three' +
      tick +
      '. Its connected maps, branching story, tactical challenge, progression, GLB loading, character animation, and ending cinematics are composed by Garden-owned content and presentation.',
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
      ['02-village.png', 'Connected village map'],
      ['03-dialogue.png', 'Persian NPC dialogue'],
      ['04-inventory.png', 'Inventory and equipment'],
      ['05-garden-before.png', 'Garden before the objective'],
      ['06-garden-restored.png', 'Gardener path'],
      ['07-tactical-battle.png', 'Tactical encounter'],
      ['08-ability-effect.png', 'Ability and status effect'],
      ['09-guardian-outcome.png', 'Guardian path'],
      ['10-ending.png', 'Story ending and cinematic'],
      ['12-restored.png', 'Restored saved adventure'],
    ],
  },
  {
    name: 'محله مهربانی',
    status: 'Separate first-party product',
    description:
      'The original nonviolent, offline-first Persian game remains a distinct first-party product with its own child interaction rules, rendering, and IndexedDB profiles.',
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
  '## Flagship Sample and First-Party Product',
  '',
  'Garden of Stories is the one flagship framework sample. Mahalle remains a separate first-party product. ' +
    'Screenshots come from Chromium rendering the actual production builds; they are documentation previews, not pixel-perfect regression baselines. ' +
    'Other consumers and screenshots remain in the developer verification guide as technical fixtures.',
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
  '[Developer verification guide](docs/SAMPLE-VERIFICATION.md) lists the retained independent consumers, package fixtures, importer and creator checks. ' +
    'Garden is verified in Chromium with software WebGL; other browsers and physical touch devices remain unverified.',
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
