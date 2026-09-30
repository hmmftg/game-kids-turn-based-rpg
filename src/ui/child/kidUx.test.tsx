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
import { ActionGlyph } from './ActionGlyph.tsx';
import { AvatarPortrait } from './AvatarPortrait.tsx';
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

describe('action glyphs', () => {
  const usedIconIds = new Set<IconId>();
  for (const quest of QUEST_DEFINITIONS) {
    for (const step of quest.steps) {
      usedIconIds.add(step.correctIconId);
      for (const id of step.choiceIconIds) usedIconIds.add(id);
    }
  }

  it('every choice icon renders a concrete scene glyph, not the fallback', () => {
    for (const iconId of usedIconIds) {
      const { container } = render(<ActionGlyph iconId={iconId} />);
      const svg = container.querySelector('svg.action-glyph');
      expect(svg, iconId).not.toBeNull();
      expect(svg!.getAttribute('data-icon')).toBe(iconId);
      // a scene has more than a bare circle: actor, object or motion cue
      expect(
        svg!.querySelectorAll('path, circle, ellipse').length,
        `${iconId} should draw a scene`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('pick and throw-like actions visibly move an object', () => {
    for (const iconId of ['icon-pick-up', 'icon-kick'] as const) {
      const { container } = render(<ActionGlyph iconId={iconId} animate />);
      const svg = container.querySelector('svg.action-glyph')!;
      // object that moves + motion cue
      expect(svg.querySelector('.glyph-object'), iconId).not.toBeNull();
      expect(svg.querySelector('.glyph-cue'), iconId).not.toBeNull();
      expect(svg.getAttribute('class')).toContain('glyph--anim-');
    }
  });

  it('every icon id resolves to a defined icon', () => {
    for (const icon of ICONS) {
      const { container } = render(<ActionGlyph iconId={icon.id} />);
      expect(container.querySelector('svg')).not.toBeNull();
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
