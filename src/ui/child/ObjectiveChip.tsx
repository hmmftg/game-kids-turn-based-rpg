import { getQuestCopy } from '../../content/fa/quests.ts';
import type { QuestId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';
import { SceneGlyph } from './SceneChoice.tsx';
import { questElementFor } from './contextInteraction.ts';

/**
 * Persistent «what do I do now?» chip: the thing to interact with + one very
 * short phrase derived from the current suggested quest. Renders nothing when
 * there is no meaningful objective — it is a glance cue, not a second quest
 * trail.
 */
export function ObjectiveChip({
  questId,
  hideActionIcons = false,
  hideText = false,
}: {
  readonly questId: QuestId | null;
  /** Mode noactionicons: the emoji fallback is an action badge — it goes;
   *  the physical objective object stays. */
  readonly hideActionIcons?: boolean | undefined;
  /** Mode-B kid test: no rendered copy. */
  readonly hideText?: boolean | undefined;
}) {
  if (questId === null) return null;
  const copy = getQuestCopy(questId);
  const element = questElementFor(questId);
  if (element === null && hideActionIcons && hideText) return null;
  return (
    <div className="objective" role="status" data-testid="objective-chip">
      {element !== null ? (
        <span className="objective__object" aria-hidden="true">
          <SceneGlyph element={element} size={36} />
        </span>
      ) : hideActionIcons ? null : (
        <span className="emoji objective__emoji" aria-hidden="true">
          {questEmoji(questId)}
        </span>
      )}
      {hideText ? null : <span className="objective__text">{copy.objectiveFa}</span>}
    </div>
  );
}
