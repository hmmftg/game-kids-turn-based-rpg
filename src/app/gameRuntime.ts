import {
  createGameRuntime,
  type GameRuntime,
  type GameRuntimeAdapter,
  type GameRuntimeConfig,
} from '../framework/index.ts';
import { createInitialState } from '../domain/game/initialState.ts';
import { gameReducer } from '../domain/game/reducer.ts';
import type { Command, GameState } from '../domain/game/types.ts';

/**
 * The application's state-machine adapter. Persistence is deliberately absent:
 * bootstrap/save coordinators own `SaveRepository` and decide when loads and
 * saves happen; the runtime only seeds the boot state once and runs the
 * game's own reducer with the clock propagated on every dispatch.
 */
export const gameRuntimeAdapter: GameRuntimeAdapter<GameState, Command> = {
  createInitialState: () => createInitialState(Date.now()),
  reducer: (state, command, context) => gameReducer(state, command, context.now),
};

export function createAppGameRuntime(config?: GameRuntimeConfig): GameRuntime<GameState, Command> {
  return createGameRuntime(gameRuntimeAdapter, config);
}
