import { createFreshPersistedState, DEFAULT_AUDIO, SAVE_SCHEMA_VERSION } from './initialState.ts';
import { AVATAR_IDS, QUEST_IDS } from './types.ts';
import type {
  AudioSettings,
  AvatarId,
  Checkpoint,
  PersistedState,
  QualityTier,
  QuestId,
  QuestProgress,
  StickerId,
} from './types.ts';

export type SaveParseResult =
  | { readonly ok: true; readonly state: PersistedState; readonly migrated: boolean }
  | { readonly ok: false; readonly reason: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseAvatarId(value: unknown): AvatarId | null {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)
    ? (value as AvatarId)
    : null;
}

function parseQualityTier(value: unknown): QualityTier {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function parseAudio(value: unknown): AudioSettings {
  if (!isRecord(value)) return DEFAULT_AUDIO;
  return {
    musicMuted: value['musicMuted'] === true,
    sfxMuted: value['sfxMuted'] === true,
    musicVolume: clamp01(value['musicVolume'], DEFAULT_AUDIO.musicVolume),
    sfxVolume: clamp01(value['sfxVolume'], DEFAULT_AUDIO.sfxVolume),
  };
}

function parseQuestProgress(value: unknown): QuestProgress {
  if (!isRecord(value)) return { status: 'locked', completedSteps: [], completionCount: 0 };
  const status = value['status'];
  return {
    status:
      status === 'completed' || status === 'available' || status === 'active' ? status : 'locked',
    completedSteps: asStringArray(value['completedSteps']),
    completionCount:
      typeof value['completionCount'] === 'number' && value['completionCount'] >= 0
        ? Math.floor(value['completionCount'])
        : 0,
  };
}

function parseQuests(value: unknown): Record<QuestId, QuestProgress> {
  const quests = {} as Record<QuestId, QuestProgress>;
  const source = isRecord(value) ? value : {};
  for (const id of QUEST_IDS) quests[id] = parseQuestProgress(source[id]);
  return quests;
}

function parseCheckpoint(value: unknown, fallbackAt: number): Checkpoint {
  if (!isRecord(value)) return { kind: 'title', questId: null, at: fallbackAt };
  const kind = value['kind'];
  const questId = value['questId'];
  return {
    kind: kind === 'hub' || kind === 'questCompleted' ? kind : 'title',
    questId:
      typeof questId === 'string' && (QUEST_IDS as readonly string[]).includes(questId)
        ? (questId as QuestId)
        : null,
    at: typeof value['at'] === 'number' ? value['at'] : fallbackAt,
  };
}

/** v1 → v2: single `muted` flag became separate music/SFX buses. */
function migrateV1(raw: UnknownRecord, now: number): PersistedState {
  const fresh = createFreshPersistedState(now);
  const completed = new Set(asStringArray(raw['completedQuests']));
  const quests = {} as Record<QuestId, QuestProgress>;
  for (const id of QUEST_IDS) {
    quests[id] = completed.has(id)
      ? { status: 'completed', completedSteps: [], completionCount: 1 }
      : { status: 'locked', completedSteps: [], completionCount: 0 };
  }
  const muted = raw['muted'] === true;
  return {
    ...fresh,
    avatarId: parseAvatarId(raw['avatar'] ?? raw['avatarId']),
    quests,
    stickers: asStringArray(raw['stickers']) as StickerId[],
    audio: { ...DEFAULT_AUDIO, musicMuted: muted, sfxMuted: muted },
    checkpoint: completed.size > 0 ? { kind: 'hub', questId: null, at: now } : fresh.checkpoint,
    lastPlayedAt: typeof raw['lastPlayedAt'] === 'number' ? raw['lastPlayedAt'] : now,
  };
}

function parseV2(raw: UnknownRecord, now: number): PersistedState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    avatarId: parseAvatarId(raw['avatarId']),
    quests: parseQuests(raw['quests']),
    checkpoint: parseCheckpoint(raw['checkpoint'], now),
    stickers: asStringArray(raw['stickers']) as StickerId[],
    audio: parseAudio(raw['audio']),
    qualityTier: parseQualityTier(raw['qualityTier']),
    lastPlayedAt: typeof raw['lastPlayedAt'] === 'number' ? raw['lastPlayedAt'] : now,
  };
}

/**
 * Validates and migrates a raw save payload. Unreadable data never throws:
 * the caller keeps the original bytes in memory for the session and offers a
 * gated reset instead of crashing the child's session.
 */
export function parseSave(raw: unknown, now = 0): SaveParseResult {
  if (!isRecord(raw)) return { ok: false, reason: 'save-not-an-object' };
  const version = raw['schemaVersion'] ?? raw['version'];
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, reason: 'missing-schema-version' };
  }
  if (version > SAVE_SCHEMA_VERSION) return { ok: false, reason: 'save-from-newer-version' };
  if (version <= 0) return { ok: false, reason: 'invalid-schema-version' };
  if (version === 1) return { ok: true, state: migrateV1(raw, now), migrated: true };
  return { ok: true, state: parseV2(raw, now), migrated: false };
}
