// Device-capability probes moved to the framework core. Kept as a re-export
// so existing `services/device/capabilities.ts` imports keep working.
export {
  currentOrientation,
  detectQualityTier,
  detectWebgl,
  maxPixelRatioFor,
  prefersReducedMotion,
} from '../../framework/index.ts';
