import type { AvatarId, QuestId } from '../../domain/game/types.ts';

/**
 * Emoji decoration for pre-readers: instantly recognisable, colourful, and
 * always paired with the Persian label — they never carry meaning alone.
 * System emoji fonts render them, so they work fully offline.
 */
export const NPC_EMOJI: Readonly<Record<string, string>> = {
  'npc-neighbour': '🧕',
  'npc-shopkeeper': '🧑‍💼',
  'npc-gardener': '👨‍🌾',
  'npc-elder': '👵',
  'npc-child-friend': '🧒',
};

export const QUEST_EMOJI: Readonly<Record<QuestId, string>> = {
  'quest-greeting': '👋',
  'quest-helping': '🧺',
  'quest-tidying': '🧹',
  'quest-finale': '🎉',
};

export const AVATAR_EMOJI: Readonly<Record<AvatarId, string>> = {
  'avatar-aban': '👧',
  'avatar-arta': '🧒',
};

export function npcEmoji(npcId: string): string {
  return NPC_EMOJI[npcId] ?? '💬';
}

export function questEmoji(questId: QuestId): string {
  return QUEST_EMOJI[questId] ?? '⭐';
}
