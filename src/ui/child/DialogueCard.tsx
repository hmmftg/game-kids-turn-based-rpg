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
  /** 'retry' adds a gentle wobble + 👀 marker after a not-quite pick. */
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
      aria-live="polite"
      data-testid={testId ?? 'dialogue-card'}
      onClick={onTap}
    >
      {variant === 'retry' ? (
        <span className="emoji dialogue-card__look" aria-hidden="true">
          👀
        </span>
      ) : null}
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
      {hideText ? null : <p className="dialogue-card__text">{textFa}</p>}
      {scene}
      {children ? <div className="row">{children}</div> : null}
    </section>
  );
}
