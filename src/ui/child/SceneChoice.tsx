import { useRef, useState, type CSSProperties } from 'react';
import type { IconId } from '../../domain/game/types.ts';
import { getIcon } from '../../content/fa/icons.ts';
import { prefersReducedMotion } from '../../services/device/capabilities.ts';
import type { SceneObject } from './contextInteraction.ts';

/**
 * SceneChoice — the contextual target layer.
 *
 * The child's interaction language is *the thing*: the leaf on the ground,
 * the bin, the neighbour. Exactly one object carries `primary` prominence
 * (the correct target); wrong things stay tappable but visually weaker —
 * their tap still fires CHOOSE(iconId) so the existing gentle-retry works.
 *
 * Truthful feedback ordering: a tap plays only a short press pulse, then
 * CHOOSE decides. The real consequence (object flying to the hand, into the
 * bin, …) renders on the *response* card via <ConsequenceScene> — never
 * before the outcome is known. No success animation follows a wrong tap.
 *
 * All motion is CSS and event-driven — nothing loops, nothing draws under
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
  | 'water'
  | 'kite'
  | 'fish'
  | 'shell'
  | 'bread'
  | 'book'
  | 'ball'
  | 'crystal'
  | 'mouse';

/** The thing a step implies the child is already holding (displayed at the
 *  hand marker on the strip's start edge). Keyed by the *correct* icon. */
export type HeldItem = 'leaf' | 'basket' | 'kite' | 'shell' | 'bread' | 'crystal';

export const HELD_ITEM: Partial<Record<IconId, HeldItem>> = {
  'icon-place-basket': 'basket',
  'icon-drop-basket': 'basket',
  'icon-basket-bin': 'leaf',
  'icon-leave-ground': 'leaf',
  'icon-give-kite': 'kite',
  'icon-give-shell': 'shell',
  'icon-place-bread': 'bread',
  'icon-give-crystal': 'crystal',
};

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
    case 'kite':
      // a fallen kite — diamond body, little tail
      return (
        <>
          <path d="M24 12l9 10-9 12-9-12z" {...stroke} />
          <path d="M24 34q2 4 0 8m0-8q-3 2-5 5" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'fish':
      // a little fish in the water
      return (
        <>
          <path d="M12 26q6-7 13-7t11 7q-5 7-11 7t-13-7z" {...stroke} />
          <circle cx="18" cy="25" r="1.4" fill="currentColor" />
          <path d="M36 26l5-4v8z" {...stroke} />
          <path d="M10 40q7-4 14-1t14 0" {...stroke} opacity={0.5} />
        </>
      );
    case 'shell':
      // a scallop shell on the bank
      return (
        <>
          <path d="M14 38a10 10 0 0 1 20 0z" {...stroke} />
          <path d="M18 38l2-8M24 38v-9M30 38l-2-8" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'bread':
      // a warm loaf
      return (
        <>
          <ellipse cx="24" cy="30" rx="11" ry="6" {...stroke} />
          <path d="M18 27q2-2 4 0M24 26q2-2 4 0" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'book':
      // an open picture card
      return (
        <>
          <path d="M10 16q7-3 14 0v20q-7-3-14 0z" {...stroke} />
          <path d="M38 16q-7-3-14 0v20q7-3 14 0z" {...stroke} />
        </>
      );
    case 'ball':
      return (
        <>
          <circle cx="24" cy="30" r="10" {...stroke} />
          <path d="M14 30h20M24 20v20" {...stroke} opacity={0.6} />
          {GROUND_LINE}
        </>
      );
    case 'crystal':
      // a small glowing crystal cluster
      return (
        <>
          <path d="M20 38l-3-16 5-8 4 8zM28 38l1-12 5-6 2 8z" {...stroke} />
          <path d="M14 38h20" {...stroke} opacity={0.35} />
        </>
      );
    case 'mouse':
      // the little cave mouse — round ears, pointy nose, tail
      return (
        <>
          <circle cx="18" cy="14" r="5" {...stroke} />
          <circle cx="30" cy="14" r="5" {...stroke} />
          <ellipse cx="24" cy="28" rx="9" ry="8" {...stroke} />
          <circle cx="21" cy="26" r="1.2" fill="currentColor" />
          <circle cx="27" cy="26" r="1.2" fill="currentColor" />
          <path d="M24 29l-2 3h4z" {...stroke} />
          <path d="M33 32q8 2 6 8" {...stroke} />
        </>
      );
  }
}

/** Small glyph carried in the hand marker — mirrors the scene element. */
function heldShape(item: HeldItem) {
  switch (item) {
    case 'leaf':
      return <ellipse cx="33" cy="12" rx="5" ry="2.8" {...stroke} />;
    case 'basket':
      return <path d="M28 8h10l-1.5 8h-7z" {...stroke} />;
    case 'kite':
      return <path d="M33 5l5 5-5 7-5-7z" {...stroke} />;
    case 'shell':
      return <path d="M28 15a5 5 0 0 1 10 0z" {...stroke} />;
    case 'bread':
      return <ellipse cx="33" cy="12" rx="6" ry="3.4" {...stroke} />;
    case 'crystal':
      return <path d="M30 18l-2-9 3-4 2 4zM34 18l1-7 3-3 1 4z" {...stroke} />;
  }
}

function HeldMarker({ item }: { readonly item: HeldItem }) {
  return (
    <span className="scene-held" aria-hidden="true" data-held={item}>
      <svg width="44" height="44" viewBox="0 0 48 48" focusable="false" role="presentation">
        <path
          d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
          {...stroke}
        />
        {heldShape(item)}
      </svg>
    </span>
  );
}

/** The truthful result of a correct choice, drawn after CHOOSE resolves:
 *  the picked thing lands in the hand, the placed thing lands in/on its
 *  destination, a person reacts. One-shot CSS motion; static under
 *  reduced-motion. */
export function ConsequenceScene({ iconId }: { readonly iconId: IconId }) {
  const icon = getIcon(iconId);
  return (
    <svg
      className="scene-consequence"
      width="104"
      height="104"
      viewBox="0 0 48 48"
      role="img"
      aria-label={icon.labelFa}
      style={{ color: icon.color }}
    >
      {consequenceScene(iconId)}
    </svg>
  );
}

function consequenceScene(iconId: IconId) {
  switch (iconId) {
    case 'icon-pick-up':
    case 'icon-help-carry':
    case 'icon-pick-kite':
    case 'icon-collect-shell':
    case 'icon-take-bread':
      // the object lands in the hand
      return (
        <>
          <path
            d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
            {...stroke}
          />
          <g className="scene-exec-lift">
            {iconId === 'icon-pick-up' ? (
              <ellipse cx="33" cy="12" rx="5" ry="2.8" {...stroke} />
            ) : iconId === 'icon-pick-kite' ? (
              <path d="M33 5l5 5-5 7-5-7z" {...stroke} />
            ) : iconId === 'icon-collect-shell' ? (
              <path d="M28 15a5 5 0 0 1 10 0z" {...stroke} />
            ) : iconId === 'icon-take-bread' ? (
              <ellipse cx="33" cy="12" rx="6" ry="3.4" {...stroke} />
            ) : (
              <path d="M28 8h10l-1.5 8h-7z" {...stroke} />
            )}
          </g>
        </>
      );
    case 'icon-spot-fish':
      // the fish leaps from the river
      return (
        <>
          <path d="M8 38q8-5 16-1t16 0" {...stroke} opacity={0.5} />
          <g className="scene-exec-pop">
            <path d="M14 22q5-6 11-6t9 6q-4 6-9 6t-11-6z" {...stroke} />
            <circle cx="19" cy="21" r="1.2" fill="currentColor" />
            <path d="M34 22l4-3v6z" {...stroke} />
          </g>
        </>
      );
    case 'icon-give-shell':
      // the shell lands in the fisher's basket
      return (
        <>
          <path d="M16 26h16l-2 14H18z" {...stroke} />
          <path d="M14 26h20" {...stroke} strokeWidth={4.4} />
          <g className="scene-exec-drop">
            <path d="M19 20a5 5 0 0 1 10 0z" {...stroke} />
          </g>
        </>
      );
    case 'icon-place-bread':
      // the loaf rests on the shop shelf
      return (
        <>
          <path d="M12 30h24" {...stroke} strokeWidth={4.4} />
          <path d="M16 30v10M32 30v10" {...stroke} />
          <g className="scene-exec-drop">
            <ellipse cx="24" cy="20" rx="9" ry="4.6" {...stroke} />
          </g>
        </>
      );
    case 'icon-tap-book':
      // the picture card glows — the right answer
      return (
        <>
          <path d="M12 16q6-2 12 0v18q-6-2-12 0z" {...stroke} />
          <path d="M36 16q-6-2-12 0v18q6-2 12 0z" {...stroke} />
          <g className="scene-exec-pop">
            <path d="M40 8l2-3M42 12l4-1M8 8l-2-3M6 12l-4-1" {...stroke} />
          </g>
        </>
      );
    case 'icon-tap-ball':
      // the ball pops — the right answer
      return (
        <>
          <circle cx="24" cy="26" r="11" {...stroke} />
          <path d="M13 26h22M24 15v22" {...stroke} opacity={0.6} />
          <g className="scene-exec-pop">
            <path d="M38 12l2-3M10 12l-2-3" {...stroke} />
          </g>
        </>
      );
    case 'icon-find-crystal':
      // the crystal lands in the hand
      return (
        <>
          <path
            d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
            {...stroke}
          />
          <g className="scene-exec-lift">
            <path d="M30 18l-2-9 3-4 2 4zM34 18l1-7 3-3 1 4z" {...stroke} />
          </g>
        </>
      );
    case 'icon-give-crystal':
      // the mouse holds the crystal
      return (
        <>
          <circle cx="18" cy="14" r="5" {...stroke} />
          <circle cx="30" cy="14" r="5" {...stroke} />
          <ellipse cx="24" cy="30" rx="9" ry="8" {...stroke} />
          <circle cx="21" cy="28" r="1.2" fill="currentColor" />
          <circle cx="27" cy="28" r="1.2" fill="currentColor" />
          <g className="scene-exec-pop">
            <path d="M22 22l-1-5 2-3 1 3zM25 22l1-4 2-2 1 2z" {...stroke} />
          </g>
        </>
      );
    case 'icon-place-basket':
      // basket resting on the shelf
      return (
        <>
          <path d="M12 30h24" {...stroke} strokeWidth={4.4} />
          <path d="M16 30v10M32 30v10" {...stroke} />
          <g className="scene-exec-drop">
            <path d="M16 14h16l-2.5 13H18.5z" {...stroke} />
            <path d="M20 14a4 4 0 0 1 8 0" {...stroke} />
          </g>
        </>
      );
    case 'icon-basket-bin':
      // leaf inside the bin
      return (
        <>
          <path d="M16 26h16l-2 14H18z" {...stroke} />
          <path d="M14 26h20" {...stroke} strokeWidth={4.4} />
          <g className="scene-exec-drop">
            <ellipse cx="24" cy="18" rx="5" ry="2.8" {...stroke} />
          </g>
        </>
      );
    case 'icon-wash-hands':
      return (
        <>
          <path d="M10 24q7-6 14-2t14 0" {...stroke} />
          <path d="M18 14q2.5 4 0 7M28 14q2.5 4 0 7M23 8q2.5 4 0 7" {...stroke} />
          <g className="scene-exec-pop">
            <path d="M13 34l3-3m3 3l-3-3m10 3l3-3m3 3l-3-3" {...stroke} />
          </g>
        </>
      );
    case 'icon-greet':
    case 'icon-smile':
    case 'icon-watch':
    default:
      // the person reacts — a wave and a happy face
      return (
        <>
          {PERSON_SHAPE}
          <g className="scene-exec-pop">
            <path d="M33 20l5-7M35 25l7-5" {...stroke} />
          </g>
          {GROUND_LINE}
        </>
      );
  }
}

/** InteractiveTarget — one physical thing/place the child can touch.
 *  Press pulse is the only pre-CHOOSE feedback; the tap is buffered for a
 *  beat so the pulse is visible, then onSelect fires the CHOOSE command. */
function InteractiveTarget({
  object,
  index,
  onSelect,
}: {
  readonly object: SceneObject;
  readonly index: number;
  readonly onSelect: () => void;
}) {
  const icon = getIcon(object.iconId);
  const [pressed, setPressed] = useState(false);
  const pending = useRef(false);
  const handleTap = () => {
    if (pending.current) return;
    pending.current = true;
    if (prefersReducedMotion()) {
      onSelect();
      return;
    }
    setPressed(true);
    // Pulse stays visible ~160ms before the choice is committed; the real
    // consequence is only shown later, on the response card, if CHOOSE says
    // this was the right target.
    window.setTimeout(() => {
      pending.current = false;
      onSelect();
    }, 160);
  };
  const classes = ['scene-target', `st-${object.prominence}`];
  if (object.role === 'escape') classes.push('st-escape');
  if (pressed) classes.push('st-pressed');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={{ borderColor: icon.color, color: icon.color }}
      onClick={handleTap}
      aria-label={icon.labelFa}
      data-testid={`scene-${object.iconId}`}
      data-element={object.element}
      data-primary={object.isCorrect || undefined}
    >
      <svg
        className="scene-el"
        style={{ '--i': index } as CSSProperties}
        width="76"
        height="76"
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
        role="presentation"
        data-icon={object.iconId}
      >
        <circle cx="24" cy="24" r="22" fill="currentColor" opacity={0.14} />
        <circle className="scene-target__ring" cx="24" cy="24" r="21" {...stroke} opacity={0.55} />
        {renderElement(object.element)}
      </svg>
    </button>
  );
}

/** One scene element drawn at a given size — used by the Mode-B question
 *  card to show *what is being asked* without words. */
export function SceneGlyph({
  element,
  size = 76,
  color,
}: {
  readonly element: SceneElement;
  readonly size?: number;
  readonly color?: string | undefined;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={{ color }}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-element={element}
    >
      {renderElement(element)}
    </svg>
  );
}

export function SceneChoice({
  objects,
  held,
  onSelect,
}: {
  readonly objects: readonly SceneObject[];
  readonly held?: HeldItem | undefined;
  readonly onSelect: (iconId: IconId) => void;
}) {
  if (objects.length === 0) return null;
  return (
    <div className="scene-strip" dir="rtl" data-testid="scene-choice">
      {held ? <HeldMarker item={held} /> : null}
      {objects.map((object, i) => (
        <InteractiveTarget
          key={object.iconId}
          object={object}
          index={i}
          onSelect={() => onSelect(object.iconId)}
        />
      ))}
    </div>
  );
}
