#!/usr/bin/env node
// README roadmap is generated from the phase/status/evidence table in
// docs/FRAMEWORK-ROADMAP.md. Never infer completion from a merge alone.
import { readFileSync, writeFileSync } from 'node:fs';

const roadmapPath = 'docs/FRAMEWORK-ROADMAP.md';
const readmePath = 'README.md';
const begin = '<!-- framework-roadmap:begin -->';
const end = '<!-- framework-roadmap:end -->';
const allowed = new Set(['Complete', 'In progress', 'Next', 'Planned', 'Blocked']);
const symbols = {
  Complete: '✅ Complete',
  'In progress': '🚧 In progress',
  Next: '➡️ Next',
  Planned: '⏳ Planned',
  Blocked: '⛔ Blocked',
};

function extractPhases(markdown) {
  const heading = markdown.indexOf('### Roadmap and gates');
  if (heading < 0) throw new Error('Missing roadmap heading');
  const lines = markdown.slice(heading).split(/\r?\n/);
  const header = lines.findIndex((line) => line.startsWith('| Phase'));
  if (header < 0) throw new Error('Missing phase table');
  const columns = lines[header].split('|').map((cell) => cell.trim());
  if (!columns.includes('Status') || !columns.includes('Evidence')) {
    throw new Error('Roadmap table needs Status and Evidence columns');
  }

  const phases = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1);
    const values = cells.map((cell) => cell.trim());
    if (values.length !== 5) throw new Error('Expected five columns');
    const match = /^(\d+(?:\.\d+)?)\.\s+(.+)$/.exec(values[0]);
    if (!match) throw new Error('Invalid phase identifier');
    const id = match[1];
    const order = Number(id);
    if (
      (phases.length === 0 && order !== 1) ||
      (phases.length > 0 && order <= phases.at(-1).order)
    ) {
      throw new Error('Phases must be ordered, starting at 1');
    }
    if (!allowed.has(values[1])) {
      throw new Error('Unsupported status for phase ' + id);
    }
    if (!values[2] || !values[3]) {
      throw new Error('Missing deliverable or exit gate');
    }
    phases.push({
      id,
      order,
      title: match[2],
      status: values[1],
      evidence: values[4],
    });
  }
  if (!phases.length) throw new Error('No roadmap phases found');
  const nextCount = phases.filter((phase) => phase.status === 'Next').length;
  if (nextCount > 1) throw new Error('Multiple Next phases');
  return phases;
}

function renderRoadmap(phases) {
  const complete = phases.filter((phase) => phase.status === 'Complete');
  let upcoming = phases.find((phase) => phase.status === 'Next');
  if (!upcoming) upcoming = phases.find((phase) => phase.status === 'In progress');
  if (!upcoming) upcoming = phases.find((phase) => phase.status === 'Planned');

  let summary = '**' + complete.length + '/' + phases.length;
  summary += ' phases completed**';
  if (upcoming) {
    const label = 'Phase ' + upcoming.id + ' — ' + upcoming.title;
    summary += ' · Next: **' + label + '**';
  }

  const nodes = [];
  for (const phase of phases) {
    const title = phase.title.replace(/["<>]/g, '');
    const label = phase.id + '. ' + title;
    const nodeId = 'P' + phase.id.replace('.', '_');
    nodes.push(nodeId + '["' + label + '"]');
  }
  const diagram = [
    'flowchart LR',
    '  ' + nodes.join(' --> '),
    '  classDef complete fill:#dcfce7,stroke:#15803d,color:#14532d',
    '  classDef next fill:#fef3c7,stroke:#b45309,color:#78350f',
    '  classDef planned fill:#e5e7eb,stroke:#6b7280,color:#1f2937',
  ];
  const classes = [
    ['Complete', 'complete'],
    ['In progress', 'next'],
    ['Next', 'next'],
    ['Planned', 'planned'],
    ['Blocked', 'planned'],
  ];
  for (const [status, css] of classes) {
    const matching = phases.filter((phase) => phase.status === status);
    const ids = matching.map((phase) => 'P' + phase.id.replace('.', '_'));
    if (ids.length) diagram.push('  class ' + ids.join(',') + ' ' + css);
  }

  const rows = phases.map((phase) => {
    const title = phase.id + '. ' + phase.title;
    const evidence = (phase.evidence || '—')
      .replaceAll('](../.plans/', '](.plans/')
      .replaceAll('](../packages/', '](packages/')
      .replaceAll('](previews/', '](docs/previews/');
    const statusText = symbols[phase.status];
    return '| ' + title + ' | ' + statusText + ' | ' + evidence + ' |';
  });
  const link = '[Full roadmap and exit gates](' + roadmapPath + ')';
  const sourceLink = '[docs/FRAMEWORK-ROADMAP.md](' + roadmapPath + ')';
  const note = '_Generated from the canonical roadmap. Update status and evidence in ';
  return [
    begin,
    '<!-- prettier-ignore-start -->',
    '',
    '## Framework roadmap',
    '',
    summary + ' · ' + link,
    '',
    '```mermaid',
    ...diagram,
    '```',
    '',
    '| Phase | Status | Evidence |',
    '| --- | --- | --- |',
    ...rows,
    '',
    note + sourceLink + ', then run npm run roadmap:sync._',
    '',
    '<!-- prettier-ignore-end -->',
    end,
  ].join('\n');
}

function updateReadme(readme, generated) {
  const start = readme.indexOf(begin);
  const finish = readme.indexOf(end);
  if (start >= 0 !== finish >= 0) {
    throw new Error('Unmatched generated roadmap markers');
  }
  if (start >= 0) {
    if (finish < start) throw new Error('Invalid roadmap marker order');
    const before = readme.slice(0, start);
    const after = readme.slice(finish + end.length);
    return before + generated + after;
  }
  const anchor = '\n## Requirements\n';
  const pos = readme.indexOf(anchor);
  if (pos < 0) throw new Error('Missing README insertion anchor');
  return readme.slice(0, pos) + '\n' + generated + '\n' + readme.slice(pos);
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) {
  throw new Error('Usage: sync-framework-roadmap.mjs [--check]');
}
const phases = extractPhases(readFileSync(roadmapPath, 'utf8'));
const existing = readFileSync(readmePath, 'utf8');
const newline = existing.includes('\r\n') ? '\r\n' : '\n';
const normalized = existing.replace(/\r\n/g, '\n');
const updated = updateReadme(normalized, renderRoadmap(phases)).replace(/\n/g, newline);
if (updated !== existing) {
  if (args.includes('--check')) {
    console.error('README roadmap is stale. Run npm run roadmap:sync.');
    process.exitCode = 1;
  } else {
    writeFileSync(readmePath, updated, 'utf8');
    console.log('Updated README roadmap (' + phases.length + ' phases).');
  }
} else {
  console.log('README roadmap is up to date.');
}
