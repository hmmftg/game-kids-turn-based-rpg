/**
 * Build budget gate.
 *
 * Measures the gzip-compressed transfer size of everything the browser needs
 * before the hub is playable (the precached shell + slice assets) and fails if
 * it exceeds the low-end-device budget.
 *
 * Usage: node --experimental-strip-types scripts/check-budgets.ts
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = join(process.cwd(), 'dist');

/** Total compressed transfer before the hub is playable. */
const TOTAL_BUDGET_BYTES = 10 * 1024 * 1024;
/** Initial JS budget: the parse/execute cost dominates on low-end Android. */
const JS_BUDGET_BYTES = 2 * 1024 * 1024;
const CSS_BUDGET_BYTES = 128 * 1024;
const FONT_BUDGET_BYTES = 256 * 1024;

interface Entry {
  readonly path: string;
  readonly bytes: number;
  readonly gzipBytes: number;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let files: string[];
try {
  files = walk(DIST);
} catch {
  process.stderr.write('dist/ not found — run the build before checking budgets.\n');
  process.exit(1);
}

const entries: Entry[] = files.map((file) => {
  const buffer = readFileSync(file);
  return {
    path: relative(DIST, file).replaceAll('\\', '/'),
    bytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer).byteLength,
  };
});

// Source maps and the Playwright/report noise are never transferred to players.
const shipped = entries.filter((entry) => !entry.path.endsWith('.map'));

const sum = (list: readonly Entry[]) => list.reduce((total, entry) => total + entry.gzipBytes, 0);
const byExt = (ext: string) => shipped.filter((entry) => entry.path.endsWith(ext));

const total = sum(shipped);
const js = sum(byExt('.js'));
const css = sum(byExt('.css'));
const fonts = sum(byExt('.woff2'));

const rows = [...shipped].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 15);
process.stdout.write('largest shipped assets (gzip):\n');
for (const row of rows) {
  process.stdout.write(`  ${human(row.gzipBytes).padStart(9)}  ${row.path}\n`);
}

const checks: readonly {
  readonly label: string;
  readonly actual: number;
  readonly budget: number;
}[] = [
  { label: 'total transfer', actual: total, budget: TOTAL_BUDGET_BYTES },
  { label: 'javascript', actual: js, budget: JS_BUDGET_BYTES },
  { label: 'css', actual: css, budget: CSS_BUDGET_BYTES },
  { label: 'fonts', actual: fonts, budget: FONT_BUDGET_BYTES },
];

let failed = false;
process.stdout.write('\nbudgets (gzip):\n');
for (const check of checks) {
  const ok = check.actual <= check.budget;
  if (!ok) failed = true;
  process.stdout.write(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${check.label.padEnd(15)} ${human(check.actual).padStart(9)} / ${human(check.budget)}\n`,
  );
}

if (failed) {
  process.stderr.write('\nBudget check failed.\n');
  process.exit(1);
}
