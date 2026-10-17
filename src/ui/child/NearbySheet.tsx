import { useEffect, useRef } from 'react';
import { npcEmoji } from './emoji.ts';
import { FA } from '../../content/fa/strings.ts';
import { getNpcCopy } from '../../content/fa/quests.ts';
import { useDismissOnEscape } from '../Overlay.tsx';
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
  // The sheet is deliberately non-modal (the HUD strips stay reachable), so
  // it takes the Escape twin of its own outside-tap rather than the modal
  // Overlay. Focus still lands on the first row for keyboard users.
  useDismissOnEscape(onDismiss);
  const firstRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRowRef.current?.focus();
  }, []);
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
        <h2 className="nearby-sheet__title">{title}</h2>
        <div className="nearby-sheet__rows">
          {entries.length === 0 ? (
            <p className="text text--soft" data-testid="nearby-empty">
              {FA.nearbyEmpty}
            </p>
          ) : null}
          {entries.map(({ npc }, index) => {
            const copy = getNpcCopy(npc.id);
            return (
              <button
                key={npc.id}
                ref={index === 0 ? firstRowRef : undefined}
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
        <button type="button" className="btn" onClick={onDismiss} data-testid="nearby-close">
          {FA.backToHood}
        </button>
      </div>
    </div>
  );
}
