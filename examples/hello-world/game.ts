import {
  createGameRuntime,
  type GameRuntimeAdapter,
  type LoadResult,
  type PersistenceAdapter,
  type PersistenceFailure,
  type SaveScope,
  type StorageFallback,
} from '../../src/framework/index.ts';

/**
 * A trivial application state machine: the child taps the prop, the state
 * celebrates once, then settles back to idle. Five lines of reducer — the
 * whole point is that the framework runtime needs nothing more.
 */
export interface HelloState {
  readonly phase: 'idle' | 'celebrated';
  readonly taps: number;
  readonly lastTapAt: number;
}

export type HelloCommand = { readonly type: 'tap-prop' } | { readonly type: 'settle' };

const reducer = (
  state: HelloState,
  command: HelloCommand,
  context: { now: number },
): HelloState => {
  switch (command.type) {
    case 'tap-prop':
      return { phase: 'celebrated', taps: state.taps + 1, lastTapAt: context.now };
    case 'settle':
      return { ...state, phase: 'idle' };
  }
};

export const helloAdapter: GameRuntimeAdapter<HelloState, HelloCommand> = {
  createInitialState: () => ({ phase: 'idle', taps: 0, lastTapAt: 0 }),
  reducer,
};

export const createHelloRuntime = (clock?: () => number) =>
  createGameRuntime(helloAdapter, clock ? { clock } : {});

/**
 * Memory persistence: the smallest conforming `PersistenceAdapter` — the
 * runtime never touches it; a consumer's own coordinator would. Persisted
 * shape is the tap count only.
 */
export class HelloMemoryPersistence implements PersistenceAdapter<{ taps: number }> {
  private readonly slots = new Map<string, { taps: number }>();

  async load(scope: SaveScope): Promise<LoadResult<{ taps: number }>> {
    const data = this.slots.get(scope.slotKey);
    return data ? { kind: 'loaded', data } : { kind: 'empty' };
  }

  async save(data: { taps: number }, scope: SaveScope): Promise<void> {
    this.slots.set(scope.slotKey, data);
  }

  onFailure(_kind: PersistenceFailure): StorageFallback {
    return { kind: 'memory', authoritative: false };
  }
}
