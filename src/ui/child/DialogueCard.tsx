import type { ReactNode } from 'react';

/**
 * One idea per card, RTL, in the DOM (never inside the canvas) so Persian text
 * shaping and screen readers behave correctly. Cards never dismiss on a timer:
 * the child always acts first.
 */
export function DialogueCard({
  speakerFa,
  speakerEmoji,
  textFa,
  scene,
  children,
  testId,
  variant,
  onTap,
  hideText,
}: {
  readonly speakerFa?: string | undefined;
  readonly speakerEmoji?: string | undefined;
  readonly textFa: string;
  /** Direct-manipulation strip: tappable world objects rendered above the
   *  (then secondary) glyph buttons. */
  readonly scene?: ReactNode;
  readonly children?: ReactNode;
  readonly testId?: string | undefined;
  /** 'retry' marks the card as a gentle retry state; the physical reaction
   *  (the actor questioning) lives in the scene, not as an abstract marker. */
  readonly variant?: 'retry' | undefined;
  /** Optional skip-anywhere: tapping the card advances the current beat.
   *  Never required — the beat also advances on its own. */
  readonly onTap?: (() => void) | undefined;
  /** Mode-B kid test: visuals only, no rendered copy. */
  readonly hideText?: boolean | undefined;
}) {
  return (
    <section
      className={`dialogue-card${variant === 'retry' ? ' dialogue-card--retry' : ''}${
        onTap ? ' dialogue-card--skippable' : ''
      }`}
      dir="rtl"
      data-testid={testId ?? 'dialogue-card'}
      onClick={onTap}
      // Skippable cards are keyboard-advanceable too: focusable + Enter/Space
      // does what a tap does. Never required — the beat advances on its own.
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={
        onTap
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onTap();
              }
            }
          : undefined
      }
    >
      {speakerFa && !hideText ? (
        <p className="dialogue-card__speaker">
          {speakerEmoji ? (
            <span className="emoji dialogue-card__emoji" aria-hidden="true">
              {speakerEmoji}
            </span>
          ) : null}
          {speakerFa}
        </p>
      ) : null}
      {hideText ? null : (
        // Live region on the words only — a polite announcement carries the
        // new line; interactive children aren't re-announced as text.
        <p className="dialogue-card__text" aria-live="polite">
          {textFa}
        </p>
      )}
      {scene}
      {children ? <div className="row">{children}</div> : null}
    </section>
  );
}
