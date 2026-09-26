/** Persian UI copy. Short, concrete, no shame/fear/violence and no merit claims. */
export const FA = {
  appTitle: 'محله‌ی مهربانی',
  draftBadge: 'محتوای پیش‌نویس',
  draftBadgeLong: 'این نسخه آزمایشی است و متن‌ها هنوز بازبینی نشده‌اند.',

  loading: 'در حال آماده شدن…',
  loadingHint: 'کمی صبر کن',
  play: 'بازی',
  resume: 'ادامه',
  newGame: 'از اول',
  chooseAvatar: 'کدام را دوست داری؟',
  avatarAban: 'آبان',
  avatarArta: 'آرتا',
  avatarHint: 'هر دو مثل هم بازی می‌کنند',

  rotateTitle: 'گوشی را بچرخان',
  rotateHint: 'بازی در حالت افقی انجام می‌شود',

  webglTitle: 'این دستگاه نمی‌تواند تصویر سه‌بعدی را نشان دهد',
  webglHint: 'می‌توانی با دکمه‌های بزرگ بازی کنی',
  webglAction: 'ادامه با دکمه‌ها',

  errorTitle: 'یک مشکل کوچک پیش آمد',
  errorHint: 'دوباره شروع کن',
  errorAction: 'شروع دوباره',

  pause: 'توقف',
  resumePlay: 'برگرد به بازی',
  music: 'آهنگ',
  sfx: 'صداها',
  on: 'روشن',
  off: 'خاموش',
  quality: 'کیفیت تصویر',
  qualityLow: 'ساده',
  qualityMedium: 'معمولی',
  qualityHigh: 'بالا',

  questTrail: 'کارهای من',
  stickers: 'برچسب‌ها',
  noStickers: 'هنوز برچسبی نداری',
  questLocked: 'هنوز باز نشده',
  questAvailable: 'آماده',
  questCompleted: 'انجام شد',
  goThere: 'برو آنجا',
  again: 'یک بار دیگر',
  back: 'برگرد',
  next: 'ادامه',
  watchAgain: 'دوباره نشانم بده',

  cancelWalk: 'ایستادن',
  hotspotHint: 'جای چشمک‌زن را لمس کن',

  parentArea: 'بخش بزرگ‌ترها',
  parentGateTitle: 'این بخش برای بزرگ‌ترهاست',
  parentGateHint: 'دکمه را سه ثانیه نگه دار',
  parentGateHolding: 'نگه دار…',
  parentGateCancel: 'بی‌خیال',
  parentSources: 'منبع‌ها و ارجاع‌ها',
  parentCredits: 'اعتبارها و مجوزها',
  parentPrivacy: 'حریم خصوصی',
  parentDiagnostics: 'وضعیت فنی دستگاه',
  parentInstall: 'نصب و اجرای آفلاین',
  parentReset: 'پاک کردن پیشرفت',
  parentResetConfirm: 'همه‌ی پیشرفت پاک شود؟',
  parentResetYes: 'بله، پاک کن',
  parentResetNo: 'نه',
  parentClose: 'بستن',

  privacyBody:
    'این بازی هیچ حسابی، تبلیغ، ردیاب یا ارتباط اینترنتی ندارد. پیشرفت فقط روی همین دستگاه ذخیره می‌شود و مرورگر ممکن است آن را پاک کند.',
  installBody:
    'برای اجرای آفلاین، بازی را یک بار کامل باز کنید تا فایل‌ها ذخیره شوند. در iOS از دکمه‌ی Share و گزینه‌ی Add to Home Screen استفاده کنید.',
  sourcesDraftBody:
    'متن‌ها و ارجاع‌ها هنوز پیش‌نویس‌اند و منتظر نسخه‌های دارای مجوز و تأیید بازبین نام‌برده هستند. هیچ نقل‌قول دینی در این نسخه ارائه نشده است.',

  offlineReady: 'بازی برای حالت آفلاین آماده است',
  offlineCaching: 'در حال ذخیره‌سازی برای حالت آفلاین…',
  updateAvailable: 'نسخه‌ی تازه آماده است',
  updateApply: 'به‌روزرسانی',
  updateLater: 'بعداً',

  corruptSave: 'پیشرفت قبلی خوانده نشد. می‌توانی از اول شروع کنی.',
  finaleTitle: 'جشن محله',
  finaleBody: 'با هم محله را آماده کردیم.',
} as const;

export type StringKey = keyof typeof FA;
