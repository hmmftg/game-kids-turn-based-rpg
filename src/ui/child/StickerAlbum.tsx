import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { QUEST_DEFINITIONS } from '../../domain/quests/definitions.ts';
import type { StickerId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';

/**
 * Sticker album overlay: a presentation layer over `state.stickers`. Locked
 * slots are derived in the UI — every quest owns a slot, earned or not — so no
 * separate sticker inventory exists. Empty slots show a silhouette rather than
 * revealing the reward.
 */
export function StickerAlbum({
  stickers,
  onClose,
}: {
  readonly stickers: readonly StickerId[];
  readonly onClose: () => void;
}) {
  const earned = new Set<StickerId>(stickers);
  return (
    <div className="layer layer--overlay" data-testid="sticker-album">
      <div className="panel column" dir="rtl">
        <h2 className="subtitle">{FA.albumTitle}</h2>
        {stickers.length === 0 ? <p className="text text--soft">{FA.albumEmpty}</p> : null}
        <div className="row album-grid">
          {QUEST_DEFINITIONS.map((quest) => {
            const has = earned.has(quest.stickerId);
            const copy = getQuestCopy(quest.id);
            return (
              <div
                key={quest.id}
                className={`album-slot${has ? ' album-slot--earned' : ''}`}
                data-testid={`album-${quest.stickerId}`}
              >
                <span className="emoji album-slot__emoji" aria-hidden="true">
                  {has ? questEmoji(quest.id) : '❔'}
                </span>
                <span className={has ? 'trail__title' : 'text--soft'}>
                  {has ? copy.stickerLabelFa : FA.stickerLocked}
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={onClose} data-testid="album-close">
          {FA.backToHood}
        </button>
      </div>
    </div>
  );
}
