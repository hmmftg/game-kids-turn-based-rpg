/**
 * Domain types for «محله‌ی مهربانی».
 *
 * This layer is pure TypeScript: it must never import React, Three.js, DOM APIs
 * or storage APIs. Everything here is serialisable or derived from serialisable data.
 */

import type { DiscoveryId, MapId } from '../world/types.ts';

export const MODES = [
  'boot',
  'profileSelect',
  'title',
  'avatarSelect',
  'hub',
  'dialogue',
  'encounter',
  'paused',
  'parentGate',
  'parentArea',
  'fatalFallback',
] as const;

export type Mode = (typeof MODES)[number];

/** Modes the child can be returned to after an overlay (pause / parent gate) closes. */
export const RESUMABLE_MODES = [
  'profileSelect',
  'title',
  'avatarSelect',
  'hub',
  'dialogue',
  'encounter',
] as const;
export type ResumableMode = (typeof RESUMABLE_MODES)[number];

export const AVATAR_IDS = ['avatar-aban', 'avatar-arta', 'avatar-nika', 'avatar-diyar'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

/**
 * Cosmetic headwear a kid can put on their avatar. 'none' is the uncovered
 * default; every option is a presentation choice, never a gameplay identity.
 */
export const HEADWEAR_IDS = ['none', 'scarf', 'chador', 'kolah', 'kufi', 'beanie'] as const;
export type HeadwearId = (typeof HEADWEAR_IDS)[number];

export function isHeadwearId(value: unknown): value is HeadwearId {
  return typeof value === 'string' && (HEADWEAR_IDS as readonly string[]).includes(value);
}

export const QUEST_IDS = [
  'quest-greeting',
  'quest-helping',
  'quest-tidying',
  'quest-finale',
  'quest-park-kite',
  'quest-river-shell',
  'quest-bread-errand',
  'quest-school-answer',
  'quest-cave-crystal',
] as const;
export type QuestId = (typeof QUEST_IDS)[number];

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';

export const ENCOUNTER_PHASES = [
  'intro',
  'demonstrate',
  'playerChoice',
  'worldResponse',
  'reinforce',
  'complete',
] as const;
export type EncounterPhase = (typeof ENCOUNTER_PHASES)[number];

export type StickerId = `sticker-${string}`;
export type IconId = `icon-${string}`;
export type NpcId = `npc-${string}`;
export type LandmarkId = `landmark-${string}`;
export type AnchorId = `anchor-${string}`;
export type { DiscoveryId, MapId };

export interface QuestProgress {
  readonly status: QuestStatus;
  /** Stable step IDs already completed, used for replay and resume. */
  readonly completedSteps: readonly string[];
  readonly completionCount: number;
}

export interface EncounterState {
  readonly questId: QuestId;
  readonly stepIndex: number;
  readonly phase: EncounterPhase;
  /** Gentle-retry counter. Never blocks progress; only re-demonstrates. */
  readonly retries: number;
  /** Set while the world plays the response to the last choice. */
  readonly lastChoiceIconId: IconId | null;
  readonly lastChoiceCorrect: boolean | null;
}

export interface DialogueState {
  readonly npcId: NpcId;
  readonly nodeId: string;
}

/**
 * The last place the child can safely be restored to. Checkpoints are only
 * written after a *stable* transition (never mid-animation, never mid-encounter).
 */
export interface Checkpoint {
  readonly kind: 'title' | 'hub' | 'questCompleted';
  readonly questId: QuestId | null;
  readonly at: number;
}

export type QualityTier = 'low' | 'medium' | 'high';

export interface AudioSettings {
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  /** 0..1 */
  readonly musicVolume: number;
  /** 0..1 */
  readonly sfxVolume: number;
}

export type SaveHealth = 'fresh' | 'loaded' | 'migrated' | 'recovered';

/** The persisted slice. Only stable domain data — never React/Three.js objects or device IDs. */
export interface PersistedState {
  readonly schemaVersion: number;
  readonly avatarId: AvatarId | null;
  readonly quests: Readonly<Record<QuestId, QuestProgress>>;
  readonly checkpoint: Checkpoint;
  readonly stickers: readonly StickerId[];
  readonly audio: AudioSettings;
  readonly qualityTier: QualityTier;
  readonly lastPlayedAt: number;
  /**
   * Persistent world facts the child has found (hidden entrances, secret
   * places). Additive and tolerant: old saves simply default to [].
   */
  readonly discoveries: readonly DiscoveryId[];
  /** Map the child was last on — restoring it replays a safe local spawn. */
  readonly mapId: MapId;
  /** Spawn anchor on `mapId` — set by each map change, not by walking. */
  readonly mapAnchorId: AnchorId;
}

export interface GameState extends PersistedState {
  readonly mode: Mode;
  /** Mode to return to when an overlay closes. */
  readonly resumeMode: ResumableMode;
  readonly encounter: EncounterState | null;
  readonly dialogue: DialogueState | null;
  /** Current device orientation: recorded session/device state, never persisted. */
  readonly orientation: 'landscape' | 'portrait';
  readonly webglAvailable: boolean;
  readonly saveHealth: SaveHealth;
  /** Non-blocking notice that an unreadable save was set aside for this session. */
  readonly corruptSaveDetected: boolean;
  /**
   * Session-only cosmetic choice. Lives on the profile index (ProfileMeta),
   * never in PersistedState, so it needs no save-schema migration and never
   * changes gameplay.
   */
  readonly headwear: HeadwearId;
  readonly fatalReason: string | null;
  /** Bumped on every transition that should be autosaved. */
  readonly autosaveToken: number;
}

export type Command =
  | {
      readonly type: 'BOOT_LOADED';
      readonly persisted: PersistedState | null;
      readonly health: SaveHealth;
      /** True when at least one player profile exists → land on the picker. */
      readonly hasProfiles?: boolean;
    }
  | { readonly type: 'BOOT_FAILED'; readonly reason: string }
  | { readonly type: 'ORIENTATION_CHANGED'; readonly orientation: 'landscape' | 'portrait' }
  | { readonly type: 'WEBGL_AVAILABILITY_CHANGED'; readonly available: boolean }
  | {
      readonly type: 'SELECT_PROFILE';
      readonly persisted: PersistedState | null;
      readonly health: SaveHealth;
    }
  | { readonly type: 'START_NEW_PLAYER' }
  | { readonly type: 'SWITCH_PLAYER' }
  | { readonly type: 'START_PRESSED' }
  | { readonly type: 'SELECT_AVATAR'; readonly avatarId: AvatarId }
  | { readonly type: 'SET_HEADWEAR'; readonly headwear: HeadwearId }
  | { readonly type: 'DISCOVER'; readonly discoveryId: DiscoveryId }
  | { readonly type: 'CHANGE_MAP'; readonly mapId: MapId; readonly anchorId: AnchorId }
  | { readonly type: 'ENTER_HUB' }
  | { readonly type: 'OPEN_DIALOGUE'; readonly npcId: NpcId; readonly nodeId: string }
  | { readonly type: 'CLOSE_DIALOGUE' }
  | { readonly type: 'START_QUEST'; readonly questId: QuestId }
  | { readonly type: 'ADVANCE_PHASE' }
  | { readonly type: 'CHOOSE'; readonly iconId: IconId; readonly correct: boolean }
  | { readonly type: 'ABANDON_ENCOUNTER' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'OPEN_PARENT_GATE' }
  | { readonly type: 'PARENT_GATE_PASSED' }
  | { readonly type: 'CLOSE_PARENT' }
  | { readonly type: 'SET_AUDIO_SETTINGS'; readonly audio: Partial<AudioSettings> }
  | { readonly type: 'SET_QUALITY_TIER'; readonly tier: QualityTier }
  | { readonly type: 'RESET_PROGRESS' }
  | { readonly type: 'FATAL_ERROR'; readonly reason: string };

export type CommandType = Command['type'];
