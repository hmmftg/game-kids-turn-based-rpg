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
  await user.click(await screen.findByTestId('headwear-next'));
  await user.click(await screen.findByTestId('badge-0'));
  await screen.findByTestId('hud');
}

/** Taps a scene target: index 0 is the obvious (primary) target, index N>0
 *  the Nth other tappable thing. The press pulse delays the commit ~160ms,
 *  so the wait gives the CHOOSE dispatch time to land. */
async function pickChoice(user: ReturnType<typeof userEvent.setup>, index: number) {
  const strip = await screen.findByTestId('scene-choice');
  const target =
    index === 0
      ? (strip.querySelector('[data-primary]') as HTMLButtonElement)
      : (strip.querySelectorAll('.scene-target:not([data-primary])')[
          index - 1
        ] as HTMLButtonElement);
  await user.click(target);
  await new Promise((r) => setTimeout(r, 250));
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

/** Plays one quest picking the correct (first) icon at each step. */
async function completeQuest(
  user: ReturnType<typeof userEvent.setup>,
  questId: 'quest-greeting' | 'quest-helping' | 'quest-tidying' | 'quest-finale',
) {
  await user.click(screen.getByTestId(`trail-${questId}`));
  await user.click(await screen.findByTestId('start-quest'));
  await user.click(await screen.findByTestId('advance-intro'));
  for (let guard = 0; guard < 20; guard += 1) {
    if (screen.queryByTestId('scene-choice')) {
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

function completeFirstQuest(user: ReturnType<typeof userEvent.setup>) {
  return completeQuest(user, 'quest-greeting');
}

/** Pause → switch player → create a new profile → land back on the hub. */
async function switchToNewPlayer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('pause-button'));
  await user.click(screen.getByTestId('switch-player'));
  await user.click(await screen.findByTestId('profile-new'));
  await user.click(await screen.findByTestId('avatar-arta'));
  await user.click(await screen.findByTestId('headwear-next'));
  await user.click(await screen.findByTestId('badge-1'));
  await screen.findByTestId('hud');
}

/** Pause → switch player → pick an existing profile card → land on the hub. */
async function switchToProfile(user: ReturnType<typeof userEvent.setup>, profileId: string) {
  await user.click(screen.getByTestId('pause-button'));
  await user.click(screen.getByTestId('switch-player'));
  await user.click(await screen.findByTestId(`profile-card-${profileId}`));
  await screen.findByTestId('hud');
}

describe('UX pass', () => {
  it('shows the current objective in the hub and hides it off-quest', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByTestId('start-button'));

    // Not in the hub yet: no objective should be shown.
    expect(screen.queryByTestId('objective-chip')).toBeNull();

    await user.click(await screen.findByTestId('avatar-aban'));
    await user.click(await screen.findByTestId('headwear-next'));
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

  it('does not replay the celebration when a completed profile is reloaded', async () => {
    const repository = new MemorySaveRepository();
    const first = renderApp(repository);
    await reachHub(first.user);
    await completeFirstQuest(first.user);
    await first.user.click(await screen.findByTestId('celebration-continue'));
    first.unmount();

    // A fresh session (new App + provider) over the same save: selecting the
    // profile hydrates the persisted 'questCompleted' checkpoint, which must
    // not count as a new completion.
    const second = renderApp(repository);
    const [profile] = await repository.listProfiles();
    await second.user.click(await screen.findByTestId(`profile-card-${profile!.id}`));
    await screen.findByTestId('hud');
    expect(screen.queryByTestId('quest-celebration')).toBeNull();
    expect(screen.getByTestId('objective-chip')).toHaveTextContent(
      getQuestCopy('quest-helping').objectiveFa,
    );
  });

  it('still celebrates a second quest completed later in the same session', async () => {
    const repository = new MemorySaveRepository();
    const first = renderApp(repository);
    await reachHub(first.user);
    await completeFirstQuest(first.user);
    await first.user.click(await screen.findByTestId('celebration-continue'));

    // Completing the next quest in the same session must still celebrate.
    await completeQuest(first.user, 'quest-helping');
    expect(await screen.findByTestId('quest-celebration')).toBeInTheDocument();
  });

  it('does not replay the celebration when switching back to a profile', async () => {
    const repository = new MemorySaveRepository();
    const { user } = renderApp(repository);
    await reachHub(user);
    await completeFirstQuest(user);
    await user.click(await screen.findByTestId('celebration-continue'));
    const [profileA] = await repository.listProfiles();

    await switchToNewPlayer(user);
    await switchToProfile(user, profileA!.id);

    // Kid A's hydrated 'questCompleted' checkpoint repeats a timestamp already
    // seen this session — re-hydration is not a fresh win.
    expect(screen.queryByTestId('quest-celebration')).toBeNull();
  });

  it('still celebrates for a different kid and after switching back', async () => {
    const repository = new MemorySaveRepository();
    const { user } = renderApp(repository);
    await reachHub(user);
    await completeFirstQuest(user);
    await user.click(await screen.findByTestId('celebration-continue'));
    const [profileA] = await repository.listProfiles();

    // Kid B completes their own first quest: a genuinely new checkpoint.
    await switchToNewPlayer(user);
    await completeFirstQuest(user);
    expect(await screen.findByTestId('quest-celebration')).toBeInTheDocument();
    await user.click(await screen.findByTestId('celebration-continue'));

    // Back to Kid A: no replay, and their next real completion still fires.
    await switchToProfile(user, profileA!.id);
    expect(screen.queryByTestId('quest-celebration')).toBeNull();
    await completeQuest(user, 'quest-helping');
    expect(await screen.findByTestId('quest-celebration')).toBeInTheDocument();
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

  it('offers every headwear option with a visible selected state and live preview', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByTestId('start-button'));
    await user.click(await screen.findByTestId('avatar-aban'));

    const row = await screen.findByTestId('headwear-row');
    const options = row.querySelectorAll('button');
    expect(options).toHaveLength(6);

    // Default is the uncovered look; selection state is not colour-only.
    expect(screen.getByTestId('headwear-option-none')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('headwear-option-chador'));
    expect(screen.getByTestId('headwear-option-chador')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('headwear-option-none')).toHaveAttribute('aria-pressed', 'false');
    // Preview swaps immediately: the chador pictogram replaces the hair glyph.
    expect(screen.getByTestId('headwear-preview').querySelector('svg')).toBeInTheDocument();

    await user.click(screen.getByTestId('headwear-next'));
    await user.click(await screen.findByTestId('badge-0'));
    await screen.findByTestId('hud');
  });

  it('remembers headwear on the profile card without touching the save slot', async () => {
    const repository = new MemorySaveRepository();
    const { user } = renderApp(repository);
    await user.click(await screen.findByTestId('start-button'));
    await user.click(await screen.findByTestId('avatar-aban'));
    await user.click(await screen.findByTestId('headwear-option-scarf'));
    await user.click(await screen.findByTestId('headwear-next'));
    await user.click(await screen.findByTestId('badge-0'));
    await screen.findByTestId('hud');

    // The choice lives on the index card, never inside PersistedState.
    const [profile] = await repository.listProfiles();
    expect(profile?.headwear).toBe('scarf');
    expect(repository.peek(profileSlotKey(profile!.id))).not.toHaveProperty('headwear');

    // Switching away and back restores it for the world layer.
    await user.click(screen.getByTestId('pause-button'));
    await user.click(screen.getByTestId('switch-player'));
    await user.click(await screen.findByTestId(`profile-card-${profile!.id}`));
    await screen.findByTestId('hud');
    expect((await repository.listProfiles())[0]?.headwear).toBe('scarf');
  });
});
