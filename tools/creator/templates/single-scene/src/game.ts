import { createGameRuntime as createCoreRuntime } from 'waypoint-rpg-core';

export interface GameState {
  readonly interactions: number;
}

export type GameCommand = { readonly type: 'interact-with-scene' };

export function createGameRuntime() {
  return createCoreRuntime({
    createInitialState: (): GameState => ({ interactions: 0 }),
    reducer: (state: GameState, command: GameCommand): GameState => {
      if (command.type === 'interact-with-scene') return { interactions: state.interactions + 1 };
      return state;
    },
  });
}
