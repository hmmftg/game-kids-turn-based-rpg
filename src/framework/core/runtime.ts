/**
 * The smallest viable runtime seam: a single state store orchestrating the
 * application's own state machine. The runtime is generic over `S` (state)
 * and `C` (command) — it owns lifecycle, dispatch plumbing and subscriptions;
 * it never interprets state, never performs persistence, and never bypasses
 * the reducer for bootstrap or hydration.
 */

/** Context injected on EVERY dispatch — the runtime's clock reaches the reducer. */
export interface ReducerContext {
  readonly now: number;
}

/**
 * State-machine-only adapter: no persistence, no hydrated input.
 * `createInitialState()` seeds the store exactly once (the application's
 * boot state); hydration/profile selection happens afterwards as ordinary
 * commands dispatched through the reducer's own semantics.
 */
export interface GameRuntimeAdapter<S, C> {
  createInitialState(): S;
  readonly reducer: (state: S, command: C, context: ReducerContext) => S;
}

export interface GameRuntimeConfig {
  /** Wall-clock supplier; defaults to Date.now. Inject a fixed clock for replay. */
  readonly clock?: () => number;
}

export type RuntimeListener<S> = (state: S) => void;

/**
 * One store, fed by one injected reducer. `pause()` suspends listener
 * notification (state still advances); `resume()` flushes once with the
 * current state. `dispose()` tears down subscriptions for good.
 */
export interface GameRuntime<S, C> {
  getState(): S;
  dispatch(command: C): S;
  subscribe(listener: RuntimeListener<S>): () => void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  dispose(): void;
}

export function createGameRuntime<S, C>(
  adapter: GameRuntimeAdapter<S, C>,
  config: GameRuntimeConfig = {},
): GameRuntime<S, C> {
  const clock = config.clock ?? (() => Date.now());
  const listeners = new Set<RuntimeListener<S>>();
  let state = adapter.createInitialState();
  let paused = false;
  let disposed = false;

  const notify = (): void => {
    if (paused || disposed) return;
    for (const listener of listeners) listener(state);
  };

  return {
    getState(): S {
      return state;
    },

    dispatch(command: C): S {
      if (disposed) return state;
      state = adapter.reducer(state, command, { now: clock() });
      notify();
      return state;
    },

    subscribe(listener: RuntimeListener<S>): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
      notify();
    },

    get paused(): boolean {
      return paused;
    },

    dispose(): void {
      listeners.clear();
      disposed = true;
    },
  };
}
