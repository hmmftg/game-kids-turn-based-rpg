import { createContext, useContext } from 'react';
import type { AvatarId, Command, GameState } from '../domain/game/types.ts';
import type { ProfileMeta } from '../services/persistence/repository.ts';
import type { CacheStatus } from '../services/pwa/serviceWorker.ts';

export interface GameShell {
  readonly state: GameState;
  readonly dispatch: (command: Command) => void;
  readonly cacheStatus: CacheStatus;
  readonly updateReady: boolean;
  readonly applyUpdate: () => void;
  readonly resetProgress: () => void;
  readonly playSfx: (id: string) => void;
  /** Player profiles on this device, in creation order. */
  readonly profiles: readonly ProfileMeta[];
  readonly activeProfileId: string | null;
  /** Loads a profile slot and lands on its checkpoint. */
  readonly selectProfile: (id: string) => void;
  /** Clears the in-memory player and opens avatar + badge select. */
  readonly startNewPlayer: () => void;
  /** Creates (or updates) the profile tied to this avatar + badge pick. */
  readonly chooseAvatar: (avatarId: AvatarId, badge: string) => void;
  /** Wipes one profile's progress; its card stays on the picker. */
  readonly resetProfile: (id: string) => void;
  readonly renameProfile: (id: string, nameFa: string) => void;
}

export const GameContext = createContext<GameShell | null>(null);

export function useGame(): GameShell {
  const shell = useContext(GameContext);
  if (!shell) throw new Error('useGame must be used inside <GameProvider>');
  return shell;
}
