import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../../content/fa/icons.ts';
import { QUEST_COPY } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { AVATAR_IDS } from '../../domain/game/types.ts';
import type { IconId } from '../../domain/game/types.ts';
import { QUEST_DEFINITIONS } from '../../domain/quests/definitions.ts';
import { AVATAR_VISUALS } from '../../world/models/modelProvider.ts';
import { SceneGlyph } from './SceneChoice.tsx';
import { AvatarPortrait } from './AvatarPortrait.tsx';
import { sceneElementFor } from './contextInteraction.ts';
import { AvatarSelectScreen } from './screens.tsx';

const wordCount = (text: string) => text.trim().split(/\s+/).length;

describe('human avatar presets', () => {
  it('every preset renders a distinct human portrait (hair + face + shirt)', () => {
    const { container } = render(
      <>
        {AVATAR_IDS.map((id) => (
          <AvatarPortrait key={id} avatarId={id} />
        ))}
      </>,
    );
    const portraits = container.querySelectorAll('.avatar-portrait');
    expect(portraits).toHaveLength(AVATAR_IDS.length);
    const hairStyles = new Set([...portraits].map((p) => p.getAttribute('data-hair')));
    expect(hairStyles.size).toBe(AVATAR_IDS.length);
    // a human face is present in every portrait: eyes + smile
    for (const portrait of portraits) {
      expect(portrait.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every preset has a complete 3D visual identity', () => {
    for (const id of AVATAR_IDS) {
      const visual = AVATAR_VISUALS[id];
      expect(visual.palette.body).toMatch(/^#/);
      expect(visual.palette.head).toMatch(/^#/);
      expect(visual.hairStyle).toMatch(/pigtails|short|curly|bun/);
      expect(visual.hairColor).toMatch(/^#/);
    }
    // presets must actually look different from each other
    const keys = new Set(
      AVATAR_IDS.map((id) => `${AVATAR_VISUALS[id].hairStyle}|${AVATAR_VISUALS[id].palette.body}`),
    );
    expect(keys.size).toBe(AVATAR_IDS.length);
  });

  it('avatar selection flows pick → headwear → play (portrait is the identity)', async () => {
    const user = userEvent.setup();
    let picked: string | null = null;
    render(
      <AvatarSelectScreen
        onSelect={(id) => {
          picked = id;
        }}
      />,
    );
    await user.click(screen.getByTestId('avatar-nika'));
    await user.click(screen.getByTestId('headwear-next'));
    expect(picked).toBe('avatar-nika');
  });
});

describe('scene objects (objects and people are the verbs)', () => {
  const mappedIconIds = new Set<IconId>();
  const correctIconIds = new Set<IconId>();
  for (const quest of QUEST_DEFINITIONS) {
    for (const step of quest.steps) {
      correctIconIds.add(step.correctIconId);
      for (const id of step.choiceIconIds) {
        if (sceneElementFor(id) !== null) mappedIconIds.add(id);
      }
    }
  }

  it('every step’s correct target maps to a concrete scene element', () => {
    // A step whose correct icon has no physical target is untappable —
    // the one mapping that must always exist. Wrong choices may legitimately
    // be absent (§9: no fallback to icons).
    for (const iconId of correctIconIds) {
      expect(sceneElementFor(iconId), `${iconId} has no physical target`).not.toBeNull();
    }
  });

  it('every mapped element renders a scene, not a bare shape', () => {
    for (const iconId of mappedIconIds) {
      const element = sceneElementFor(iconId)!;
      const { container } = render(<SceneGlyph element={element} />);
      const svg = container.querySelector('svg');
      expect(svg, iconId).not.toBeNull();
      expect(svg!.getAttribute('data-element')).toBe(element);
      expect(
        svg!.querySelectorAll('path, circle, ellipse').length,
        `${iconId} should draw a scene`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('every icon id resolves to a defined icon', () => {
    for (const icon of ICONS) {
      expect(icon.labelFa.length).toBeGreaterThan(0);
      expect(icon.color).toMatch(/^#/);
    }
  });
});

describe('minimal-reading contract', () => {
  const LIMITS = {
    introFa: 9,
    demonstrateFa: 9,
    promptFa: 6,
    successFa: 9,
    retryFa: 9,
  } as const;

  it('encounter step text stays short enough for pre-readers', () => {
    for (const quest of QUEST_COPY) {
      for (const step of quest.steps) {
        for (const [field, limit] of Object.entries(LIMITS)) {
          const text = step[field as keyof typeof step];
          expect(
            wordCount(text),
            `${quest.questId}/${step.stepId}.${field} has ${wordCount(text)} words (max ${limit})`,
          ).toBeLessThanOrEqual(limit);
        }
      }
      expect(wordCount(quest.completionFa)).toBeLessThanOrEqual(10);
    }
  });

  it('choice labels stay icon-first: at most 5 words each', () => {
    for (const icon of ICONS) {
      expect(
        wordCount(icon.labelFa),
        `${icon.id} label has ${wordCount(icon.labelFa)} words`,
      ).toBeLessThanOrEqual(5);
    }
  });

  it('primary interaction hints stay at a glance', () => {
    for (const key of ['tapHere', 'hotspotHint', 'next', 'back', 'wellDone'] as const) {
      expect(wordCount(FA[key])).toBeLessThanOrEqual(5);
    }
  });
});
