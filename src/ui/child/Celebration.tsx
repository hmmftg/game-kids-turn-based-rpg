import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import type { QuestId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';

/**
 * Presentation-only quest-completion celebration. It renders *after* the
 * domain state has already transitioned — the quest is complete and the
 * sticker is already owned before this overlay appears, so dismissing it can
 * never undo progress. The Continue action is always available; the animation
 * (~1.5–2.5s) is decoration, and under reduced motion the whole sequence
 * collapses to an instant state change via the duration tokens.
 */
export function QuestCelebration({
  questId,
  onDone,
}: {
  readonly questId: QuestId;
  readonly onDone: () => void;
}) {
  const copy = getQuestCopy(questId);
  return (
    <div className="layer layer--overlay celebration" data-testid="quest-celebration">
      <div className="panel column celebration__card" dir="rtl">
        <span className="emoji celebration__burst" aria-hidden="true">
          🎉
        </span>
        <h2 className="title">{FA.wellDone}</h2>
        <p className="text">{copy.completionFa}</p>
        <div className="celebration__sticker" data-testid="celebration-sticker">
          <span className="emoji celebration__sticker-emoji" aria-hidden="true">
            {questEmoji(questId)}
          </span>
          <span className="trail__title">{copy.stickerLabelFa}</span>
        </div>
        <button
          type="button"
          className="btn btn--large"
          onClick={onDone}
          data-testid="celebration-continue"
        >
          {FA.keepGoing}
        </button>
      </div>
    </div>
  );
}
