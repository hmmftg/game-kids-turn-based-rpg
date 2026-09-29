import type { ReactNode } from 'react';
import { getIcon } from '../../content/fa/icons.ts';
import type { IconId } from '../../domain/game/types.ts';
import { ActionGlyph } from './ActionGlyph.tsx';

export interface ChoiceOption {
  readonly iconId: IconId;
  readonly onSelect: () => void;
}

/**
 * One idea per card, RTL, in the DOM (never inside the canvas) so Persian text
 * shaping and screen readers behave correctly. Cards never dismiss on a timer:
 * the child always acts first.
 */
export function DialogueCard({
  speakerFa,
  speakerEmoji,
  iconId,
  textFa,
  choices,
  children,
  testId,
  variant,
}: {
  readonly speakerFa?: string | undefined;
  readonly speakerEmoji?: string | undefined;
  readonly iconId?: IconId | null | undefined;
  readonly textFa: string;
  readonly choices?: readonly ChoiceOption[] | undefined;
  readonly children?: ReactNode;
  readonly testId?: string | undefined;
  /** 'retry' adds a gentle wobble + 👀 marker after a not-quite pick. */
  readonly variant?: 'retry' | undefined;
}) {
  const icon = iconId ? getIcon(iconId) : null;
  return (
    <section
      className={`dialogue-card${variant === 'retry' ? ' dialogue-card--retry' : ''}`}
      dir="rtl"
      aria-live="polite"
      data-testid={testId ?? 'dialogue-card'}
    >
      {variant === 'retry' ? (
        <span className="emoji dialogue-card__look" aria-hidden="true">
          👀
        </span>
      ) : null}
      {speakerFa ? (
        <p className="dialogue-card__speaker">
          {speakerEmoji ? (
            <span className="emoji dialogue-card__emoji" aria-hidden="true">
              {speakerEmoji}
            </span>
          ) : null}
          {speakerFa}
        </p>
      ) : null}
      {icon ? <ActionGlyph iconId={iconId!} size={64} color={icon.color} /> : null}
      <p className="dialogue-card__text">{textFa}</p>
      {choices && choices.length > 0 ? (
        <div className="row" role="group" data-testid="choices">
          {choices.slice(0, 3).map((choice) => {
            const choiceIcon = getIcon(choice.iconId);
            return (
              <button
                key={choice.iconId}
                type="button"
                className="btn btn--large btn--icon choice"
                style={{ borderColor: choiceIcon.color }}
                onClick={choice.onSelect}
                aria-label={choiceIcon.labelFa}
                data-testid={`choice-${choice.iconId}`}
              >
                <ActionGlyph iconId={choice.iconId} color={choiceIcon.color} />
                <span className="choice__label">{choiceIcon.labelFa}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {children ? <div className="row">{children}</div> : null}
    </section>
  );
}
