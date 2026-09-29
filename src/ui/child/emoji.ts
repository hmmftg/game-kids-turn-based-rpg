import { FA } from '../../content/fa/strings.ts';
import type { AvatarId, HeadwearId, QuestId } from '../../domain/game/types.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';

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
  'npc-baker': '🧑‍🍳',
  'npc-teacher': '👩‍🏫',
  'npc-child-ali': '🧒',
  'npc-park-keeper': '🧑‍🌾',
  'npc-child-sara': '👧',
  'npc-fisher': '🎣',
};

export const QUEST_EMOJI: Readonly<Record<QuestId, string>> = {
  'quest-greeting': '👋',
  'quest-helping': '🧺',
  'quest-tidying': '🧹',
  'quest-finale': '🎉',
  'quest-park-kite': '🪁',
  'quest-river-shell': '🐚',
  'quest-bread-errand': '🍞',
  'quest-school-answer': '📚',
};

/** Persian name per avatar preset; the SVG portrait carries the identity. */
export const AVATAR_LABEL: Readonly<Record<AvatarId, string>> = {
  'avatar-aban': FA.avatarAban,
  'avatar-arta': FA.avatarArta,
  'avatar-nika': FA.avatarNika,
  'avatar-diyar': FA.avatarDiyar,
};

/** Persian label per headwear option; the SVG pictogram carries the meaning. */
export const HEADWEAR_LABEL: Readonly<Record<HeadwearId, string>> = {
  none: FA.headwearNone,
  scarf: FA.headwearScarf,
  chador: FA.headwearChador,
  kolah: FA.headwearKolah,
  kufi: FA.headwearKufi,
  beanie: FA.headwearBeanie,
};

/** Pickable badges a kid uses to spot their own card on the player picker. */
export const BADGE_EMOJIS = ['🐱', '🦊', '🐰', '🐻', '🦁', '🐸', '🐼', '🐵'] as const;

/** First badge no existing profile uses, so siblings rarely collide. */
export function pickProfileBadge(existing: readonly ProfileMeta[]): string {
  const used = new Set(existing.map((profile) => profile.badge));
  return BADGE_EMOJIS.find((badge) => !used.has(badge)) ?? BADGE_EMOJIS[0];
}

export function npcEmoji(npcId: string): string {
  return NPC_EMOJI[npcId] ?? '💬';
}

/** Presentation cue for a dialogue line's `emotion` metadata. */
export function emotionEmoji(emotion: string | undefined): string | null {
  switch (emotion) {
    case 'happy':
      return '😊';
    case 'calm':
      return '🙂';
    case 'thoughtful':
      return '🤔';
    case 'surprised':
      return '😮';
    default:
      return null;
  }
}

export function questEmoji(questId: QuestId): string {
  return QUEST_EMOJI[questId] ?? '⭐';
}
