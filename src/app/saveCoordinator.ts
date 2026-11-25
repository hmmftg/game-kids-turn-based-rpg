import { isStableMode } from '../domain/game/checkpoints.ts';
import { toPersistedState } from '../domain/game/initialState.ts';
import type { GameState } from '../domain/game/types.ts';
import type { SaveRepository } from '../services/persistence/repository.ts';

export interface SaveCoordinatorOptions {
  /** Read at save time — the boot coordinator may swap in the memory fallback. */
  readonly repository: () => SaveRepository | null;
  /** The active profile's slot key, or null before a player is picked. */
  readonly activeSlotKey: () => string | null;
  /** Keeps the picker card (sticker count, recency) in step with saves. */
  readonly syncActiveProfileMeta: (snapshot: GameState, slotKey: string) => void;
}

/**
 * Application save coordinator. Subscribed to runtime state changes, it owns
 * the save-eligibility policy the runtime deliberately knows nothing about:
 * autosave only in a stable mode (never mid-encounter), a token bump under an
 * overlay stays pending until then, audio/quality changes always flush, a
 * corrupt or newer-version save is never overwritten (the gated reset writes
 * fresh data), and nothing is written until a player slot exists.
 */
export class SaveCoordinator {
  private previous: GameState | null = null;
  private lastSavedToken: number | null = null;
  private saveGeneration = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SaveCoordinatorOptions) {}

  handleState(state: GameState): void {
    const previous = this.previous;
    this.previous = state;
    if (this.lastSavedToken === null) this.lastSavedToken = state.autosaveToken;
    if (state.saveHealth === 'recovered') return;
    const settingsChanged =
      previous !== null &&
      (previous.audio !== state.audio || previous.qualityTier !== state.qualityTier);
    const stableSaveDue = isStableMode(state.mode) && state.autosaveToken !== this.lastSavedToken;
    if (!settingsChanged && !stableSaveDue) return;
    const key = this.options.activeSlotKey();
    if (key === null) return; // no player yet: the first real save flushes later
    this.lastSavedToken = state.autosaveToken;
    const repository = this.options.repository();
    if (!repository) return;
    const generation = ++this.saveGeneration;
    const snapshot = toPersistedState(state);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => repository.save(snapshot, key))
      .then(() => {
        if (generation === this.saveGeneration && key === this.options.activeSlotKey())
          this.options.syncActiveProfileMeta(state, key);
      })
      .catch(() => {
        /* storage may be evicted; the game stays playable */
      });
  }
}
