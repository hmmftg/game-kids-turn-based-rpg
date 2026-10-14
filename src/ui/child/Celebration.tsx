import { abilityCopyFor } from '../../content/fa/battles.ts';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { getQuestDefinition } from '../../domain/quests/definitions.ts';
import type { QuestId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';
import { BATTLE_ACTION_ELEMENT, SceneGlyph } from './SceneChoice.tsx';

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
  // The quest's battle keepsake joined the child's pocket when the quest
  // committed — this beat only *announces* it; dismissing changes nothing.
  const ability = abilityCopyFor(getQuestDefinition(questId).battleAbility);
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
        {ability ? (
          <div className="celebration__ability" data-testid="celebration-ability">
            <SceneGlyph element={BATTLE_ACTION_ELEMENT[ability.action]} size={44} />
            <span className="trail__title">{ability.unlockFa}</span>
          </div>
        ) : null}
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
