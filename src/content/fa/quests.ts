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
  { npcId: 'npc-baker', nameFa: 'نانوا', roleFa: 'نانوایی محله' },
  { npcId: 'npc-teacher', nameFa: 'معلم', roleFa: 'کلاس محله' },
  { npcId: 'npc-child-ali', nameFa: 'علی', roleFa: 'هم‌بازی کلاس' },
  { npcId: 'npc-park-keeper', nameFa: 'نگهبان پارک', roleFa: 'پارک محله' },
  { npcId: 'npc-child-sara', nameFa: 'سارا', roleFa: 'هم‌بازی پارک' },
  { npcId: 'npc-fisher', nameFa: 'ماهیگیر', roleFa: 'کنار رودخانه' },
];

export const QUEST_COPY: readonly QuestCopy[] = [
  {
    questId: 'quest-greeting',
    titleFa: 'سلام و ادب',
    childSummaryFa: 'وقتی کسی می‌آید، سلام می‌کنیم.',
    objectiveFa: 'برو پیش همسایه',
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
    objectiveFa: 'برو پیش مغازه‌دار',
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
    objectiveFa: 'برو پیش باغبان',
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
    objectiveFa: 'برو به میدان',
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
    parentNoteFa: 'پایان زنجیره‌ی فصل‌ها: سلام، کمک و پاکیزگی در یک جشن جمع می‌شوند.',
    sourceIds: ['source-finale-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-park-kite',
    titleFa: 'بادبادک گمشده',
    childSummaryFa: 'بادبادک افتاده را برمی‌داریم و به صاحبش می‌دهیم.',
    objectiveFa: 'برو به پارک',
    steps: [
      {
        stepId: 'park-kite-1',
        introFa: 'بادبادک سارا روی زمین افتاده.',
        demonstrateFa: 'نگاه کن: بادبادک را برمی‌داریم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'بادبادک را برداشتی.',
        retryFa: 'اشکالی ندارد. دوباره ببین.',
      },
      {
        stepId: 'park-kite-2',
        introFa: 'سارا همین‌جا ایستاده.',
        demonstrateFa: 'نگاه کن: بادبادک را بهش می‌دهیم.',
        promptFa: 'بادبادک را به کی بدهی؟',
        successFa: 'سارا بادبادکش را گرفت. خوشحال شد.',
        retryFa: 'باشد، یک بار دیگر با هم.',
      },
    ],
    completionFa: 'برچسب بادبادک را گرفتی.',
    stickerLabelFa: 'برچسب بادبادک',
    sourceIds: ['source-park-kite-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-river-shell',
    titleFa: 'کنار رودخانه',
    childSummaryFa: 'کنار رودخانه ماهی را می‌بینیم و یک صدف پیدا می‌کنیم.',
    objectiveFa: 'برو به رودخانه',
    steps: [
      {
        stepId: 'river-shell-1',
        introFa: 'یک ماهی کوچک از آب بیرون پرید.',
        demonstrateFa: 'نگاه کن: ماهی را می‌بینیم.',
        promptFa: 'ماهی کجاست؟',
        successFa: 'ماهی را دیدی. از آب پرید.',
        retryFa: 'اشکالی ندارد. دوباره نگاه کن.',
      },
      {
        stepId: 'river-shell-2',
        introFa: 'یک صدف قشنگ کنار آب افتاده.',
        demonstrateFa: 'نگاه کن: صدف را برمی‌داریم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'صدف را برداشتی.',
        retryFa: 'باشد، دوباره ببین.',
      },
      {
        stepId: 'river-shell-3',
        introFa: 'سبد ماهیگیر همین‌جاست.',
        demonstrateFa: 'نگاه کن: صدف را در سبد می‌گذاریم.',
        promptFa: 'صدف را کجا بگذاری؟',
        successFa: 'صدف داخل سبد رفت. ماهیگیر لبخند زد.',
        retryFa: 'اشکالی ندارد. یک بار دیگر.',
      },
    ],
    completionFa: 'برچسب صدف را گرفتی.',
    stickerLabelFa: 'برچسب صدف',
    sourceIds: ['source-river-shell-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-bread-errand',
    titleFa: 'نان داغ',
    childSummaryFa: 'نان داغ را از نانوا می‌گیریم و به مغازه می‌بریم.',
    objectiveFa: 'برو به نانوایی',
    steps: [
      {
        stepId: 'bread-errand-1',
        introFa: 'نان داغ روی سفره‌ی نانواست.',
        demonstrateFa: 'نگاه کن: نان را برمی‌داریم.',
        promptFa: 'حالا تو انتخاب کن.',
        successFa: 'نان را برداشتی.',
        retryFa: 'اشکالی ندارد. دوباره ببین.',
      },
      {
        stepId: 'bread-errand-2',
        introFa: 'مغازه‌دار نان را می‌خواهد.',
        demonstrateFa: 'نگاه کن: نان را روی قفسه می‌گذاریم.',
        promptFa: 'نان را کجا بگذاری؟',
        successFa: 'نان سر جایش رفت. مغازه‌دار خوشحال شد.',
        retryFa: 'باشد، یک بار دیگر با هم.',
      },
    ],
    completionFa: 'برچسب نان را گرفتی.',
    stickerLabelFa: 'برچسب نان',
    sourceIds: ['source-bread-errand-draft'],
    review: DRAFT_REVIEW,
  },
  {
    questId: 'quest-school-answer',
    titleFa: 'کلاس و بازی',
    childSummaryFa: 'با معلم بازی می‌کنیم و چیز درست را نشان می‌دهیم.',
    objectiveFa: 'برو به کلاس',
    steps: [
      {
        stepId: 'school-answer-1',
        introFa: 'معلم کتاب را نشان می‌دهد.',
        demonstrateFa: 'نگاه کن: کتاب را نشان می‌دهیم.',
        promptFa: 'کتاب کجاست؟',
        successFa: 'درست گفتی. کتاب بود.',
        retryFa: 'اشکالی ندارد. دوباره نگاه کن.',
      },
      {
        stepId: 'school-answer-2',
        introFa: 'علی توپش را آورده.',
        demonstrateFa: 'نگاه کن: توپ را نشان می‌دهیم.',
        promptFa: 'توپ کجاست؟',
        successFa: 'درست گفتی. توپ بود.',
        retryFa: 'باشد، یک بار دیگر.',
      },
    ],
    completionFa: 'برچسب کلاس را گرفتی.',
    stickerLabelFa: 'برچسب کلاس',
    sourceIds: ['source-school-answer-draft'],
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
