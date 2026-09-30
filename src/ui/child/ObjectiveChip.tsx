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
export function ObjectiveChip({ questId }: { readonly questId: QuestId | null }) {
  if (questId === null) return null;
  const copy = getQuestCopy(questId);
  const element = questElementFor(questId);
  return (
    <div className="objective" role="status" data-testid="objective-chip">
      {element !== null ? (
        <span className="objective__object" aria-hidden="true">
          <SceneGlyph element={element} size={36} />
        </span>
      ) : (
        <span className="emoji objective__emoji" aria-hidden="true">
          {questEmoji(questId)}
        </span>
      )}
      <span className="objective__text">{copy.objectiveFa}</span>
    </div>
  );
}
