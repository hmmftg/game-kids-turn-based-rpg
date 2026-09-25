import { CubicFigure, CubicLandmark, CubicProp } from './cubic.tsx';
import type { ModelSet } from './modelProvider.ts';

/** Default model set. Swapping in GLB models means replacing this object only. */
export const CUBIC_MODELS: ModelSet = {
  kind: 'cubic-primitives',
  Figure: CubicFigure,
  Landmark: CubicLandmark,
  Prop: CubicProp,
};
