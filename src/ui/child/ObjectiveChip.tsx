import { getQuestCopy } from '../../content/fa/quests.ts';
import type { QuestId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';

/**
 * Persistent «what do I do now?» chip: one icon + one very short phrase derived
 * from the current suggested quest. Renders nothing when there is no meaningful
 * objective — it is a glance cue, not a second quest trail.
 */
export function ObjectiveChip({ questId }: { readonly questId: QuestId | null }) {
  if (questId === null) return null;
  const copy = getQuestCopy(questId);
  return (
    <div className="objective" role="status" data-testid="objective-chip">
      <span className="emoji objective__emoji" aria-hidden="true">
        {questEmoji(questId)}
      </span>
      <span className="objective__text">{copy.objectiveFa}</span>
    </div>
  );
}
