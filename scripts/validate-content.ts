/**
 * Content gate.
 *
 * Development runs allow draft records (reported as warnings) but still fail on
 * unsafe drafts: quotations, citations or claimed rights on unapproved content,
 * forbidden child-facing wording, or broken content references.
 *
 * Release runs (`--release`, or CONTENT_RELEASE=1) additionally fail if any
 * production-reachable record is not `approved`.
 *
 * Usage: node --experimental-strip-types scripts/validate-content.ts [--release]
 */
import { formatReport, validateContent } from '../src/content/validation.ts';

const requireApproved = process.argv.includes('--release') || process.env.CONTENT_RELEASE === '1';
const report = validateContent({ requireApproved });

process.stdout.write(`${formatReport(report)}\n`);

if (!report.ok) {
  process.stdout.write(
    requireApproved
      ? '\nRelease content validation failed: every reachable record must be approved and fully cited.\n'
      : '\nContent validation failed.\n',
  );
  process.exit(1);
}

if (report.warningCount > 0) {
  process.stdout.write('\nDRAFT CONTENT: this build is not releasable as educational material.\n');
}
