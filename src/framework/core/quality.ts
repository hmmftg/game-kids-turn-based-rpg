/**
 * Runtime quality-policy dial — the only knob rendering quality listens to.
 * Owned by the parent (behind the parent gate) and persisted by the
 * application; automatic adaptation may lower the *effective* detail but
 * never silently overrides the chosen tier.
 */
export type QualityTier = 'very-low' | 'low' | 'normal' | 'high' | 'very-high';
