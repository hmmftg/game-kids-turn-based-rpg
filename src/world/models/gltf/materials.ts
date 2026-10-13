import { sharedLambert } from '../shared.ts';

/**
 * KayKit Medieval Builder Pack palette — every material's baseColorFactor in
 * the shipped GLBs, converted to the sRGB the loader displays (the factors
 * are stored linear; these are the rendered colors). Generated components
 * bind these shared `MeshLambertMaterial`s instead of the file's
 * MeshStandardMaterials: the whole world shades Lambert, and the GLB files'
 * ~16 material instances collapse into `LAMBERT_CACHE` so per-tier material
 * budgets are unchanged (one Map lookup per mesh, no new instances).
 *
 * If a regenerated component introduces a material name missing here, the
 * fix belongs in this table — never rebind the file's own materials.
 */
export const KAYKIT_MATERIAL = {
  beige: sharedLambert('#d9ad7d'),
  stone: sharedLambert('#798287'),
  stoneDark: sharedLambert('#5a6164'),
  white: sharedLambert('#e6e6e6'),
  brownDark: sharedLambert('#995a47'),
  brown: sharedLambert('#c78460'),
  water: sharedLambert('#49d5e0'),
} as const;
