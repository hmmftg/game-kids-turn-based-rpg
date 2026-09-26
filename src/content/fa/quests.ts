import type { QuestId } from '../../domain/game/types.ts';
import type { NpcCopy, QuestCopy, ReviewMetadata } from '../types.ts';

/**
 * DRAFT child-facing copy.
 *
 * Every record below is `status: 'draft'`: the wording is a placeholder written
 * without any religious claim, quotation or attribution, and it must be replaced
 * by reviewer-approved text before release. Reviewer fields are intentionally
 * empty — nothing here has been reviewed.
 */
const DRAFT_REVIEW: ReviewMetadata = {
  status: 'draft',
  scholarReviewer: '',
  childEditorReviewer: '',
  persianProofreader: '',
  reviewedAt: '',
  revisionNotes: 'پیش‌نویس داخلی؛ بدون ادعای دینی و بدون ارجاع. منتظر بازبینی.',
};

export const NPCS: readonly NpcCopy[] = [
  { npcId: 'npc-neighbour', nameFa: 'همسایه', roleFa: 'همسایه‌ی کنار در' },
  { npcId: 'npc-shopkeeper', nameFa: 'مغازه‌دار', roleFa: 'مغازه‌ی کوچک محله' },
  { npcId: 'npc-gardener', nameFa: 'باغبان', roleFa: 'باغچه‌ی محله' },
  { npcId: 'npc-elder', nameFa: 'مادربزرگ', roleFa: 'بزرگ‌تر محله' },
  { npcId: 'npc-child-friend', nameFa: 'دوست', roleFa: 'هم‌بازی' },
];

export const QUEST_COPY: readonly QuestCopy[] = [
  {
    questId: 'quest-greeting',
    titleFa: 'سلام و ادب',
    childSummaryFa: 'وقتی کسی می‌آید، سلام می‌کنیم.',
    steps: [
      {
        stepId: 'greeting-1',
        introFa: 'همسایه از راه رسید.',
        demonstrateFa: 'نگاه کن: دست تکان می‌دهیم و سلام می‌کنیم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'سلام کردی. همسایه خوشحال شد.',
        retryFa: 'اشکالی ندارد. یک بار دیگر با هم ببینیم.',
      },
      {
        stepId: 'greeting-2',
        introFa: 'همسایه به تو لبخند زد.',
        demonstrateFa: 'نگاه کن: لبخند می‌زنیم.',
        promptFa: 'تو چه می‌کنی؟',
        successFa: 'لبخند زدی. چه خوب!',
        retryFa: 'باشد، دوباره نشانت می‌دهم.',
      },
    ],
    completionFa: 'اولین برچسب را گرفتی: سلام.',
    stickerLabelFa: 'برچسب سلام',
    sourceIds: ['source-greeting-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-helping',
    titleFa: 'کمک و مهربانی',
    childSummaryFa: 'وقتی کسی سبد سنگین دارد، کمک می‌کنیم.',
    steps: [
      {
        stepId: 'helping-1',
        introFa: 'سبد مغازه‌دار سنگین است.',
        demonstrateFa: 'نگاه کن: با هم سبد را برمی‌داریم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'با هم سبد را برداشتید.',
        retryFa: 'اشکالی ندارد. دوباره نگاه کن.',
      },
      {
        stepId: 'helping-2',
        introFa: 'سبد باید سر جایش برود.',
        demonstrateFa: 'نگاه کن: سبد را آرام می‌گذاریم.',
        promptFa: 'تو چه می‌کنی؟',
        successFa: 'سبد سر جایش رفت.',
        retryFa: 'باشد، یک بار دیگر با هم.',
      },
    ],
    completionFa: 'برچسب کمک را گرفتی.',
    stickerLabelFa: 'برچسب کمک',
    sourceIds: ['source-helping-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-tidying',
    titleFa: 'پاکیزگی و نظم',
    childSummaryFa: 'چیزهای روی زمین را جمع می‌کنیم و دست‌هایمان را می‌شوییم.',
    steps: [
      {
        stepId: 'tidying-1',
        introFa: 'چند چیز روی زمین باغچه افتاده.',
        demonstrateFa: 'نگاه کن: آرام برمی‌داریم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'برداشتی. آفرین.',
        retryFa: 'اشکالی ندارد. دوباره ببین.',
      },
      {
        stepId: 'tidying-2',
        introFa: 'سبد همین‌جاست.',
        demonstrateFa: 'نگاه کن: داخل سبد می‌گذاریم.',
        promptFa: 'تو چه می‌کنی؟',
        successFa: 'باغچه مرتب شد.',
        retryFa: 'باشد، یک بار دیگر.',
      },
      {
        stepId: 'tidying-3',
        introFa: 'کار تمام شد.',
        demonstrateFa: 'نگاه کن: دست‌ها را می‌شوییم.',
        promptFa: 'حالا نوبت توست.',
        successFa: 'دست‌هایت تمیز شد.',
        retryFa: 'اشکالی ندارد. دوباره نشانت می‌دهم.',
      },
    ],
    completionFa: 'برچسب پاکیزگی را گرفتی.',
    stickerLabelFa: 'برچسب پاکیزگی',
    sourceIds: ['source-tidying-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-finale',
    titleFa: 'جشن محله',
    childSummaryFa: 'با هم محله را برای جشن آماده می‌کنیم.',
    steps: [
      {
        stepId: 'finale-1',
        introFa: 'مادربزرگ به جشن آمد.',
        demonstrateFa: 'نگاه کن: سلام می‌کنیم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'سلام کردی.',
        retryFa: 'اشکالی ندارد. دوباره ببین.',
      },
      {
        stepId: 'finale-2',
        introFa: 'دوستت سبد میوه دارد.',
        demonstrateFa: 'نگاه کن: کمک می‌کنیم.',
        promptFa: 'تو چه می‌کنی؟',
        successFa: 'با هم بردید.',
        retryFa: 'باشد، یک بار دیگر.',
      },
      {
        stepId: 'finale-3',
        introFa: 'چند برگ روی زمین مانده.',
        demonstrateFa: 'نگاه کن: جمع می‌کنیم.',
        promptFa: 'حالا نوبت توست.',
        successFa: 'محله آماده‌ی جشن شد.',
        retryFa: 'اشکالی ندارد. دوباره نگاه کن.',
      },
    ],
    completionFa: 'جشن محله برپا شد. برچسب جشن را گرفتی.',
    stickerLabelFa: 'برچسب جشن',
    sourceIds: ['source-finale-draft'],
    review: DRAFT_REVIEW,
  },
];

const BY_ID = new Map<QuestId, QuestCopy>(QUEST_COPY.map((quest) => [quest.questId, quest]));

export function getQuestCopy(questId: QuestId): QuestCopy {
  const copy = BY_ID.get(questId);
  if (!copy) throw new Error(`Missing quest copy: ${questId}`);
  return copy;
}

export function getStepCopy(questId: QuestId, stepId: string) {
  return getQuestCopy(questId).steps.find((step) => step.stepId === stepId) ?? null;
}

export function getNpcCopy(npcId: string): NpcCopy | null {
  return NPCS.find((npc) => npc.npcId === npcId) ?? null;
}
