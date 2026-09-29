import type { NpcId } from '../domain/game/types.ts';
import type { AvatarHairStyle, FigureVisualRole, Palette } from './models/modelProvider.ts';

/**
 * Presentation layer for NPC identity: one `NpcLook` row per `NpcDefinition`.
 * An NPC's silhouette is always archetype-geometry + palette/hair/accessory
 * data — never a bespoke component — so geometry/material counts stay bounded
 * as the cast grows.
 */
export interface NpcLook {
  readonly palette: Palette;
  /** Accessory identity already supported by the figure layer, if any. */
  readonly role?: FigureVisualRole | undefined;
  readonly hairStyle?: AvatarHairStyle | undefined;
  readonly hairColor?: string | undefined;
  /** Body scale multiplier — coarse height variation between villagers. */
  readonly scale?: number | undefined;
}

export const NPC_LOOKS: Readonly<Record<string, NpcLook>> = {
  'npc-elder': {
    palette: { body: '#7a5f8f', head: '#f0cfae', limb: '#5c4670' },
    role: 'elder',
    hairStyle: 'bun',
    hairColor: '#cfcfcf',
  },
  'npc-neighbour': {
    palette: { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' },
    role: 'neighbour',
    hairStyle: 'bun',
    hairColor: '#5a3a22',
  },
  'npc-shopkeeper': {
    palette: { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' },
    role: 'shopkeeper',
    hairStyle: 'short',
    hairColor: '#3a2a1c',
  },
  'npc-gardener': {
    palette: { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' },
    role: 'gardener',
    hairStyle: 'short',
    hairColor: '#6b4a2e',
  },
  'npc-child-friend': {
    palette: { body: '#c96f4a', head: '#eab98f', limb: '#6f4530' },
    role: 'friend',
    hairStyle: 'pigtails',
    hairColor: '#2e2018',
    scale: 0.72,
  },
  'npc-baker': {
    palette: { body: '#c98b4b', head: '#f2d1b3', limb: '#7a5a34' },
    hairStyle: 'short',
    hairColor: '#2e2018',
  },
  'npc-teacher': {
    palette: { body: '#2f6f8f', head: '#f2d1b3', limb: '#33475a' },
    hairStyle: 'bun',
    hairColor: '#3a2a1c',
  },
  'npc-child-ali': {
    palette: { body: '#8a4fa0', head: '#f2d1b3', limb: '#4a3255' },
    hairStyle: 'short',
    hairColor: '#2e2018',
    scale: 0.7,
  },
  'npc-park-keeper': {
    palette: { body: '#3f8f5f', head: '#eab98f', limb: '#2f5c40' },
    hairStyle: 'curly',
    hairColor: '#5a3a22',
  },
  'npc-child-sara': {
    palette: { body: '#e88bb0', head: '#f7dcbc', limb: '#8f5a6f' },
    hairStyle: 'pigtails',
    hairColor: '#8a5a33',
    scale: 0.7,
  },
  'npc-fisher': {
    palette: { body: '#5a7a9c', head: '#eab98f', limb: '#3a4f66' },
    hairStyle: 'short',
    hairColor: '#8a8a8a',
  },
};

export function npcLook(npcId: NpcId): NpcLook {
  return NPC_LOOKS[npcId] ?? { palette: { body: '#4c7a4c', head: '#f0cfae', limb: '#3b5c3b' } };
}
