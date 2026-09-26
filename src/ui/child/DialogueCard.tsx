import type { ReactNode } from 'react';
import { getIcon } from '../../content/fa/icons.ts';
import type { IconId } from '../../domain/game/types.ts';
import { Pictogram } from './Pictogram.tsx';

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
  textFa,
  choices,
  children,
  testId,
}: {
  readonly speakerFa?: string | undefined;
  readonly textFa: string;
  readonly choices?: readonly ChoiceOption[] | undefined;
  readonly children?: ReactNode;
  readonly testId?: string | undefined;
}) {
  return (
    <section
      className="dialogue-card"
      dir="rtl"
      aria-live="polite"
      data-testid={testId ?? 'dialogue-card'}
    >
      {speakerFa ? <p className="dialogue-card__speaker">{speakerFa}</p> : null}
      <p className="dialogue-card__text">{textFa}</p>
      {choices && choices.length > 0 ? (
        <div className="row" role="group" data-testid="choices">
          {choices.slice(0, 3).map((choice) => {
            const icon = getIcon(choice.iconId);
            return (
              <button
                key={choice.iconId}
                type="button"
                className="btn btn--large btn--icon choice"
                onClick={choice.onSelect}
                aria-label={icon.labelFa}
                data-testid={`choice-${choice.iconId}`}
              >
                <Pictogram shape={icon.shape} />
                <span className="choice__label">{icon.labelFa}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {children ? <div className="row">{children}</div> : null}
    </section>
  );
}
