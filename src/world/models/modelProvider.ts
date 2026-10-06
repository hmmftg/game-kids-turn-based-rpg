import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';
import type { AvatarId, HeadwearId, QualityTier } from '../../domain/game/types.ts';

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
export type PropVisualVariant = 'basket' | 'crate' | 'planter' | 'ball' | 'shell' | 'kite';

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
  /** Kid-avatar hair silhouette + color; omitted renders a bare head. */
  readonly hairStyle?: AvatarHairStyle | undefined;
  readonly hairColor?: string | undefined;
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

export type AnimalVisualVariant = 'cat' | 'bird' | 'eagle' | 'fish' | 'butterfly';

export interface AnimalProps {
  /** Species silhouette to draw. */
  readonly variant: AnimalVisualVariant;
  /** Optional body tint override (e.g. ginger vs grey cats). */
  readonly tint?: string | undefined;
  /** Pose switch: spread wings / running legs vs perched / sitting. */
  readonly moving?: boolean;
  readonly detailLevel?: DetailLevel;
}

/**
 * Model-provider boundary.
 *
 * Quest logic and the hub composition only know these component slots, so
 * cubic primitives can later be replaced by GLB models (a different `ModelSet`)
 * without touching gameplay code. `Animal` is part of the contract: a GLB
 * provider must supply all four slots. Animals are transformed by their
 * parent group (position/heading are ref-driven, not props) — see
 * `useCritters`.
 */
export interface ModelSet {
  readonly kind: 'cubic-primitives' | 'gltf';
  readonly Figure: ComponentType<FigureProps>;
  readonly Landmark: ComponentType<LandmarkProps>;
  readonly Prop: ComponentType<PropProps>;
  readonly Animal: ComponentType<AnimalProps>;
}

export const ModelContext = createContext<ModelSet | null>(null);

export function useModels(): ModelSet {
  const models = useContext(ModelContext);
  if (!models) throw new Error('useModels must be used inside a model provider');
  return models;
}

/**
 * Per-preset kid identity. The children pick by look, not by reading a name:
 * every preset pairs a distinct human hair silhouette + hair color with a
 * clearly different outfit palette. `hairStyle` is a coarse silhouette —
 * the figure layer turns it into 2–4 shared-geometry meshes.
 */
export type AvatarHairStyle = 'pigtails' | 'short' | 'curly' | 'bun';

export interface AvatarVisual {
  readonly palette: Palette;
  readonly hairStyle: AvatarHairStyle;
  readonly hairColor: string;
}

export const AVATAR_VISUALS: Readonly<Record<AvatarId, AvatarVisual>> = {
  'avatar-aban': {
    palette: { body: '#2f6f8f', head: '#f2d1b3', limb: '#33475a' },
    hairStyle: 'pigtails',
    hairColor: '#5a3a22',
  },
  'avatar-arta': {
    palette: { body: '#8a4fa0', head: '#f2d1b3', limb: '#4a3255' },
    hairStyle: 'short',
    hairColor: '#3a2a1c',
  },
  'avatar-nika': {
    palette: { body: '#c96f4a', head: '#eab98f', limb: '#6f4530' },
    hairStyle: 'curly',
    hairColor: '#2e2018',
  },
  'avatar-diyar': {
    palette: { body: '#3f8f5f', head: '#f7dcbc', limb: '#2f5c40' },
    hairStyle: 'bun',
    hairColor: '#8a5a33',
  },
};

export const NPC_PALETTE: Palette = { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' };
export const LANDMARK_PALETTE: Palette = { body: '#e8cfa5', head: '#b4643c', limb: '#b4643c' };
export const PROP_PALETTE: Palette = { body: '#c98b4b', head: '#c98b4b', limb: '#c98b4b' };
