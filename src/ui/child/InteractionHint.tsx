import { FA } from '../../content/fa/strings.ts';

/**
 * First-use teaching cue: a bobbing finger plus one short line. Pure CSS
 * motion; under `prefers-reduced-motion` it renders as a still marker. It is
 * session-transient — the app hides it for good once the child has tapped.
 */
export function InteractionHint() {
  return (
    <div className="hint" role="status" data-testid="interaction-hint">
      <span className="emoji hint__finger" aria-hidden="true">
        👆
      </span>
      <span className="hint__text">{FA.tapHere}</span>
    </div>
  );
}
