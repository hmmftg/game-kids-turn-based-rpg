import { describe, expect, it } from 'vitest';
import { QUEST_COPY } from './fa/quests.ts';
import { DIALOGUE_NODES } from './fa/dialogue.ts';
import { SOURCE_RECORDS } from './sources/records.ts';
import { formatReport, validateContent } from './validation.ts';

describe('content validation', () => {
  it('passes in development mode with only draft warnings', () => {
    const report = validateContent({ requireApproved: false });
    expect(formatReport(report)).toBeTypeOf('string');
    expect(report.errorCount).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.warningCount).toBeGreaterThan(0);
  });

  it('fails in release mode because no content is approved yet', () => {
    const report = validateContent({ requireApproved: true });
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'not-approved')).toBe(true);
  });

  it('keeps every shipped record in draft status', () => {
    for (const copy of QUEST_COPY) expect(copy.review.status).toBe('draft');
    for (const node of DIALOGUE_NODES) expect(node.review.status).toBe('draft');
    for (const record of SOURCE_RECORDS) expect(record.review.status).toBe('draft');
  });

  it('keeps quotation, translation and citation fields empty while unapproved', () => {
    for (const record of SOURCE_RECORDS) {
      expect(record.arabicQuotation).toBe('');
      expect(record.persianTranslation).toBe('');
      expect(Object.values(record.citation).join('')).toBe('');
      expect(record.rights.mayReproduceQuotation).toBe(false);
      expect(record.rights.mayReproduceTranslation).toBe(false);
    }
  });

  it('names no reviewer for unreviewed content', () => {
    for (const record of SOURCE_RECORDS) {
      expect(record.review.scholarReviewer).toBe('');
      expect(record.review.reviewedAt).toBe('');
    }
  });

  it('rejects approved dialogue that still lacks named reviewers', () => {
    const node = DIALOGUE_NODES[0];
    if (!node) throw new Error('expected dialogue nodes');
    const original = node.review;
    (node as { review: typeof original }).review = { ...original, status: 'approved' };
    try {
      const report = validateContent({ requireApproved: true });
      expect(
        report.issues.some(
          (issue) => issue.code === 'incomplete-review' && issue.where === node.id,
        ),
      ).toBe(true);
    } finally {
      (node as { review: typeof original }).review = original;
    }
  });
});
