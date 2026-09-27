import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { getQuestCopy } from '../content/fa/quests.ts';
import { FA } from '../content/fa/strings.ts';
import { profileSlotKey } from '../services/persistence/repository.ts';
import { MemorySaveRepository } from '../services/persistence/memoryRepository.ts';
import { QuestCelebration } from '../ui/child/Celebration.tsx';
import { InteractionHint } from '../ui/child/InteractionHint.tsx';
import { App } from './App.tsx';
import { GameProvider } from './GameProvider.tsx';

/**
 * Behavioral assertions for the UI/UX pass: the objective chip, the journey
 * trail states, the presentation-only celebration, gentle retry feedback, the
 * parent-only quality control, and the sticker album. jsdom has no WebGL, so
 * these exercise the DOM layer a canvas-less device also sees.
 */
function renderApp(repository = new MemorySaveRepository()) {
  return {
    user: userEvent.setup(),
    repository,
    ...render(
      <GameProvider repository={repository}>
        <App />
      </GameProvider>,
    ),
  };
}

async function reachHub(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('start-button'));
  await user.click(await screen.findByTestId('avatar-aban'));
  await user.click(await screen.findByTestId('badge-0'));
  await screen.findByTestId('hud');
}

async function pickChoice(user: ReturnType<typeof userEvent.setup>, index: number) {
  const choices = await screen.findByTestId('choices');
  await user.click(choices.querySelectorAll('button')[index] as HTMLButtonElement);
}

async function advanceIfPresent(
  user: ReturnType<typeof userEvent.setup>,
  testId: string,
): Promise<boolean> {
  const button = screen.queryByTestId(testId);
  if (!button) return false;
  await user.click(button);
  return true;
}

/** Plays quest-greeting picking the correct (first) icon at each step. */
async function completeFirstQuest(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('trail-quest-greeting'));
  await user.click(await screen.findByTestId('start-quest'));
  await user.click(await screen.findByTestId('advance-intro'));
  for (let guard = 0; guard < 20; guard += 1) {
    if (screen.queryByTestId('choices')) {
      await pickChoice(user, 0);
      continue;
    }
    if (
      (await advanceIfPresent(user, 'advance-intro')) ||
      (await advanceIfPresent(user, 'advance-demonstrate')) ||
      (await advanceIfPresent(user, 'advance-response')) ||
      (await advanceIfPresent(user, 'advance-reinforce'))
    ) {
      continue;
    }
    if (await advanceIfPresent(user, 'advance-complete')) break;
  }
}

describe('UX pass', () => {
  it('shows the current objective in the hub and hides it off-quest', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByTestId('start-button'));

    // Not in the hub yet: no objective should be shown.
    expect(screen.queryByTestId('objective-chip')).toBeNull();

    await user.click(await screen.findByTestId('avatar-aban'));
    await user.click(await screen.findByTestId('badge-0'));
    await screen.findByTestId('hud');

    const chip = screen.getByTestId('objective-chip');
    expect(chip).toHaveTextContent(getQuestCopy('quest-greeting').objectiveFa);
  });

  it('updates the objective after a quest completes', async () => {
    const { user } = renderApp();
    await reachHub(user);
    await completeFirstQuest(user);

    // Dismiss the celebration, then the objective must point at the next quest.
    await user.click(await screen.findByTestId('celebration-continue'));
    expect(screen.getByTestId('objective-chip')).toHaveTextContent(
      getQuestCopy('quest-helping').objectiveFa,
    );
  });

  it('renders trail states distinctly and keeps current identifiable without color', async () => {
    const { user } = renderApp();
    await reachHub(user);

    const current = screen.getByTestId('trail-quest-greeting');
    const locked = screen.getByTestId('trail-quest-helping');

    expect(current).toBeEnabled();
    expect(locked).toBeDisabled();
    expect(current).toHaveAttribute('aria-current', 'step');
    // Non-color marker: size/border plus an explicit «go here» label.
    expect(current.className).toContain('trail__item--current');
    expect(current).toHaveTextContent(FA.goThere);
    expect(locked.className).not.toContain('trail__item--current');

    // onGo still opens the quest intro.
    await user.click(current);
    expect(await screen.findByTestId('start-quest')).toBeInTheDocument();
  });

  it('shows the celebration only after quest state is already correct', async () => {
    const { user, repository } = renderApp();
    await reachHub(user);
    await completeFirstQuest(user);

    const celebration = await screen.findByTestId('quest-celebration');
    expect(celebration).toBeInTheDocument();
    expect(screen.getByTestId('celebration-sticker')).toBeInTheDocument();

    // The underlying progression must already be persisted — dismissal is a no-op.
    const [profile] = await repository.listProfiles();
    const saved = repository.peek(profileSlotKey(profile!.id));
    expect(saved).toMatchObject({
      quests: { 'quest-greeting': { status: 'completed' } },
      stickers: ['sticker-greeting'],
    });

    await user.click(screen.getByTestId('celebration-continue'));
    expect(screen.queryByTestId('quest-celebration')).toBeNull();
    expect(repository.peek(profileSlotKey(profile!.id))).toMatchObject({
      quests: { 'quest-greeting': { status: 'completed' } },
      stickers: ['sticker-greeting'],
    });
  });

  it('celebration Continue works instantly with no timers (reduced-motion safe)', async () => {
    const user = userEvent.setup();
    let done = false;
    render(<QuestCelebration questId="quest-greeting" onDone={() => (done = true)} />);

    // No waiting: the dismiss affordance exists on first paint.
    await user.click(screen.getByTestId('celebration-continue'));
    expect(done).toBe(true);
  });

  it('marks a wrong choice gently and keeps the existing retry flow', async () => {
    const { user } = renderApp();
    await reachHub(user);

    await user.click(screen.getByTestId('trail-quest-greeting'));
    await user.click(await screen.findByTestId('start-quest'));
    await user.click(await screen.findByTestId('advance-intro'));
    await user.click(await screen.findByTestId('advance-demonstrate'));
    await pickChoice(user, 1); // wrong icon

    const response = await screen.findByTestId('encounter-response');
    expect(response.className).toContain('dialogue-card--retry');
    expect(response).toHaveTextContent('👀');

    // The domain retry path is untouched: watch-again re-demonstrates.
    await user.click(screen.getByTestId('retry-response'));
    expect(await screen.findByTestId('encounter-demonstrate')).toBeInTheDocument();
  });

  it('keeps quality controls out of the child pause menu but in the parent area', async () => {
    const { user } = renderApp();
    await reachHub(user);

    await user.click(screen.getByTestId('pause-button'));
    expect(await screen.findByTestId('pause-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('quality-low')).toBeNull();

    await user.click(screen.getByTestId('parent-entry-pause'));
    const hold = await screen.findByTestId('parent-gate-hold');
    await user.pointer({ keys: '[MouseLeft>]', target: hold });
    expect(
      await screen.findByTestId('parent-area', undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    await user.pointer('[MouseLeft]');

    await user.click(screen.getByTestId('quality-low'));
    expect(screen.getByTestId('quality-low')).toHaveAttribute('aria-pressed', 'true');
  });

  it('album shows earned stickers over existing data and locked slots harmlessly', async () => {
    const { user } = renderApp();
    await reachHub(user);
    await completeFirstQuest(user);
    await user.click(await screen.findByTestId('celebration-continue'));

    await user.click(screen.getByTestId('sticker-shelf'));
    expect(await screen.findByTestId('sticker-album')).toBeInTheDocument();

    const earned = screen.getByTestId('album-sticker-greeting');
    expect(earned.className).toContain('album-slot--earned');

    const locked = screen.getByTestId('album-sticker-helping');
    expect(locked.className).not.toContain('album-slot--earned');
    expect(locked).toHaveTextContent(FA.stickerLocked);

    await user.click(screen.getByTestId('album-close'));
    expect(screen.queryByTestId('sticker-album')).toBeNull();
  });

  it('interaction hint points at the hotspot with a finger and short text', () => {
    render(<InteractionHint />);
    const hint = screen.getByTestId('interaction-hint');
    expect(hint).toHaveTextContent('👆');
    expect(hint).toHaveTextContent(FA.tapHere);
  });
});
