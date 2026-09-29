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
  | 'water';

/** The object a step implies the child is already holding (displayed at the
 *  hand marker on the strip's start edge). Keyed by the *correct* icon. */
export const HELD_ITEM: Partial<Record<IconId, 'leaf' | 'basket'>> = {
  'icon-place-basket': 'basket',
  'icon-drop-basket': 'basket',
  'icon-basket-bin': 'leaf',
  'icon-leave-ground': 'leaf',
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
            ) : (
              <path d="M28 8h10l-1.5 8h-7z" {...stroke} />
            )}
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

export function SceneChoice({
  objects,
  held,
  onSelect,
}: {
  readonly objects: readonly SceneObject[];
  readonly held?: 'leaf' | 'basket' | undefined;
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
