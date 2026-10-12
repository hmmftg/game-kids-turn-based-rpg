import { useEffect, useRef, type MouseEvent } from 'react';
import { battleAchievements } from '../../framework/index.ts';
import type {
  BattleAchievementId,
  BattleActionId,
  BattlePhase,
  BattleState,
} from '../../framework/index.ts';
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

/**
 * Heart pips: filled hearts remain, emptied slots stay visible as pale
 * hearts — the count is read as a picture, never as a numeral.
 */
function HeartPips({
  filled,
  total,
  testId,
}: {
  readonly filled: number;
  readonly total: number;
  readonly testId: string;
}) {
  return (
    <span className="battle__pips" data-testid={testId} aria-label={`${filled}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className="battle__pip" data-filled={index < filled} aria-hidden>
          {index < filled ? '❤️' : '🤍'}
        </span>
      ))}
    </span>
  );
}

/**
 * Round dots: one dot per authored round — elapsed rounds fill in, the
 * current one wears the ring, future rounds stay hollow. Pictographic
 * pacing instead of the bare numeral.
 */
function RoundDots({
  round,
  total,
  testId,
}: {
  readonly round: number;
  readonly total: number;
  readonly testId: string;
}) {
  return (
    <span className="battle__dots" data-testid={testId} aria-label={`${round}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className="battle__dot"
          data-filled={index < round}
          data-now={index === round - 1}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Badge glyphs — pictograms only, the toy's own language (§9). */
const ACHIEVEMENT_GLYPH: Record<BattleAchievementId, string> = {
  won: '🏅',
  'found-the-fear': '💡',
  steady: '🎯',
};

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
          <HeartPips
            filled={battle.playerHearts}
            total={battle.definition.hearts}
            testId="battle-hearts-player"
          />
          <RoundDots
            round={battle.round}
            total={battle.definition.maxRounds}
            testId="battle-round"
          />
          <HeartPips
            filled={battle.opponentHearts}
            total={battle.definition.hearts}
            testId="battle-hearts-opponent"
          />
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

        {/* The opponent is a physical presence, not a portrait icon: it
            recoils when hit, lunges when it attacks, settles when it rests
            — the physical cause for every beat, not just swapped words.
            W7: it also flinches toward the action it fears when the choice
            opens (data-weakness), and a landed weak-to action recoils
            harder (data-weak) — the weakness is read off the body, never
            off an icon label. */}
        <div
          className="battle__opponent"
          data-testid="battle-opponent"
          data-phase={battle.phase}
          data-outcome={battle.lastOutcome ?? 'none'}
          data-intent={battle.enemyIntent}
          data-weakness={battle.definition.weakness ?? 'none'}
          data-weak={
            battle.lastAction === battle.definition.weakness &&
            (battle.lastOutcome === 'opponent-hit' || battle.lastOutcome === 'blocked')
          }
        >
          <SceneGlyph element="mouse" size={96} />
        </div>

        {battle.phase === 'playerChoice' ? (
          <DialogueCard key={battle.phase} textFa={lineFa} testId="battle-card" hideText={hideCopy}>
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
            key={battle.phase}
            textFa={lineFa}
            testId="battle-card"
            hideText={hideCopy}
            onTap={PASSIVE_DWELL_MS[battle.phase] !== undefined ? onAdvance : undefined}
          >
            {battle.phase === 'victory' ? (
              <span className="battle__badges" data-testid="battle-badges">
                {battleAchievements(battle).map((badge) => (
                  <span
                    key={badge}
                    className="battle__badge"
                    data-testid={`battle-badge-${badge}`}
                    aria-hidden
                  >
                    {ACHIEVEMENT_GLYPH[badge]}
                  </span>
                ))}
              </span>
            ) : null}
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
