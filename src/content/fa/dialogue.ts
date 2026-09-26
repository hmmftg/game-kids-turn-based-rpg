import type { DialogueNode, ReviewMetadata } from '../types.ts';

const DRAFT_REVIEW: ReviewMetadata = {
  status: 'draft',
  scholarReviewer: '',
  childEditorReviewer: '',
  persianProofreader: '',
  reviewedAt: '',
  revisionNotes: 'پیش‌نویس داخلی؛ بدون ادعای دینی و بدون ارجاع.',
};

/** One short idea per node; the child can always leave without consequence. */
export const DIALOGUE_NODES: readonly DialogueNode[] = [
  {
    id: 'neighbour-intro',
    npcId: 'npc-neighbour',
    textFa: 'همسایه از راه رسیده است.',
    iconId: 'icon-greet',
    offersQuestId: 'quest-greeting',
    review: DRAFT_REVIEW,
  },
  {
    id: 'shopkeeper-intro',
    npcId: 'npc-shopkeeper',
    textFa: 'سبد مغازه‌دار سنگین است.',
    iconId: 'icon-help-carry',
    offersQuestId: 'quest-helping',
    review: DRAFT_REVIEW,
  },
  {
    id: 'gardener-intro',
    npcId: 'npc-gardener',
    textFa: 'باغچه کمی به‌هم‌ریخته است.',
    iconId: 'icon-pick-up',
    offersQuestId: 'quest-tidying',
    review: DRAFT_REVIEW,
  },
  {
    id: 'elder-intro',
    npcId: 'npc-elder',
    textFa: 'برای جشن محله آماده می‌شویم.',
    iconId: 'icon-sticker',
    offersQuestId: 'quest-finale',
    review: DRAFT_REVIEW,
  },
  {
    id: 'friend-idle',
    npcId: 'npc-child-friend',
    textFa: 'دوستت در محله بازی می‌کند.',
    iconId: 'icon-smile',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
];

export function getDialogueNode(id: string): DialogueNode | null {
  return DIALOGUE_NODES.find((node) => node.id === id) ?? null;
}
