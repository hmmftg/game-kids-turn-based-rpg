import { npcEmoji } from './emoji.ts';
import { getNpcCopy } from '../../content/fa/quests.ts';
import type { NearbyNpc } from '../../world/nearby.ts';

/**
 * The DOM accessibility route for figure taps (PR N1): the same people and
 * critters a child could tap in the world, as large readable buttons.
 * Selecting a row dispatches the exact same `onNpcTap` as the world tap —
 * one interaction meaning, two presentation routes. Nothing in here
 * navigates, unlocks, or resolves quests differently.
 */
export function NearbySheet({
  entries,
  title,
  onPick,
  onDismiss,
}: {
  readonly entries: readonly NearbyNpc[];
  readonly title: string;
  readonly onPick: (npcId: string) => void;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      className="hud__backdrop"
      data-testid="nearby-backdrop"
      onPointerDown={(event) => {
        // The universal leave rule: a tap outside the sheet closes it and
        // never reaches the world beneath.
        event.stopPropagation();
        onDismiss();
      }}
    >
      <div
        className="nearby-sheet"
        role="dialog"
        aria-label={title}
        data-testid="nearby-sheet"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="nearby-sheet__title">{title}</p>
        <div className="nearby-sheet__rows">
          {entries.map(({ npc }) => {
            const copy = getNpcCopy(npc.id);
            return (
              <button
                key={npc.id}
                type="button"
                className="btn nearby__row"
                data-testid={`nearby-${npc.id}`}
                onClick={() => {
                  onDismiss();
                  onPick(npc.id);
                }}
              >
                <span className="emoji nearby__emoji" aria-hidden="true">
                  {npcEmoji(npc.id)}
                </span>
                <span className="nearby__name">{copy?.nameFa ?? npc.id}</span>
                {copy?.roleFa ? <span className="nearby__role">{copy.roleFa}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
