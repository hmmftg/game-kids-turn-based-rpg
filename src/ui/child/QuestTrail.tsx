import { useEffect, useRef, useState } from 'react';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { QUEST_DEFINITIONS } from '../../domain/quests/definitions.ts';
import type { MapId, QuestId, QuestStatus, StickerId } from '../../domain/game/types.ts';
import { questEmoji } from './emoji.ts';
import { SceneGlyph } from './SceneChoice.tsx';
import { questElementFor } from './contextInteraction.ts';

const STATUS_LABEL: Record<QuestStatus, string> = {
  locked: FA.questLocked,
  available: FA.questAvailable,
  active: FA.questAvailable,
  completed: FA.questCompleted,
};

const STATUS_GLYPH: Record<QuestStatus, string> = {
  locked: '🔒',
  available: '○',
  active: '👈',
  completed: '⭐',
};

/** Same small-screen contract as the CSS: portrait and short landscape get
 *  the collapsed journey chip instead of the open rail. */
const COMPACT_QUERY = '(orientation: portrait), (max-height: 480px)';

function useCompactScreen(): boolean {
  const [compact, setCompact] = useState(
    () => typeof matchMedia === 'function' && matchMedia(COMPACT_QUERY).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return compact;
}

/**
 * Visual journey of chapters. States are carried by glyph + shape + scale +
 * label, never colour alone: locked shows a lock, completed a star, and the
 * next quest gets the «go here» marker, a connector and a larger node.
 *
 * Layout adapts: tall viewports get a vertical rail at the inline edge, short
 * landscape viewports get a compact icon rail, and very wide screens get a
 * horizontal journey — ordered in DOM order under `dir="rtl"`, so the path
 * reads right-to-left like a Persian page. The trail scrolls internally and
 * the current node is kept in view; the page itself never scrolls sideways.
 */
export function QuestTrail({
  statuses,
  currentId,
  mapId,
  hideActionIcons = false,
  hideText = false,
  onGo,
}: {
  readonly statuses: Record<QuestId, QuestStatus>;
  readonly currentId: QuestId | null;
  /** The mounted map — quests living elsewhere are shown but not go-able. */
  readonly mapId: MapId;
  /** Mode noactionicons: status/action badges and emoji fallbacks go;
   *  physical quest objects remain the affordance. */
  readonly hideActionIcons?: boolean | undefined;
  /** Mode-B kid test: no rendered copy. */
  readonly hideText?: boolean | undefined;
  readonly onGo: (questId: QuestId) => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const compact = useCompactScreen();
  // The journey rail fills a big share of a phone screen, so small screens
  // start with a one-line summary chip; the full rail is a tap away and
  // closes again on quest pick or an outside tap. Session-only state.
  const [expanded, setExpanded] = useState(false);
  const collapsed = compact && !expanded;
  const doneCount = QUEST_DEFINITIONS.filter((q) => statuses[q.id] === 'completed').length;
  const currentQuest = QUEST_DEFINITIONS.find((q) => q.id === currentId) ?? null;

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [currentId, expanded]);

  // Outside-tap dismissal: a tap anywhere but the rail/chip collapses it.
  // The tap itself is not swallowed — the world still receives it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!(compact && expanded)) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [compact, expanded]);

  const goAndClose = (questId: QuestId) => {
    setExpanded(false);
    onGo(questId);
  };

  const currentObject = currentQuest ? questElementFor(currentQuest.id) : null;

  return (
    <div className="trail-cluster" ref={rootRef}>
      {compact ? (
        <button
          type="button"
          className="btn trail-toggle"
          aria-expanded={expanded}
          aria-label={FA.questTrail}
          data-testid="trail-toggle"
          onClick={() => setExpanded((open) => !open)}
        >
          {currentObject !== null ? (
            <span className="trail-toggle__object" aria-hidden="true">
              <SceneGlyph element={currentObject} size={36} />
            </span>
          ) : hideActionIcons || currentQuest === null ? null : (
            <span className="emoji trail-toggle__emoji" aria-hidden="true">
              {questEmoji(currentQuest.id)}
            </span>
          )}
          {doneCount > 0 ? (
            <span className="trail-toggle__stars" aria-hidden="true">
              {'⭐'.repeat(Math.min(doneCount, 3))}
            </span>
          ) : null}
          <span className="trail-toggle__chevron" aria-hidden="true">
            {expanded ? '▴' : '▾'}
          </span>
        </button>
      ) : null}
      <nav
        className="trail"
        aria-label={FA.questTrail}
        data-testid="quest-trail"
        dir="rtl"
        hidden={collapsed}
      >
        {QUEST_DEFINITIONS.map((quest, index) => {
          const status = statuses[quest.id];
          const copy = getQuestCopy(quest.id);
          // A quest on another map is shown but cannot be walked to from here.
          const offMap = (quest.mapId ?? 'map-town') !== mapId;
          const locked = status === 'locked' || offMap;
          const current = quest.id === currentId && status !== 'completed';
          const label = `${copy.titleFa} — ${STATUS_LABEL[status]}`;
          const objectElement = questElementFor(quest.id);
          return (
            <div
              key={quest.id}
              className={`trail__step${index === 0 ? ' trail__step--first' : ''}`}
            >
              <button
                ref={current ? currentRef : undefined}
                type="button"
                className={`btn btn--icon trail__item trail__item--${status}${
                  current ? ' trail__item--current' : ''
                }`}
                onClick={() => goAndClose(quest.id)}
                disabled={locked}
                aria-disabled={locked}
                aria-current={current ? 'step' : undefined}
                aria-label={label}
                data-testid={`trail-${quest.id}`}
              >
                {hideActionIcons ? null : (
                  <span className="trail__badge" aria-hidden="true">
                    {STATUS_GLYPH[status]}
                  </span>
                )}
                {objectElement !== null ? (
                  <span className="trail__object" aria-hidden="true">
                    <SceneGlyph element={objectElement} size={40} />
                  </span>
                ) : hideActionIcons ? null : (
                  <span className="emoji trail__emoji" aria-hidden="true">
                    {questEmoji(quest.id)}
                  </span>
                )}
                {hideText ? null : (
                  <>
                    <span className="trail__title">{copy.titleFa}</span>
                    <span className="text--soft trail__status">{STATUS_LABEL[status]}</span>
                    {current ? (
                      <span className="trail__here" aria-hidden="true">
                        {FA.goThere}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Compact HUD sticker chip. Shows earned stickers at a glance and opens the
 * full album; the album itself is an overlay in `StickerAlbum`.
 */
export function StickerShelf({
  stickers,
  onOpen,
}: {
  readonly stickers: readonly StickerId[];
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="btn stickers"
      onClick={onOpen}
      aria-label={FA.seeStickers}
      data-testid="sticker-shelf"
    >
      {stickers.length === 0 ? (
        <span className="text--soft">{FA.noStickers}</span>
      ) : (
        <span className="row stickers__row">
          {stickers.map((sticker) => {
            const quest = QUEST_DEFINITIONS.find((entry) => entry.stickerId === sticker);
            return (
              <span key={sticker} className="sticker" data-testid={`sticker-${sticker}`}>
                <span className="emoji sticker__emoji" aria-hidden="true">
                  {quest ? questEmoji(quest.id) : '⭐'}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </button>
  );
}
