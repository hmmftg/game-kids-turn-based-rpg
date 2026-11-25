/**
 * Orders profile-index and save-slot operations within one application session.
 * Slot epochs let resets/deletes invalidate queued autosaves without changing
 * the repository or IndexedDB schema.
 */
export class ProfilePersistenceQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly slotEpochs = new Map<string, number>();
  private readonly blockedSlots = new Set<string>();

  enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Queues an autosave only while its slot is still in the same lifecycle. */
  saveSlot(slotKey: string, save: () => Promise<void>): Promise<boolean> {
    if (this.blockedSlots.has(slotKey)) return Promise.resolve(false);
    const epoch = this.slotEpochs.get(slotKey) ?? 0;
    return this.enqueue(async () => {
      if (this.blockedSlots.has(slotKey) || (this.slotEpochs.get(slotKey) ?? 0) !== epoch) {
        return false;
      }
      await save();
      return !this.blockedSlots.has(slotKey) && (this.slotEpochs.get(slotKey) ?? 0) === epoch;
    });
  }

  /** Invalidates older autosaves and blocks new ones until the lifecycle op commits. */
  invalidateAndBlockSlots(slotKeys: readonly string[]): void {
    for (const key of new Set(slotKeys)) {
      this.slotEpochs.set(key, (this.slotEpochs.get(key) ?? 0) + 1);
      this.blockedSlots.add(key);
    }
  }

  releaseSlots(slotKeys: readonly string[]): void {
    for (const key of slotKeys) this.blockedSlots.delete(key);
  }
}
