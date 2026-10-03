import { FA } from '../../content/fa/strings.ts';

/**
 * First-use teaching cue: one short line, no animated hand. It is
 * session-transient — the app hides it for good once the child has tapped.
 */
export function InteractionHint() {
  return (
    <div className="hint" role="status" data-testid="interaction-hint">
      <span className="hint__text">{FA.tapHere}</span>
    </div>
  );
}
