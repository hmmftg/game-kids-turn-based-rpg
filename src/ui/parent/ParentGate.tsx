import { useEffect, useState } from 'react';
import { FA } from '../../content/fa/strings.ts';

const HOLD_MS = 3000;
const TICK_MS = 80;

/**
 * Press-and-hold gate. A preschooler releases long before three seconds, and
 * nothing about it reads as a reward, so it is not an interesting target.
 */
export function ParentGate({
  onPass,
  onCancel,
}: {
  readonly onPass: () => void;
  readonly onCancel: () => void;
}) {
  const [holdingSince, setHoldingSince] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const release = () => {
    setHoldingSince(null);
    setProgress(0);
  };

  useEffect(() => {
    if (holdingSince === null) return;
    const timer = setInterval(() => {
      const ratio = (Date.now() - holdingSince) / HOLD_MS;
      if (ratio >= 1) {
        setHoldingSince(null);
        onPass();
        return;
      }
      setProgress(ratio);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [holdingSince, onPass]);

  return (
    <div className="layer layer--overlay" data-testid="parent-gate">
      <div className="panel column">
        <h2 className="subtitle">{FA.parentGateTitle}</h2>
        <p className="text">{FA.parentGateHint}</p>
        <button
          type="button"
          className="btn btn--large"
          onPointerDown={() => setHoldingSince(Date.now())}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          data-testid="parent-gate-hold"
          aria-label={FA.parentGateHint}
        >
          {holdingSince === null ? FA.parentArea : FA.parentGateHolding}
        </button>
        <div
          className="gate-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="gate-progress__fill" style={{ inlineSize: `${progress * 100}%` }} />
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onCancel}
          data-testid="parent-gate-cancel"
        >
          {FA.parentGateCancel}
        </button>
      </div>
    </div>
  );
}
