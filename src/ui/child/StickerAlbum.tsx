import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { QUEST_DEFINITIONS } from '../../domain/quests/definitions.ts';
import type { QuestId, StickerId } from '../../domain/game/types.ts';
import { faDigits } from '../faDigits.ts';
import { Overlay } from '../Overlay.tsx';
import { questEmoji } from './emoji.ts';
import { questElementFor } from './contextInteraction.ts';
import { SceneGlyph } from './SceneChoice.tsx';

/**
 * Sticker album overlay: a presentation layer over `state.stickers`. Locked
 * slots are derived in the UI — every quest owns a slot, earned or not — so no
 * separate sticker inventory exists. Empty slots show a silhouette rather than
 * revealing the reward — but they are also the album's journey: tapping a
 * locked slot walks the child to that quest, so "what's missing" answers
 * "where do I go" in one tap.
 */
export function StickerAlbum({
  stickers,
  onClose,
  onGoQuest,
}: {
  readonly stickers: readonly StickerId[];
  readonly onClose: () => void;
  /** Navigation for locked slots — same dispatch the quest trail uses. */
  readonly onGoQuest: (questId: QuestId) => void;
}) {
  const earned = new Set<StickerId>(stickers);
  return (
    <Overlay testId="sticker-album" ariaLabel={FA.albumTitle} onDismiss={onClose}>
      <div className="panel column" dir="rtl">
        <h2 className="subtitle">
          {FA.albumTitle}{' '}
          <span className="text--soft" data-testid="album-progress">
            {faDigits(stickers.length)} / {faDigits(QUEST_DEFINITIONS.length)}
          </span>
        </h2>
        {stickers.length === 0 ? <p className="text text--soft">{FA.albumEmpty}</p> : null}
        <div className="row album-grid">
          {QUEST_DEFINITIONS.map((quest) => {
            const has = earned.has(quest.stickerId);
            const copy = getQuestCopy(quest.id);
            const objectElement = questElementFor(quest.id);
            const icon = has ? (
              <span className="emoji album-slot__emoji" aria-hidden="true">
                {questEmoji(quest.id)}
              </span>
            ) : objectElement !== null ? (
              <span className="album-slot__object" aria-hidden="true">
                <SceneGlyph element={objectElement} size={44} />
              </span>
            ) : (
              <span className="emoji album-slot__emoji" aria-hidden="true">
                ❔
              </span>
            );
            if (has) {
              return (
                <div
                  key={quest.id}
                  className="album-slot album-slot--earned"
                  data-testid={`album-${quest.stickerId}`}
                >
                  {icon}
                  <span className="trail__title">{copy.stickerLabelFa}</span>
                </div>
              );
            }
            return (
              <button
                key={quest.id}
                type="button"
                className="album-slot album-slot--locked"
                aria-label={`${copy.titleFa} — ${FA.stickerLocked}`}
                onClick={() => onGoQuest(quest.id)}
                data-testid={`album-${quest.stickerId}`}
              >
                {icon}
                <span className="text--soft">{FA.stickerLocked}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={onClose} data-testid="album-close">
          {FA.backToHood}
        </button>
      </div>
    </Overlay>
  );
}
