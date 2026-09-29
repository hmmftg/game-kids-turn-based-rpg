import type { CSSProperties } from 'react';
import type { IconId } from '../../domain/game/types.ts';
import { getIcon } from '../../content/fa/icons.ts';

/**
 * SceneChoice — the direct-manipulation experiment.
 *
 * Instead of asking the child to decode an action symbol, each choice is the
 * concrete *thing or place* the action acts on: the leaf on the ground, the
 * basket, the shelf, the neighbour. The child taps the object; the existing
 * CHOOSE(iconId) command fires unchanged underneath.
 *
 * Only choices whose outcome maps to a distinct concrete target get a scene
 * element (`sceneElementFor`); ambiguous ones — e.g. `icon-kick`, which acts
 * on the same leaf as pick-up — fall back to the secondary ActionGlyph row.
 *
 * Interaction states are classes (`st-available`, press via :active), all
 * motion is CSS and event-driven — nothing loops, nothing draws under
 * frameloop="demand".
 */

export type SceneElement =
  | 'person'
  | 'face'
  | 'person-away'
  | 'path-back'
  | 'path-forward'
  | 'basket'
  | 'shelf'
  | 'floor'
  | 'leaf'
  | 'bin'
  | 'water';

/** The object a step implies the child is already holding (displayed at the
 *  hand marker on the strip's start edge). Keyed by the *correct* icon. */
export const HELD_ITEM: Partial<Record<IconId, 'leaf' | 'basket'>> = {
  'icon-place-basket': 'basket',
  'icon-drop-basket': 'basket',
  'icon-basket-bin': 'leaf',
  'icon-leave-ground': 'leaf',
};

/** iconId → the concrete tappable target it represents, or null when the
 *  choice has no distinct object/place and must stay a glyph button. */
export function sceneElementFor(iconId: IconId): SceneElement | null {
  switch (iconId) {
    case 'icon-greet':
      return 'person';
    case 'icon-smile':
      return 'face';
    case 'icon-wave-away':
      return 'person-away';
    case 'icon-turn-back':
      return 'path-back';
    case 'icon-help-carry':
      return 'basket';
    case 'icon-watch':
      return 'person';
    case 'icon-place-basket':
      return 'shelf';
    case 'icon-drop-basket':
    case 'icon-leave-ground':
      return 'floor';
    case 'icon-pick-up':
      return 'leaf';
    case 'icon-basket-bin':
      return 'bin';
    case 'icon-wash-hands':
      return 'water';
    case 'icon-skip':
      return 'path-forward';
    default:
      return null;
  }
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const GROUND_LINE = <path d="M6 42h36" {...stroke} opacity={0.35} />;
const LEAF_SHAPE = <ellipse cx="24" cy="38" rx="6" ry="3.4" {...stroke} />;
const BASKET_SHAPE = (
  <>
    <path d="M15 24h18l-2.5 13H17.5z" {...stroke} />
    <path d="M19 24a5 5 0 0 1 10 0" {...stroke} />
  </>
);
const PERSON_SHAPE = (
  <>
    <circle cx="24" cy="14" r="6.5" {...stroke} />
    <path d="M17 40c0-9 3-14 7-14s7 5 7 14" {...stroke} />
  </>
);

function renderElement(element: SceneElement) {
  switch (element) {
    case 'person':
      // the neighbour — tap the person to greet/watch them
      return (
        <>
          {PERSON_SHAPE}
          <path d="M33 22l6-8M35 26l8-6" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'face':
      return (
        <>
          <circle cx="24" cy="22" r="14" {...stroke} />
          <circle cx="19" cy="19" r="1.6" fill="currentColor" />
          <circle cx="29" cy="19" r="1.6" fill="currentColor" />
          <path d="M17 27a9 9 0 0 0 14 0" {...stroke} />
        </>
      );
    case 'person-away':
      return (
        <>
          {/* back of the head: hair cap, no face */}
          <circle cx="24" cy="14" r="6.5" {...stroke} />
          <path d="M18.5 12a6.5 6.5 0 0 1 11 0" {...stroke} strokeWidth={4.4} />
          <path d="M17 40c0-9 3-14 7-14s7 5 7 14" {...stroke} />
          {GROUND_LINE}
          <path d="M8 30h-3m3 0l3-3M5 30l3 3" {...stroke} />
        </>
      );
    case 'path-back':
      return (
        <>
          <path d="M38 40c-8 0-10-4-10-9s4-8 10-9" {...stroke} />
          <path d="M26 22c-6-1-10 1-12 6" {...stroke} strokeDasharray="4 4" />
          <path d="M14 28l-4 2 4 3" {...stroke} />
        </>
      );
    case 'path-forward':
      return (
        <>
          <path d="M10 40c8 0 10-4 10-9s-4-8-10-9" {...stroke} />
          <path d="M22 22c6-1 10 1 12 6" {...stroke} strokeDasharray="4 4" />
          <path d="M34 28l4 2-4 3" {...stroke} />
        </>
      );
    case 'basket':
      return (
        <>
          {BASKET_SHAPE}
          {GROUND_LINE}
        </>
      );
    case 'shelf':
      // a raised surface — where the basket belongs
      return (
        <>
          <path d="M12 26h24" {...stroke} strokeWidth={4.4} />
          <path d="M16 26v12M32 26v12" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'floor':
      return (
        <>
          {GROUND_LINE}
          <ellipse cx="24" cy="38" rx="8" ry="3" {...stroke} strokeDasharray="3 3" />
        </>
      );
    case 'leaf':
      return (
        <>
          {LEAF_SHAPE}
          {GROUND_LINE}
        </>
      );
    case 'bin':
      return (
        <>
          <path d="M16 22h16l-2 16H18z" {...stroke} />
          <path d="M14 22h20" {...stroke} strokeWidth={4.4} />
          {GROUND_LINE}
        </>
      );
    case 'water':
      return (
        <>
          <path d="M10 22q7-6 14-2t14 0" {...stroke} />
          <path d="M18 12q2.5 4 0 7M28 12q2.5 4 0 7M23 6q2.5 4 0 7" {...stroke} />
          {GROUND_LINE}
        </>
      );
  }
}

function HeldMarker({ item }: { readonly item: 'leaf' | 'basket' }) {
  return (
    <span className="scene-held" aria-hidden="true" data-held={item}>
      <svg width="44" height="44" viewBox="0 0 48 48" focusable="false" role="presentation">
        <path
          d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
          {...stroke}
        />
        {item === 'leaf' ? (
          <ellipse cx="33" cy="12" rx="5" ry="2.8" {...stroke} />
        ) : (
          <path d="M28 8h10l-1.5 8h-7z" {...stroke} />
        )}
      </svg>
    </span>
  );
}

export interface SceneChoiceItem {
  readonly iconId: IconId;
  readonly element: SceneElement;
  readonly onSelect: () => void;
}

export function SceneChoice({
  items,
  held,
}: {
  readonly items: readonly SceneChoiceItem[];
  readonly held?: 'leaf' | 'basket' | undefined;
}) {
  if (items.length === 0) return null;
  return (
    <div className="scene-strip" dir="rtl" data-testid="scene-choice">
      {held ? <HeldMarker item={held} /> : null}
      {items.map((item, i) => {
        const icon = getIcon(item.iconId);
        return (
          <button
            key={item.iconId}
            type="button"
            className="scene-target st-available"
            style={{ borderColor: icon.color, color: icon.color }}
            onClick={item.onSelect}
            aria-label={icon.labelFa}
            data-testid={`scene-${item.iconId}`}
            data-element={item.element}
          >
            <svg
              className="scene-el"
              style={{ '--i': i } as CSSProperties}
              width="76"
              height="76"
              viewBox="0 0 48 48"
              aria-hidden="true"
              focusable="false"
              role="presentation"
              data-icon={item.iconId}
            >
              <circle cx="24" cy="24" r="22" fill="currentColor" opacity={0.14} />
              <circle
                className="scene-target__ring"
                cx="24"
                cy="24"
                r="21"
                {...stroke}
                opacity={0.55}
              />
              {renderElement(item.element)}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
