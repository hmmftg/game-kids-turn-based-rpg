import { useState } from 'react';
import { FA } from '../../content/fa/strings.ts';
import type { AgeBand } from '../../domain/research/types.ts';

/**
 * Research Session Mode consent gate (PR R+). Rendered instead of the game
 * when `?research=1` / `?mode=research` is present and no session has started:
 * the parent reads what is collected, picks the child's age band, and either
 * starts the session or exits to the normal build. Never silently enabled —
 * this screen IS the consent record.
 */
export function ResearchGate({
  onStart,
  onExit,
}: {
  readonly onStart: (ageBand: AgeBand) => void;
  readonly onExit: () => void;
}) {
  const [ageBand, setAgeBand] = useState<AgeBand>('5-7');
  return (
    <div className="layer" data-testid="research-gate">
      <div className="panel column">
        <h1 className="title">🔬 {FA.researchTitle}</h1>
        <p className="text">{FA.researchBody}</p>
        <p className="text text--soft">{FA.researchOperator}</p>
        <p className="text text--soft">{FA.researchAgeLabel}</p>
        <div className="row" role="radiogroup" aria-label={FA.researchAgeLabel}>
          <button
            type="button"
            className={`btn ${ageBand === '3-4' ? 'btn--accent' : 'btn--secondary'}`}
            onClick={() => setAgeBand('3-4')}
            data-testid="research-age-3-4"
            aria-pressed={ageBand === '3-4'}
          >
            {FA.researchAge34}
          </button>
          <button
            type="button"
            className={`btn ${ageBand === '5-7' ? 'btn--accent' : 'btn--secondary'}`}
            onClick={() => setAgeBand('5-7')}
            data-testid="research-age-5-7"
            aria-pressed={ageBand === '5-7'}
          >
            {FA.researchAge57}
          </button>
        </div>
        <button
          type="button"
          className="btn btn--large btn--accent"
          onClick={() => onStart(ageBand)}
          data-testid="research-start"
        >
          {FA.researchContinue}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onExit}
          data-testid="research-exit"
        >
          {FA.researchExit}
        </button>
      </div>
    </div>
  );
}
