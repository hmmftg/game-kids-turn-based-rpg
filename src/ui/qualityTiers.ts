import { FA } from '../content/fa/strings.ts';
import type { QualityTier } from '../domain/game/types.ts';

/**
 * The five quality tiers as one ordered list, their parent-facing Persian
 * labels, and the child's pictogram scale (heavier picture = slower animal).
 * Shared by the child's pause menu and the parent area so the two surfaces
 * can never drift apart — and so every pictogram button gets its own name.
 */
export const QUALITY_TIERS: readonly QualityTier[] = [
  'very-low',
  'low',
  'normal',
  'high',
  'very-high',
];

export const TIER_LABEL: Record<QualityTier, string> = {
  'very-low': FA.qualityVeryLow,
  low: FA.qualityLow,
  normal: FA.qualityNormal,
  high: FA.qualityHigh,
  'very-high': FA.qualityVeryHigh,
};

export const QUALITY_GLYPH: Record<QualityTier, string> = {
  'very-low': '🐢',
  low: '🚶',
  normal: '🚲',
  high: '🚗',
  'very-high': '🚀',
};
