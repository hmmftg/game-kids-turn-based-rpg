import type { Citation, RightsMetadata, ReviewMetadata, SourceRecord } from '../types.ts';

/**
 * DRAFT source cards.
 *
 * No hadith, quotation, translation or bibliographic detail may be invented.
 * Every citation field below is deliberately empty and stays empty until a
 * permissioned edition and a named reviewer supply verified values; the
 * validator rejects any draft record that contains quotation text.
 */
const EMPTY_CITATION: Citation = {
  workTitle: '',
  author: '',
  edition: '',
  publisher: '',
  volume: '',
  page: '',
  chapter: '',
  hadithNumber: '',
  sourceUrl: '',
};

const PENDING_RIGHTS: RightsMetadata = {
  mayReproduceQuotation: false,
  mayReproduceTranslation: false,
  attributionRequirement: 'در انتظار سند مجوز',
  licenseNote: 'کد بازی با پروانه‌ی MIT است؛ محتوای منبع پروانه‌ی جداگانه دارد.',
};

const PENDING_REVIEW: ReviewMetadata = {
  status: 'draft',
  scholarReviewer: '',
  childEditorReviewer: '',
  persianProofreader: '',
  reviewedAt: '',
  revisionNotes: 'در انتظار نسخه‌ی دارای مجوز و بازبینی عالم نام‌برده.',
};

export const SOURCE_RECORDS: readonly SourceRecord[] = [
  {
    id: 'source-greeting-draft',
    locale: 'fa-IR',
    relatedQuestId: 'quest-greeting',
    principleSummaryFa: 'سلام کردن و خوش‌رویی با دیگران (خلاصه‌ی پیش‌نویس، بدون نقل‌قول).',
    arabicQuotation: '',
    persianTranslation: '',
    citation: EMPTY_CITATION,
    rights: PENDING_RIGHTS,
    learningObjective: 'کودک سلام کردن را به‌عنوان رفتار روزمره تمرین کند.',
    ageBand: '3-7',
    mechanicNote: 'بازی فقط رفتار روزمره را نشان می‌دهد و هیچ ادعای دینی مطرح نمی‌کند.',
    review: PENDING_REVIEW,
  },
  {
    id: 'source-helping-draft',
    locale: 'fa-IR',
    relatedQuestId: 'quest-helping',
    principleSummaryFa: 'کمک کردن به دیگران در کار روزمره (خلاصه‌ی پیش‌نویس، بدون نقل‌قول).',
    arabicQuotation: '',
    persianTranslation: '',
    citation: EMPTY_CITATION,
    rights: PENDING_RIGHTS,
    learningObjective: 'کودک کمک کردن ساده و امن را تجربه کند.',
    ageBand: '3-7',
    mechanicNote: 'کمک به شکل حمل سبد سبک و بدون خطر نمایش داده می‌شود.',
    review: PENDING_REVIEW,
  },
  {
    id: 'source-tidying-draft',
    locale: 'fa-IR',
    relatedQuestId: 'quest-tidying',
    principleSummaryFa: 'پاکیزگی و نظم در فضای مشترک (خلاصه‌ی پیش‌نویس، بدون نقل‌قول).',
    arabicQuotation: '',
    persianTranslation: '',
    citation: EMPTY_CITATION,
    rights: PENDING_RIGHTS,
    learningObjective: 'کودک جمع کردن وسایل و شستن دست‌ها را تمرین کند.',
    ageBand: '3-7',
    mechanicNote: 'اشیاء بی‌خطر و دسته‌بندی ساده؛ بدون تقلید رفتار خطرناک.',
    review: PENDING_REVIEW,
  },
  {
    id: 'source-finale-draft',
    locale: 'fa-IR',
    relatedQuestId: 'quest-finale',
    principleSummaryFa: 'همکاری برای آماده‌سازی جشن محله (خلاصه‌ی پیش‌نویس، بدون نقل‌قول).',
    arabicQuotation: '',
    persianTranslation: '',
    citation: EMPTY_CITATION,
    rights: PENDING_RIGHTS,
    learningObjective: 'کودک سه رفتار آموخته‌شده را کنار هم به کار ببرد.',
    ageBand: '3-7',
    mechanicNote: 'پایان بازی جشن داستانی است، نه پاداش معنوی کمّی‌شده.',
    review: PENDING_REVIEW,
  },
];

export function getSourceRecord(id: SourceRecord['id']): SourceRecord | null {
  return SOURCE_RECORDS.find((record) => record.id === id) ?? null;
}
