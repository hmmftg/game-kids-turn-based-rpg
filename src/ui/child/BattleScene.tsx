import { useEffect, useRef, type MouseEvent } from 'react';
import type { BattleActionId, BattlePhase, BattleState } from '../../domain/battle/types.ts';
import type { BattleCopy } from '../../content/fa/battles.ts';
import { FA } from '../../content/fa/strings.ts';
import { DialogueCard } from './DialogueCard.tsx';
import { SceneGlyph, type SceneElement } from './SceneChoice.tsx';

/**
 * Micro turn-based battle surface (PR I).
 *
 * Same pacing contract as the encounter: passive phases play themselves on a
 * dwell timer (a card tap skips ahead for a child who is ready), only
 * `playerChoice` waits — one physical action per round, the soft ball or the
 * cushion, never an action icon. `victory`/`defeat` are terminal: the only
 * exit is the leave button (`LEAVE_BATTLE`). While `battle !== null` this
 * overlay owns all child input — world taps, the quest trail and pause sit
 * beneath it.
 */

/** Dwell per auto-advancing phase — short beats, like the encounter's. */
const PASSIVE_DWELL_MS: Partial<Record<BattlePhase, number>> = {
  intro: 1400,
  playerResolution: 1200,
  enemyResolution: 900,
  roundCheck: 450,
};

const ACTION_ELEMENT: Record<BattleActionId, SceneElement> = {
  'action-ball': 'ball',
  'action-shield': 'cushion',
};

const ACTION_TESTID: Record<BattleActionId, string> = {
  'action-ball': 'battle-action-ball',
  'action-shield': 'battle-action-shield',
};

function Hearts({ count, testId }: { readonly count: number; readonly testId: string }) {
  return (
    <span className="battle__hearts" data-testid={testId} aria-label={`${count}`}>
      {'❤️'.repeat(Math.max(0, count))}
    </span>
  );
}

export function BattleScene({
  battle,
  copy,
  hideCopy,
  onAdvance,
  onChoose,
  onLeave,
}: {
  readonly battle: BattleState;
  readonly copy: BattleCopy;
  readonly hideCopy?: boolean | undefined;
  readonly onAdvance: () => void;
  readonly onChoose: (action: BattleActionId) => void;
  readonly onLeave: () => void;
}) {
  // Pacing layer only: the reducer owns the state; this hook merely decides
  // when the UI asks for the next passive beat. Never fires during
  // playerChoice or the terminal states.
  const advanceRef = useRef(onAdvance);
  useEffect(() => {
    advanceRef.current = onAdvance;
  }, [onAdvance]);
  useEffect(() => {
    const dwell = PASSIVE_DWELL_MS[battle.phase];
    if (dwell === undefined) return;
    const timer = window.setTimeout(() => advanceRef.current(), dwell);
    return () => window.clearTimeout(timer);
  }, [battle.phase, battle.round]);

  const lineFa =
    battle.phase === 'intro'
      ? copy.introFa
      : battle.phase === 'playerChoice'
        ? copy.promptFa
        : battle.phase === 'playerResolution'
          ? copy.outcomeFa[battle.lastOutcome ?? 'no-effect']
          : battle.phase === 'enemyResolution'
            ? copy.intentFa[battle.enemyIntent]
            : battle.phase === 'victory'
              ? copy.victoryFa
              : battle.phase === 'defeat'
                ? copy.defeatFa
                : '';

  return (
    <section className="battle" dir="rtl" data-testid="battle-scene">
      {/* Owns every tap: the sheet swallows input instead of dismissing —
          the child leaves only through the leave button (LEAVE_BATTLE). */}
      <div
        className="battle__backdrop"
        data-testid="battle-backdrop"
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div className="battle__panel">
        <header className="battle__header">
          <Hearts count={battle.playerHearts} testId="battle-hearts-player" />
          <span className="battle__round" data-testid="battle-round">
            {battle.round}
          </span>
          <Hearts count={battle.opponentHearts} testId="battle-hearts-opponent" />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              onLeave();
            }}
            data-testid="leave-battle"
          >
            {FA.backToHood}
          </button>
        </header>

        {/* The opponent is a physical presence, not a portrait icon. */}
        <div className="battle__opponent" data-testid="battle-opponent" data-phase={battle.phase}>
          <SceneGlyph element="mouse" size={96} />
        </div>

        {battle.phase === 'playerChoice' ? (
          <DialogueCard textFa={lineFa} testId="battle-card" hideText={hideCopy}>
            {battle.definition.availableActions.map((action) => (
              <button
                key={action}
                type="button"
                className="btn btn--large battle__action"
                onClick={(event) => {
                  event.stopPropagation();
                  onChoose(action);
                }}
                data-testid={ACTION_TESTID[action]}
              >
                <SceneGlyph element={ACTION_ELEMENT[action]} size={56} />
              </button>
            ))}
          </DialogueCard>
        ) : (
          <DialogueCard
            textFa={lineFa}
            testId="battle-card"
            hideText={hideCopy}
            onTap={PASSIVE_DWELL_MS[battle.phase] !== undefined ? onAdvance : undefined}
          >
            {battle.phase === 'victory' || battle.phase === 'defeat' ? (
              <button
                type="button"
                className="btn btn--large"
                onClick={(event) => {
                  event.stopPropagation();
                  onLeave();
                }}
                data-testid="battle-continue"
              >
                {FA.backToHood}
              </button>
            ) : null}
          </DialogueCard>
        )}
      </div>
    </section>
  );
}
