import type { QualityTier } from '../../domain/game/types.ts';

/** Cheap WebGL probe; the context is released immediately. */
export function detectWebgl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (!gl) return false;
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Conservative first guess; the runtime frame monitor may lower it further. */
export function detectQualityTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  if (memory <= 2 || cores <= 4) return 'low';
  if (memory >= 6 && cores >= 8 && dpr >= 2) return 'high';
  return 'medium';
}

export function maxPixelRatioFor(tier: QualityTier): number {
  switch (tier) {
    case 'low':
      return 1;
    case 'medium':
      return 1.5;
    case 'high':
      return 2;
  }
}

export function currentOrientation(): 'landscape' | 'portrait' {
  if (typeof window === 'undefined') return 'landscape';
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  }
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
