import { compileNarrative, type NarrativeDefinition } from 'waypoint-rpg-narrative';

export const storyDefinition = {
  schemaVersion: 1,
  id: 'single-scene-story',
  contentVersion: 'copy-1',
  compatibilityVersion: 'story-shape-1',
  defaultLocale: 'fa-IR',
  facts: [{ key: 'chosen-path', type: 'string', default: 'undecided' }],
  entryDialogueId: 'traveler-question',
  dialogues: [
    {
      id: 'traveler-question',
      entryNodeId: 'choice',
      exitPolicy: 'allowed',
      nodes: [
        {
          id: 'choice',
          speakerId: 'traveler',
          text: { 'fa-IR': 'برای روشن شدن راه، دنبال حقیقت برویم یا آرامش را نگه داریم؟' },
          choices: [
            {
              id: 'choose-truth',
              label: { 'fa-IR': 'حقیقت را پیدا کن' },
              targetNodeId: 'truth-ending',
              effects: [{ op: 'set-fact', key: 'chosen-path', value: 'truth' }],
            },
            {
              id: 'choose-peace',
              label: { 'fa-IR': 'از دوستی نگهبانی کن' },
              targetNodeId: 'peace-ending',
              effects: [{ op: 'set-fact', key: 'chosen-path', value: 'peace' }],
            },
          ],
        },
        {
          id: 'truth-ending',
          speakerId: 'traveler',
          text: { 'fa-IR': 'با پرسیدن و شنیدن، راهی تازه پیدا شد.' },
          terminal: true,
          endingId: 'ending-truth',
        },
        {
          id: 'peace-ending',
          speakerId: 'traveler',
          text: { 'fa-IR': 'با نگه داشتن دوستی، آرامش به باغ برگشت.' },
          terminal: true,
          endingId: 'ending-peace',
        },
      ],
    },
  ],
  quests: [],
} as const satisfies NarrativeDefinition;

export const compiledStory = compileNarrative(storyDefinition);
