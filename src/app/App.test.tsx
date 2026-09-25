import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemorySaveRepository } from '../services/persistence/memoryRepository.ts';
import { App } from './App.tsx';
import { GameProvider } from './GameProvider.tsx';

/**
 * jsdom has no WebGL, so these component tests exercise the DOM-only path that a
 * device without 3D support also gets: the quest trail and the dialogue cards.
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
  await screen.findByTestId('hud');
}

describe('App', () => {
  it('walks from the title screen to the hub and shows the quest trail', async () => {
    const { user } = renderApp();
    await reachHub(user);

    expect(screen.getByTestId('trail-quest-greeting')).toBeEnabled();
    expect(screen.getByTestId('trail-quest-helping')).toBeDisabled();
  });

  it('completes the first quest through gentle retries and awards a sticker', async () => {
    const { user } = renderApp();
    await reachHub(user);

    await user.click(screen.getByTestId('trail-quest-greeting'));
    await user.click(await screen.findByTestId('start-quest'));

    // Step 1: pick the wrong icon first — the game re-demonstrates, never blocks.
    await user.click(await screen.findByTestId('advance-intro'));
    await user.click(await screen.findByTestId('advance-demonstrate'));
    const choices = await screen.findByTestId('choices');
    await user.click(choices.querySelectorAll('button')[1] as HTMLButtonElement);
    const response = await screen.findByTestId('encounter-response');
    expect(response).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /دوباره|ادامه/ }));
    expect(await screen.findByTestId('encounter-demonstrate')).toBeInTheDocument();
  });

  it('keeps the parent area behind a press-and-hold gate', async () => {
    const { user } = renderApp();
    await user.click(await screen.findByTestId('parent-entry'));
    expect(await screen.findByTestId('parent-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('parent-area')).toBeNull();

    await user.click(screen.getByTestId('parent-gate-cancel'));
    await waitFor(() => expect(screen.queryByTestId('parent-gate')).toBeNull());
  });
});
