import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { QUEST_DEFINITIONS } from '../../domain/quests/definitions.ts';
import type { QuestId, QuestStatus, StickerId } from '../../domain/game/types.ts';
import { Pictogram } from './Pictogram.tsx';

const STATUS_LABEL: Record<QuestStatus, string> = {
  locked: FA.questLocked,
  available: FA.questAvailable,
  active: FA.questAvailable,
  completed: FA.questCompleted,
};

/** Visual trail of chapters: shape + label, never colour alone. */
export function QuestTrail({
  statuses,
  onGo,
}: {
  readonly statuses: Record<QuestId, QuestStatus>;
  readonly onGo: (questId: QuestId) => void;
}) {
  return (
    <nav className="trail" aria-label={FA.questTrail} data-testid="quest-trail">
      {QUEST_DEFINITIONS.map((quest) => {
        const status = statuses[quest.id];
        const copy = getQuestCopy(quest.id);
        const locked = status === 'locked';
        return (
          <button
            key={quest.id}
            type="button"
            className={`btn btn--icon trail__item trail__item--${status}`}
            onClick={() => onGo(quest.id)}
            disabled={locked}
            aria-disabled={locked}
            data-testid={`trail-${quest.id}`}
          >
            <Pictogram shape={status === 'completed' ? 'star' : 'arrow-forward'} size={36} />
            <span className="trail__title">{copy.titleFa}</span>
            <span className="text--soft">{STATUS_LABEL[status]}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function StickerShelf({ stickers }: { readonly stickers: readonly StickerId[] }) {
  return (
    <section className="stickers" aria-label={FA.stickers} data-testid="sticker-shelf">
      {stickers.length === 0 ? <p className="text text--soft">{FA.noStickers}</p> : null}
      <div className="row">
        {stickers.map((sticker) => {
          const quest = QUEST_DEFINITIONS.find((entry) => entry.stickerId === sticker);
          const label = quest ? getQuestCopy(quest.id).stickerLabelFa : sticker;
          return (
            <span key={sticker} className="sticker" data-testid={`sticker-${sticker}`}>
              <Pictogram shape="star" size={40} />
              <span className="text--soft">{label}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
