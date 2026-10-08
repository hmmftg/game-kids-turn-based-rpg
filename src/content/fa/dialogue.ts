import type { DialogueNode, ReviewMetadata } from '../types.ts';

const DRAFT_REVIEW: ReviewMetadata = {
  status: 'draft',
  scholarReviewer: '',
  childEditorReviewer: '',
  persianProofreader: '',
  reviewedAt: '',
  revisionNotes: 'پیش‌نویس داخلی؛ بدون ادعای دینی و بدون ارجاع.',
};

/**
 * The dialogue graph — story lives in data, not components.
 *
 * One short idea per line; the child steps through `lines` one beat at a time
 * and can always leave without consequence. `choices` carry stable ids and
 * resolve to other nodes (branching); `nextNodeId` is a linear continuation.
 * `emotion`/`reaction`/`pose`/`soundCue` are non-text narrative cues the UI
 * maps to presentation without the engine depending on UI code.
 */
export const DIALOGUE_NODES: readonly DialogueNode[] = [
  {
    id: 'neighbour-intro',
    npcId: 'npc-neighbour',
    textFa: 'همسایه از راه رسیده است.',
    iconId: 'icon-greet',
    offersQuestId: 'quest-greeting',
    lines: [
      { speakerId: 'npc-neighbour', textFa: 'همسایه از راه رسیده است.', emotion: 'calm' },
      {
        speakerId: 'npc-neighbour',
        textFa: 'می‌خواهی بیشتر بدانی؟',
        emotion: 'happy',
        reaction: 'wave',
      },
    ],
    choices: [
      {
        id: 'neighbour-choice-more',
        iconId: 'icon-smile',
        labelFa: 'بیشتر',
        nextNodeId: 'neighbour-more',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'neighbour-more',
    npcId: 'npc-neighbour',
    textFa: 'همسایه همیشه خوش‌اخلاق است.',
    iconId: 'icon-smile',
    offersQuestId: null,
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
  {
    id: 'baker-intro',
    npcId: 'npc-baker',
    textFa: 'نان تازه از تنور رسید.',
    iconId: 'icon-take-bread',
    offersQuestId: 'quest-bread-errand',
    lines: [
      { speakerId: 'npc-baker', textFa: 'نان تازه از تنور رسید.', emotion: 'happy' },
      {
        speakerId: 'npc-baker',
        textFa: 'بوی خوبش همه‌جا را گرفته.',
        emotion: 'happy',
        reaction: 'point',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-intro',
    npcId: 'npc-teacher',
    textFa: 'معلم کلاس امروز چیز تازه دارد.',
    iconId: 'icon-watch',
    offersQuestId: 'quest-school-answer',
    lines: [
      {
        speakerId: 'npc-teacher',
        textFa: 'معلم کلاس امروز چیز تازه دارد.',
        emotion: 'calm',
      },
      {
        speakerId: 'npc-teacher',
        textFa: 'می‌خواهی بازی کنی یا قصه بشنوی؟',
        emotion: 'happy',
        reaction: 'wave',
      },
    ],
    choices: [
      {
        id: 'teacher-choice-play',
        iconId: 'icon-play',
        labelFa: 'بازی',
        nextNodeId: 'teacher-play',
      },
      {
        id: 'teacher-choice-story',
        iconId: 'icon-watch',
        labelFa: 'قصه',
        nextNodeId: 'teacher-story',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-play',
    npcId: 'npc-teacher',
    textFa: 'معلم با بچه‌ها بازی دایره‌ای می‌کند.',
    iconId: 'icon-play',
    offersQuestId: null,
    lines: [
      {
        speakerId: 'npc-teacher',
        textFa: 'معلم با بچه‌ها بازی دایره‌ای می‌کند.',
        emotion: 'happy',
        reaction: 'clap',
      },
      {
        speakerId: 'npc-child-ali',
        textFa: 'علی هم وسط دایره ایستاده.',
        emotion: 'surprised',
        reaction: 'wave',
      },
    ],
    parentNoteFa: 'بازی گروهی ساده؛ بدون رقابت و بازنده.',
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-story',
    npcId: 'npc-teacher',
    textFa: 'روزی جوجه به مادرش کمک کرد و لبخند زدند.',
    iconId: 'icon-watch',
    offersQuestId: null,
    parentNoteFa: 'قصه‌ی کوتاه بدون پیام مستقیم؛ الگوی کمک‌کردن.',
    review: DRAFT_REVIEW,
  },
  {
    id: 'ali-intro',
    npcId: 'npc-child-ali',
    textFa: 'علی در حیاط کلاس توپ بازی می‌کند.',
    iconId: 'icon-play',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'parkkeeper-intro',
    npcId: 'npc-park-keeper',
    textFa: 'نگهبان پارک گل‌ها را آب می‌دهد.',
    iconId: 'icon-pick-kite',
    offersQuestId: 'quest-park-kite',
    lines: [
      {
        speakerId: 'npc-park-keeper',
        textFa: 'نگهبان پارک گل‌ها را آب می‌دهد.',
        emotion: 'calm',
      },
      {
        speakerId: 'npc-park-keeper',
        textFa: 'گل‌ها خوب بزرگ می‌شوند.',
        emotion: 'happy',
        reaction: 'point',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'sara-intro',
    npcId: 'npc-child-sara',
    textFa: 'سارا روی تپه‌ی پارک بازی می‌کند.',
    iconId: 'icon-play',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'fisher-intro',
    npcId: 'npc-fisher',
    textFa: 'ماهیگیر کنار رودخانه نشسته.',
    iconId: 'icon-spot-fish',
    offersQuestId: 'quest-river-shell',
    lines: [
      { speakerId: 'npc-fisher', textFa: 'ماهیگیر کنار رودخانه نشسته.', emotion: 'calm' },
      {
        speakerId: 'npc-fisher',
        textFa: 'بعضی وقت‌ها پیش نانوا هم دیده می‌شود.',
        emotion: 'thoughtful',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'cavemouse-intro',
    npcId: 'npc-cave-mouse',
    textFa: 'موش کوچک غار کنار گوهر ایستاده.',
    iconId: 'icon-find-crystal',
    offersQuestId: 'quest-cave-crystal',
    lines: [
      {
        speakerId: 'npc-cave-mouse',
        textFa: 'موش کوچک غار کنار گوهر ایستاده.',
        emotion: 'calm',
      },
      {
        speakerId: 'npc-cave-mouse',
        textFa: 'گوهر ته غار می‌درخشد.',
        emotion: 'happy',
        reaction: 'point',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    // The playful mouse is a battle opponent, not a talker — the node exists
    // only so the content contract (every NPC has dialogueIds) holds; the
    // figure tap starts the battle instead of opening dialogue.
    id: 'playfulmouse-intro',
    npcId: 'npc-playful-mouse',
    textFa: 'موش بازیگوش در سرزمین چالش منتظر بازی است.',
    iconId: 'icon-tap-ball',
    offersQuestId: null,
    lines: [
      {
        speakerId: 'npc-playful-mouse',
        textFa: 'موش بازیگوش در سرزمین چالش منتظر بازی است.',
        emotion: 'happy',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    // Challenge opponents are battle figures, not talkers — these nodes
    // exist only for the content contract (every NPC has dialogueIds); the
    // figure tap starts the battle instead of opening dialogue.
    id: 'challengebird-intro',
    npcId: 'npc-challenge-bird',
    textFa: 'پرنده‌ی چالش از تکیه‌گاهش نگاه می‌کند.',
    iconId: 'icon-tap-ball',
    offersQuestId: null,
    lines: [
      {
        speakerId: 'npc-challenge-bird',
        textFa: 'پرنده‌ی چالش از تکیه‌گاهش نگاه می‌کند.',
        emotion: 'calm',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'challengeeagle-intro',
    npcId: 'npc-challenge-eagle',
    textFa: 'عقاب چالش با غرور نشسته و منتظر است.',
    iconId: 'icon-tap-ball',
    offersQuestId: null,
    lines: [
      {
        speakerId: 'npc-challenge-eagle',
        textFa: 'عقاب چالش با غرور نشسته و منتظر است.',
        emotion: 'calm',
      },
    ],
    review: DRAFT_REVIEW,
  },
  {
    id: 'challengebutterfly-intro',
    npcId: 'npc-challenge-butterfly',
    textFa: 'پروانه‌ی چالش کنار گل آرام است.',
    iconId: 'icon-tap-ball',
    offersQuestId: null,
    lines: [
      {
        speakerId: 'npc-challenge-butterfly',
        textFa: 'پروانه‌ی چالش کنار گل آرام است.',
        emotion: 'happy',
      },
    ],
    review: DRAFT_REVIEW,
  },
  // Routine greetings: short contextual lines keyed to where the NPC stands.
  {
    id: 'fisher-at-river',
    npcId: 'npc-fisher',
    textFa: 'صبح خوبی برای ماهی است.',
    iconId: 'icon-spot-fish',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'fisher-at-bakery',
    npcId: 'npc-fisher',
    textFa: 'بوی نان تازه آمد.',
    iconId: 'icon-take-bread',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'fisher-at-bank',
    npcId: 'npc-fisher',
    textFa: 'امروز رودخانه آرام بود.',
    iconId: 'icon-watch',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'keeper-at-park',
    npcId: 'npc-park-keeper',
    textFa: 'گل‌ها امروز خوشحالند.',
    iconId: 'icon-pick-up',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'keeper-at-hill',
    npcId: 'npc-park-keeper',
    textFa: 'از اینجا همه‌ی پارک دیده می‌شود.',
    iconId: 'icon-watch',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'keeper-at-rest',
    npcId: 'npc-park-keeper',
    textFa: 'کمی استراحت کنار گل‌ها.',
    iconId: 'icon-smile',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'sara-on-hill',
    npcId: 'npc-child-sara',
    textFa: 'توپم را اینجا بازی می‌کنم.',
    iconId: 'icon-play',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'sara-at-gate',
    npcId: 'npc-child-sara',
    textFa: 'می‌خواهم بروم سر تپه.',
    iconId: 'icon-play',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-at-class',
    npcId: 'npc-teacher',
    textFa: 'امروز کلاس پرشور بود.',
    iconId: 'icon-watch',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-at-yard',
    npcId: 'npc-teacher',
    textFa: 'بچه‌ها در حیاط بازی می‌کنند.',
    iconId: 'icon-smile',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
  {
    id: 'teacher-at-square',
    npcId: 'npc-teacher',
    textFa: 'فردا باز کلاس داریم.',
    iconId: 'icon-watch',
    offersQuestId: null,
    review: DRAFT_REVIEW,
  },
];

const BY_ID = new Map<string, DialogueNode>(DIALOGUE_NODES.map((node) => [node.id, node]));

export function getDialogueNode(id: string): DialogueNode | null {
  return BY_ID.get(id) ?? null;
}
