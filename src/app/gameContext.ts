import { createContext, useContext } from 'react';
import type { Command, GameState } from '../domain/game/types.ts';
import type { CacheStatus } from '../services/pwa/serviceWorker.ts';

export interface GameShell {
  readonly state: GameState;
  readonly dispatch: (command: Command) => void;
  readonly cacheStatus: CacheStatus;
  readonly updateReady: boolean;
  readonly applyUpdate: () => void;
  readonly resetProgress: () => void;
  readonly playSfx: (id: string) => void;
}

export const GameContext = createContext<GameShell | null>(null);

export function useGame(): GameShell {
  const shell = useContext(GameContext);
  if (!shell) throw new Error('useGame must be used inside <GameProvider>');
  return shell;
}
