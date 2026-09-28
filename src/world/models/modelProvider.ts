import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';
import type { HeadwearId, QualityTier } from '../../domain/game/types.ts';

export interface Palette {
  readonly body: string;
  readonly head: string;
  readonly limb: string;
}

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Decorative density driven by the existing quality tier. The tier is the only
 * quality system; `detailLevel` is purely how much decoration models draw —
 * low keeps silhouettes and key accents, medium is the standard look, high adds
 * secondary accents. It never changes the rendering pipeline.
 */
export type DetailLevel = 0 | 1 | 2;

export function detailLevelFor(tier: QualityTier): DetailLevel {
  if (tier === 'low') return 0;
  if (tier === 'medium') return 1;
  return 2;
}

/**
 * Presentation-only identities. `Hub` maps domain ids (`landmark-*`, `npc-*`)
 * to these variants so the model layer never sees gameplay identifiers.
 */
export type LandmarkVisualVariant = 'square' | 'home-gate' | 'shop' | 'garden' | 'fountain';
export type FigureVisualRole =
  'elder' | 'neighbour' | 'shopkeeper' | 'gardener' | 'friend' | 'avatar';
export type PropVisualVariant = 'basket' | 'crate' | 'planter';

export interface FigureProps {
  readonly position: GroundPoint;
  readonly rotationY?: number;
  readonly palette: Palette;
  /** Phase of the idle/walk bob, in radians. */
  readonly bobbing?: number;
  /** Whether the figure is actively walking (drives squash-and-stretch). */
  readonly moving?: boolean;
  readonly label?: string;
  /** Cosmetic headwear layer; omitted/'none' leaves the head uncovered. */
  readonly headwear?: HeadwearId;
  /** Decorative density; omitted defaults to the medium look. */
  readonly detailLevel?: DetailLevel;
  /** Visual identity for accessories; omitted renders a plain villager. */
  readonly role?: FigureVisualRole | undefined;
}

export interface LandmarkProps {
  readonly position: GroundPoint;
  readonly palette: Palette;
  readonly height?: number;
  readonly width?: number;
  readonly detailLevel?: DetailLevel;
  /** Which landmark silhouette/details to draw; omitted is a plain building. */
  readonly variant?: LandmarkVisualVariant | undefined;
}

export interface PropProps {
  readonly position: GroundPoint;
  readonly palette: Palette;
  readonly scale?: number;
  readonly shape?: 'box' | 'cylinder';
  readonly detailLevel?: DetailLevel;
  /** Recognizable prop identity; omitted is a bare shape. */
  readonly variant?: PropVisualVariant | undefined;
}

/**
 * Model-provider boundary.
 *
 * Quest logic and the hub composition only know these three component slots, so
 * cubic primitives can later be replaced by GLB models (a different `ModelSet`)
 * without touching gameplay code.
 */
export interface ModelSet {
  readonly kind: 'cubic-primitives' | 'gltf';
  readonly Figure: ComponentType<FigureProps>;
  readonly Landmark: ComponentType<LandmarkProps>;
  readonly Prop: ComponentType<PropProps>;
}

export const ModelContext = createContext<ModelSet | null>(null);

export function useModels(): ModelSet {
  const models = useContext(ModelContext);
  if (!models) throw new Error('useModels must be used inside a model provider');
  return models;
}

export const AVATAR_PALETTES: Readonly<Record<'avatar-aban' | 'avatar-arta', Palette>> = {
  'avatar-aban': { body: '#2f6f8f', head: '#f2d1b3', limb: '#33475a' },
  'avatar-arta': { body: '#8a4fa0', head: '#f2d1b3', limb: '#4a3255' },
};

export const NPC_PALETTE: Palette = { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' };
export const LANDMARK_PALETTE: Palette = { body: '#e8cfa5', head: '#b4643c', limb: '#b4643c' };
export const PROP_PALETTE: Palette = { body: '#c98b4b', head: '#c98b4b', limb: '#c98b4b' };
