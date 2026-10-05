import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { IconId } from '../../domain/game/types.ts';
import { getIcon } from '../../content/fa/icons.ts';
import { prefersReducedMotion } from '../../services/device/capabilities.ts';
import { recordEpisode, type EpisodeStep } from '../../services/animationEvents.ts';
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
  | 'cushion'
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

const OBJ_INK = 'rgba(52, 42, 28, 0.75)';

/**
 * ObjectGlyph — ONE canonical filled silhouette per physical object, centered
 * near (0,0), placed by the caller's <g transform="translate() scale()">.
 * The thing a child taps in the choice strip is pixel-for-pixel the thing
 * that flies in the consequence scene and rests in the held marker: object
 * identity is carried by the shape+colour, never by the words.
 * Detail lines use OBJ_INK; fills are the object's intrinsic colour.
 * (48-box callers: translate(x,y) scale(s), s≈1 ≈24px wide.)
 */
export function ObjectGlyph({ element }: { readonly element: SceneElement }) {
  switch (element) {
    case 'leaf':
      return (
        <g data-shape="leaf">
          <path
            d="M0 -8 C6 -7 9 1 3 8 C-2 5 -6 -2 0 -8 Z"
            fill="#5ca34a"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
          <path d="M0 -5 Q1 0 0 6" fill="none" stroke="#3c7a33" strokeWidth={1.4} />
        </g>
      );
    case 'basket':
      return (
        <g data-shape="basket">
          <path d="M-8 -1 L8 -1 L6 8 L-6 8 Z" fill="#b9874d" stroke={OBJ_INK} strokeWidth={0.8} />
          <path d="M-5 -1 a5 5 0 0 1 10 0" fill="none" stroke="#8a5c2e" strokeWidth={1.8} />
          <path
            d="M-6.8 2.5 h13.6 M-6.2 5.5 h12.4"
            fill="none"
            stroke="#8a5c2e"
            strokeWidth={0.9}
            opacity={0.8}
          />
        </g>
      );
    case 'kite':
      return (
        <g data-shape="kite">
          <path d="M0 -9 L7 0 L0 9 L-7 0 Z" fill="#f0b73e" stroke={OBJ_INK} strokeWidth={0.8} />
          <path
            d="M0 -9 V9 M-7 0 H7"
            fill="none"
            stroke={OBJ_INK}
            strokeWidth={0.8}
            opacity={0.5}
          />
          <path d="M0 9 Q2 12 0 14 Q-2 16 -3 18" fill="none" stroke="#d88f2e" strokeWidth={1.8} />
        </g>
      );
    case 'shell':
      return (
        <g data-shape="shell">
          <path d="M-9 5 A10 10 0 0 1 9 5 Z" fill="#f2a989" stroke={OBJ_INK} strokeWidth={0.8} />
          <path
            d="M-5 5 L-3 -4 M0 5 V-6 M5 5 L3 -4"
            fill="none"
            stroke="#cf7f64"
            strokeWidth={1.3}
          />
        </g>
      );
    case 'bread':
      return (
        <g data-shape="bread">
          <ellipse
            cx="0"
            cy="1"
            rx="9"
            ry="5.5"
            fill="#d99a4e"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
          <path
            d="M-4 -1 Q-2 -3 0 -1 M2 -2 Q4 -4 6 -2"
            fill="none"
            stroke="#a5702e"
            strokeWidth={1.4}
          />
        </g>
      );
    case 'crystal':
      return (
        <g data-shape="crystal">
          <path
            d="M-4 6 L-6 -6 L-2 -10 L0 -6 Z"
            fill="#9a7bd0"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
          <path d="M1 6 L2 -4 L6 -8 L7 -3 Z" fill="#b79fe0" stroke={OBJ_INK} strokeWidth={0.8} />
        </g>
      );
    case 'water':
      return (
        <g data-shape="water">
          <path
            d="M0 -9 C4 -3 6 0 6 4 A6 6 0 1 1 -6 4 C-6 0 -4 -3 0 -9 Z"
            fill="#5aa9de"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
        </g>
      );
    case 'fish':
      return (
        <g data-shape="fish">
          <ellipse cx="-1" cy="0" rx="9" ry="5" fill="#5ba7c9" stroke={OBJ_INK} strokeWidth={0.8} />
          <path d="M8 0 l5 -4 v8 Z" fill="#4a93b5" stroke={OBJ_INK} strokeWidth={0.8} />
          <circle cx="-4" cy="-1" r="1.2" fill="#ffffff" />
          <circle cx="-4" cy="-1" r="0.6" fill={OBJ_INK} />
        </g>
      );
    case 'ball':
      return (
        <g data-shape="ball">
          <circle cx="0" cy="0" r="8" fill="#e2593f" stroke={OBJ_INK} strokeWidth={0.8} />
          <path
            d="M-7.5 -2 Q0 4 7.5 -2 M-7.5 2 Q0 -3 7.5 2"
            fill="none"
            stroke="#f2e2c8"
            strokeWidth={1.3}
          />
        </g>
      );
    case 'book':
      return (
        <g data-shape="book">
          <path
            d="M-10 -6 Q-5 -8 0 -6 V9 Q-5 7 -10 9 Z"
            fill="#f4ead3"
            stroke={OBJ_INK}
            strokeWidth={0.9}
          />
          <path
            d="M10 -6 Q5 -8 0 -6 V9 Q5 7 10 9 Z"
            fill="#f4ead3"
            stroke={OBJ_INK}
            strokeWidth={0.9}
          />
          <path d="M0 -6 V9" fill="none" stroke={OBJ_INK} strokeWidth={1} />
        </g>
      );
    case 'cushion':
      return (
        <g data-shape="cushion">
          <rect
            x="-10"
            y="-7"
            width="20"
            height="14"
            rx="5"
            fill="#e28da0"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
          <circle cx="-4" cy="0" r="1" fill={OBJ_INK} opacity={0.4} />
          <circle cx="4" cy="0" r="1" fill={OBJ_INK} opacity={0.4} />
        </g>
      );
    case 'mouse':
      return (
        <g data-shape="mouse">
          <ellipse
            cx="0"
            cy="1"
            rx="8"
            ry="6.5"
            fill="#a98a6b"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
          <circle cx="-4.5" cy="-5" r="3.4" fill="#a98a6b" stroke={OBJ_INK} strokeWidth={0.8} />
          <circle cx="4.5" cy="-5" r="3.4" fill="#a98a6b" stroke={OBJ_INK} strokeWidth={0.8} />
          <circle cx="-4.5" cy="-5" r="1.6" fill="#e8b8c0" />
          <circle cx="4.5" cy="-5" r="1.6" fill="#e8b8c0" />
          <path d="M8 4 Q14 5 12 10" fill="none" stroke="#a98a6b" strokeWidth={2} />
          <circle cx="-2" cy="0" r="1" fill={OBJ_INK} />
          <circle cx="2" cy="0" r="1" fill={OBJ_INK} />
          <path d="M0 2.5 L-1.4 4.5 H1.4 Z" fill={OBJ_INK} />
        </g>
      );
    case 'person':
      // head + torso; the torso stays icon-tinted so the actor keeps the
      // encounter's colour; skin is intrinsic.
      return (
        <g data-shape="person">
          <circle cx="0" cy="-8" r="6" fill="#f2c194" stroke={OBJ_INK} strokeWidth={0.8} />
          <path
            d="M-7 10 C-7 0 -4 -2 0 -2 C4 -2 7 0 7 10 Z"
            fill="currentColor"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
        </g>
      );
    case 'face':
      return (
        <g data-shape="face">
          <circle cx="0" cy="0" r="12" fill="#f2c194" stroke={OBJ_INK} strokeWidth={0.8} />
          <circle cx="-4.5" cy="-2" r="1.5" fill={OBJ_INK} />
          <circle cx="4.5" cy="-2" r="1.5" fill={OBJ_INK} />
          <path d="M-5 4 A6 6 0 0 0 5 4" fill="none" stroke={OBJ_INK} strokeWidth={1.4} />
        </g>
      );
    case 'person-away':
      return (
        <g data-shape="person-away">
          <circle cx="0" cy="-8" r="6" fill="#f2c194" stroke={OBJ_INK} strokeWidth={0.8} />
          <path d="M-5.6 -9.5 A6 6 0 0 1 5.6 -9.5 L5.6 -7 A6 6 0 0 0 -5.6 -7 Z" fill="#4a3b30" />
          <path
            d="M-7 10 C-7 0 -4 -2 0 -2 C4 -2 7 0 7 10 Z"
            fill="currentColor"
            stroke={OBJ_INK}
            strokeWidth={0.8}
          />
        </g>
      );
    case 'bin':
      return (
        <g data-shape="bin">
          <path d="M-8 -2 L8 -2 L6 8 L-6 8 Z" fill="#8a94a0" stroke={OBJ_INK} strokeWidth={0.8} />
          <path d="M-9 -2 h18" fill="none" stroke="#6a747f" strokeWidth={2.6} />
        </g>
      );
    // Places and directional verbs stay line-art — the child taps the
    // object; the place is the backdrop, not the actor.
    default:
      return null;
  }
}

function renderElement(element: SceneElement) {
  // Objects render through the canonical filled silhouette (ObjectGlyph) —
  // the thing here is pixel-for-pixel the thing that flies in the
  // consequence; places and paths stay line-art.
  switch (element) {
    case 'person':
      // the neighbour — tap the person to greet/watch them
      return (
        <>
          <g transform="translate(24 20) scale(1.35)">
            <ObjectGlyph element="person" />
          </g>
          <path d="M33 22l6-8M35 26l8-6" {...stroke} />
          {GROUND_LINE}
        </>
      );
    case 'face':
      return (
        <g transform="translate(24 22) scale(1.15)">
          <ObjectGlyph element="face" />
        </g>
      );
    case 'person-away':
      return (
        <>
          <g transform="translate(24 20) scale(1.35)">
            <ObjectGlyph element="person-away" />
          </g>
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
          <g transform="translate(24 30) scale(1.3)">
            <ObjectGlyph element="basket" />
          </g>
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
          <g transform="translate(24 36) scale(0.9)">
            <ObjectGlyph element="leaf" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'bin':
      return (
        <>
          <g transform="translate(24 30) scale(1.3)">
            <ObjectGlyph element="bin" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'water':
      return (
        <>
          <path d="M10 30q7-6 14-2t14 0" {...stroke} />
          <g transform="translate(18 14) scale(0.75)">
            <ObjectGlyph element="water" />
          </g>
          <g transform="translate(30 14) scale(0.75)">
            <ObjectGlyph element="water" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'kite':
      // a fallen kite — diamond body, little tail
      return (
        <>
          <g transform="translate(24 20) scale(1.1)">
            <ObjectGlyph element="kite" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'fish':
      // a little fish in the water
      return (
        <>
          <g transform="translate(24 25) scale(1.1)">
            <ObjectGlyph element="fish" />
          </g>
          <path d="M10 40q7-4 14-1t14 0" {...stroke} opacity={0.5} />
        </>
      );
    case 'shell':
      // a scallop shell on the bank
      return (
        <>
          <g transform="translate(24 34) scale(1.1)">
            <ObjectGlyph element="shell" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'bread':
      // a warm loaf
      return (
        <>
          <g transform="translate(24 30) scale(1.15)">
            <ObjectGlyph element="bread" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'book':
      // an open picture card
      return (
        <g transform="translate(24 27) scale(1.2)">
          <ObjectGlyph element="book" />
        </g>
      );
    case 'ball':
      return (
        <>
          <g transform="translate(24 30) scale(1.2)">
            <ObjectGlyph element="ball" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'cushion':
      // the soft cushion — a rounded pillow the child holds up in play
      return (
        <>
          <g transform="translate(24 28) scale(1.2)">
            <ObjectGlyph element="cushion" />
          </g>
          {GROUND_LINE}
        </>
      );
    case 'crystal':
      // a small glowing crystal cluster
      return (
        <>
          <g transform="translate(24 28) scale(1.2)">
            <ObjectGlyph element="crystal" />
          </g>
          <path d="M14 38h20" {...stroke} opacity={0.35} />
        </>
      );
    case 'mouse':
      // the little cave mouse — round ears, pointy nose, tail
      return (
        <g transform="translate(24 26) scale(1.3)">
          <ObjectGlyph element="mouse" />
        </g>
      );
  }
}

/** Small glyph carried in the hand marker — the SAME ObjectGlyph the child
 *  tapped, scaled into the hand. */
function heldShape(item: HeldItem) {
  return (
    <g transform="translate(33 12) scale(0.62)">
      <ObjectGlyph element={item} />
    </g>
  );
}

function HeldMarker({ item, plain }: { readonly item: HeldItem; readonly plain?: boolean }) {
  // `plain` (Mode noactionicons): the held object alone — the hand outline
  // is an illustrative badge, and the mode strips every non-physical
  // affordance while keeping physical state indicators.
  return (
    <span className="scene-held" aria-hidden="true" data-held={item}>
      <svg width="44" height="44" viewBox="0 0 48 48" focusable="false" role="presentation">
        {plain ? null : (
          <path
            d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
            {...stroke}
          />
        )}
        {heldShape(item)}
      </svg>
    </span>
  );
}

/**
 * The semantic episode a correct choice plays, in the vocabulary contract:
 * each step is a physical verb event with deterministic timing. Emitted to
 * `window.__worldAnimationEvents` (dev/probe only) so e2e asserts the
 * consequence, not CSS classes.
 */
/** The physical subject each icon acts on — for the episode log. */
function consequenceSubject(iconId: IconId): string {
  switch (iconId) {
    case 'icon-pick-up':
      return 'leaf';
    case 'icon-help-carry':
    case 'icon-place-basket':
      return 'basket';
    case 'icon-pick-kite':
    case 'icon-give-kite':
      return 'kite';
    case 'icon-collect-shell':
    case 'icon-give-shell':
      return 'shell';
    case 'icon-take-bread':
    case 'icon-place-bread':
      return 'bread';
    case 'icon-basket-bin':
      return 'bin';
    case 'icon-find-crystal':
    case 'icon-give-crystal':
      return 'crystal';
    default:
      return iconId;
  }
}

function consequenceEpisode(iconId: IconId): readonly EpisodeStep[] {
  const subject = consequenceSubject(iconId);
  switch (iconId) {
    case 'icon-pick-up':
    case 'icon-help-carry':
    case 'icon-pick-kite':
    case 'icon-collect-shell':
    case 'icon-take-bread':
      // ObjectLift → ObjectFlyTo(hand) → held
      return [
        { type: 'object-lift', subjectId: subject, duration: 250 },
        { type: 'object-fly-to', subjectId: subject, actorId: 'player', at: 250, duration: 400 },
      ];
    case 'icon-find-crystal':
      return [
        { type: 'object-uncover', subjectId: 'crystal', duration: 300 },
        { type: 'object-fly-to', subjectId: 'crystal', actorId: 'player', at: 300, duration: 350 },
      ];
    case 'icon-give-kite':
      return [
        { type: 'object-fly-to', subjectId: 'kite', actorId: 'npc-child-sara', duration: 500 },
        {
          type: 'character-react',
          subjectId: 'npc-child-sara',
          context: 'receives-kite',
          at: 350,
          duration: 400,
        },
      ];
    case 'icon-give-shell':
      return [
        { type: 'object-fly-to', subjectId: 'shell', actorId: 'basket', duration: 500 },
        { type: 'object-receive', subjectId: 'basket', at: 450, duration: 300 },
      ];
    case 'icon-give-crystal':
      return [
        { type: 'object-fly-to', subjectId: 'crystal', actorId: 'npc-cave-mouse', duration: 500 },
        {
          type: 'character-react',
          subjectId: 'npc-cave-mouse',
          context: 'receives-crystal',
          at: 350,
          duration: 400,
        },
      ];
    case 'icon-place-basket':
    case 'icon-place-bread':
    case 'icon-basket-bin':
      return [
        { type: 'object-fly-to', subjectId: subject, duration: 500 },
        { type: 'object-receive', subjectId: subject, at: 450, duration: 300 },
      ];
    case 'icon-tap-book':
      return [
        { type: 'object-open', subjectId: 'book', duration: 450 },
        {
          type: 'character-react',
          subjectId: 'npc-teacher',
          context: 'looks-at-book',
          at: 200,
          duration: 400,
        },
      ];
    case 'icon-tap-ball':
    case 'icon-play':
      return [
        { type: 'object-bounce', subjectId: 'ball', duration: 550 },
        {
          type: 'character-react',
          subjectId: 'npc-teacher',
          context: 'celebrates',
          at: 300,
          duration: 400,
        },
      ];
    case 'icon-spot-fish':
      return [{ type: 'object-bounce', subjectId: 'fish', duration: 550 }];
    case 'icon-wash-hands':
      return [{ type: 'object-drop', subjectId: 'water', duration: 500 }];
    case 'icon-greet':
      return [
        { type: 'character-react', subjectId: 'person', context: 'greets-child', duration: 700 },
      ];
    case 'icon-smile':
    case 'icon-watch':
    default:
      return [
        { type: 'character-react', subjectId: 'person', context: 'celebrates', duration: 500 },
      ];
  }
}

/** The truthful result of a correct choice, drawn after CHOOSE resolves:
 *  the picked thing lifts and flies into the hand, the given thing travels
 *  to the person and the person receives it, the asked thing opens/bounces
 *  while the teacher reacts. One-shot CSS motion; the state change is
 *  perceivable statically under reduced motion. */
export function ConsequenceScene({
  iconId,
  settled = false,
}: {
  readonly iconId: IconId;
  /** The episode's static end-state, no motion: the object rests at its
   *  destination — the persistent "after" of the state change (reinforce
   *  beat and reduced-motion render the same picture). */
  readonly settled?: boolean | undefined;
}) {
  const icon = getIcon(iconId);
  useEffect(() => {
    if (!settled) recordEpisode(consequenceEpisode(iconId));
  }, [iconId, settled]);
  return (
    <svg
      className={`scene-consequence${settled ? ' scene-consequence--settled' : ''}`}
      width="104"
      height="104"
      viewBox="0 0 48 48"
      role="img"
      aria-label={icon.labelFa}
      style={{ color: icon.color }}
      data-consequence={iconId}
    >
      {consequenceScene(iconId)}
    </svg>
  );
}

/** A wrong pick: the object never moved, so nothing returns — the only
 *  consequence is the person questioning (look at object, back at the
 *  child, slight head tilt). No success animation, no shake. */
export function QuestioningReact({ actorId }: { readonly actorId?: string | undefined }) {
  useEffect(() => {
    recordEpisode([
      {
        type: 'character-react',
        subjectId: actorId ?? 'npc-teacher',
        context: 'questioning',
        duration: 900,
      },
    ]);
  }, [actorId]);
  return (
    <svg
      className="scene-questioning"
      width="104"
      height="104"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-reaction="questioning"
    >
      <g className="scene-exec-question">
        <g transform="translate(24 24) scale(1.3)">
          <ObjectGlyph element="person" />
        </g>
      </g>
      {GROUND_LINE}
    </svg>
  );
}

const HAND_SHAPE = (
  <path
    d="M16 30a3 3 0 0 1 3-3v-3a3 3 0 0 1 6 0v-1a3 3 0 0 1 6 0v3a3 3 0 0 1 3 3v6a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"
    fill="#f2c194"
    stroke={OBJ_INK}
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

function consequenceScene(iconId: IconId) {
  // Every consequence reuses the SAME ObjectGlyph the child tapped — a filled,
  // recognisable object at the same silhouette — so "the leaf I touched" is
  // visibly "the leaf that flew into the hand", not an abstract ellipse.
  const obj = (
    element: SceneElement,
    x: number,
    y: number,
    scale = 1,
    cls = 'scene-exec-fly-give',
  ) => (
    <g className={cls}>
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <ObjectGlyph element={element} />
      </g>
    </g>
  );
  const heldBy = (element: SceneElement, x = 33, y = 11, scale = 0.85) =>
    obj(element, x, y, scale, 'scene-exec-fly-arc');
  switch (iconId) {
    case 'icon-pick-up':
      // ObjectLift → ObjectFlyTo: the LEAF lifts off the ground and arcs
      // into the hand — continuous motion, ends in the held state.
      return (
        <>
          {HAND_SHAPE}
          {heldBy('leaf', 33, 12, 0.8)}
        </>
      );
    case 'icon-help-carry':
      return (
        <>
          {HAND_SHAPE}
          {heldBy('basket', 33, 10, 0.95)}
        </>
      );
    case 'icon-pick-kite':
      return (
        <>
          {HAND_SHAPE}
          {heldBy('kite', 33, 10, 0.9)}
        </>
      );
    case 'icon-collect-shell':
      return (
        <>
          {HAND_SHAPE}
          {heldBy('shell', 33, 12, 0.8)}
        </>
      );
    case 'icon-take-bread':
      return (
        <>
          {HAND_SHAPE}
          {heldBy('bread', 33, 11, 0.85)}
        </>
      );
    case 'icon-give-kite':
      // ObjectFlyTo → CharacterReact(receives-kite): the kite travels to
      // Sara and she receives it.
      return (
        <>
          <g className="scene-exec-receive">
            <g transform="translate(31 27)">
              <ObjectGlyph element="person" />
            </g>
          </g>
          {obj('kite', 18, 26, 1)}
          {GROUND_LINE}
        </>
      );
    case 'icon-spot-fish':
      // the fish leaps from the river
      return (
        <>
          <path d="M8 38q8-5 16-1t16 0" {...stroke} opacity={0.5} />
          <g className="scene-exec-bounce">
            <g transform="translate(24 21) scale(1.15)">
              <ObjectGlyph element="fish" />
            </g>
          </g>
        </>
      );
    case 'icon-give-shell':
      // ObjectFlyTo → ObjectReceive: the shell travels into the basket and
      // the basket gives one small receiving bounce.
      return (
        <>
          <g className="scene-exec-receive">
            <g transform="translate(24 32) scale(1.1)">
              <ObjectGlyph element="basket" />
            </g>
          </g>
          {obj('shell', 24, 19, 0.85)}
        </>
      );
    case 'icon-place-bread':
      // ObjectFlyTo → ObjectReceive: the loaf travels onto the shelf.
      return (
        <>
          <g className="scene-exec-receive">
            <path d="M12 30h24" {...stroke} strokeWidth={4.4} />
            <path d="M16 30v10M32 30v10" {...stroke} />
          </g>
          {obj('bread', 24, 20, 1)}
        </>
      );
    case 'icon-tap-book':
      // ObjectOpen + CharacterReact(looks-at-book): the book's page opens
      // while the teacher turns to look at it — no answer glow.
      return (
        <>
          <g className="scene-exec-look">
            <g transform="translate(38 12) scale(0.75)">
              <ObjectGlyph element="face" />
            </g>
          </g>
          <g className="scene-exec-open">
            <g transform="translate(22 28)">
              <ObjectGlyph element="book" />
            </g>
          </g>
        </>
      );
    case 'icon-tap-ball':
    case 'icon-play':
      // ObjectBounce + CharacterReact(celebrates): the ball bounces once
      // while the teacher reacts — no answer glow.
      return (
        <>
          <g className="scene-exec-look">
            <g transform="translate(38 12) scale(0.75)">
              <ObjectGlyph element="face" />
            </g>
          </g>
          <g className="scene-exec-bounce">
            <g transform="translate(24 28) scale(1.2)">
              <ObjectGlyph element="ball" />
            </g>
          </g>
          {GROUND_LINE}
        </>
      );
    case 'icon-find-crystal':
      // ObjectUncover → ObjectFlyTo: the crystal rises out of its cluster
      // and arcs into the hand.
      return (
        <>
          {HAND_SHAPE}
          <g className="scene-exec-fly-arc">
            <g className="scene-exec-uncover">
              <g transform="translate(32 12) scale(0.9)">
                <ObjectGlyph element="crystal" />
              </g>
            </g>
          </g>
        </>
      );
    case 'icon-give-crystal':
      // ObjectFlyTo → CharacterReact(receives-crystal): the crystal travels
      // to the mouse and the mouse receives it.
      return (
        <>
          <g className="scene-exec-receive">
            <g transform="translate(24 26)">
              <ObjectGlyph element="mouse" />
            </g>
          </g>
          {obj('crystal', 24, 17, 0.8)}
        </>
      );
    case 'icon-place-basket':
      // ObjectFlyTo → ObjectReceive: the basket travels onto the shelf.
      return (
        <>
          <g className="scene-exec-receive">
            <path d="M12 30h24" {...stroke} strokeWidth={4.4} />
            <path d="M16 30v10M32 30v10" {...stroke} />
          </g>
          {obj('basket', 24, 20, 1)}
        </>
      );
    case 'icon-basket-bin':
      // ObjectFlyTo → ObjectReceive: the leaf travels into the bin.
      return (
        <>
          <g className="scene-exec-receive">
            <g transform="translate(24 32) scale(1.05)">
              <ObjectGlyph element="bin" />
            </g>
          </g>
          {obj('leaf', 24, 18, 0.85)}
        </>
      );
    case 'icon-wash-hands':
      // water drops fall into the water — teardrops, not wiggle lines
      return (
        <>
          <path d="M10 28q7-6 14-2t14 0" {...stroke} />
          <g className="scene-exec-drop">
            <g transform="translate(19 14) scale(0.7)">
              <ObjectGlyph element="water" />
            </g>
          </g>
          <g className="scene-exec-drop" style={{ animationDelay: '0.12s' }}>
            <g transform="translate(29 12) scale(0.7)">
              <ObjectGlyph element="water" />
            </g>
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
          <g transform="translate(24 20) scale(1.35)">
            <ObjectGlyph element="person" />
          </g>
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
  bare = false,
  onSelect,
}: {
  readonly object: SceneObject;
  readonly index: number;
  /** Mode noactionicons: no button disc/ring — the physical element itself
   *  is the whole affordance. */
  readonly bare?: boolean;
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
        {bare ? null : (
          <>
            <circle cx="24" cy="24" r="22" fill="currentColor" opacity={0.14} />
            <circle
              className="scene-target__ring"
              cx="24"
              cy="24"
              r="21"
              {...stroke}
              opacity={0.55}
            />
          </>
        )}
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
  plainHeld = false,
  bareTargets = false,
  onSelect,
}: {
  readonly objects: readonly SceneObject[];
  readonly held?: HeldItem | undefined;
  /** Mode noactionicons: held object drawn without the hand badge. */
  readonly plainHeld?: boolean;
  /** Mode noactionicons: physical elements only — no button disc/ring. */
  readonly bareTargets?: boolean;
  readonly onSelect: (iconId: IconId) => void;
}) {
  if (objects.length === 0) return null;
  return (
    <div className="scene-strip" dir="rtl" data-testid="scene-choice">
      {held ? <HeldMarker item={held} plain={plainHeld} /> : null}
      {objects.map((object, i) => (
        <InteractiveTarget
          key={object.iconId}
          object={object}
          index={i}
          bare={bareTargets}
          onSelect={() => onSelect(object.iconId)}
        />
      ))}
    </div>
  );
}

/**
 * DemoScene — the demonstrate beat, spoken in the same physical verbs as the
 * consequence scenes. Each `demonstrationCue` maps to one physical motion:
 * the object lifts, flies to a destination, opens, or the person reacts.
 * One-shot motion (repeats twice at most), never the old generic bob.
 */
export function DemoScene({
  cue,
  element,
  color,
}: {
  readonly cue: string;
  readonly element: SceneElement;
  readonly color?: string | undefined;
}) {
  const glyph = (cls: string) => <g className={cls}>{renderElement(element)}</g>;
  const scene = (() => {
    switch (cue) {
      case 'pick-up-object':
      case 'lift-basket':
        // the thing lifts toward the hand
        return (
          <>
            {HAND_SHAPE}
            {glyph('scene-exec-fly-arc')}
          </>
        );
      case 'give-object':
        // the thing travels to the person
        return (
          <>
            <g className="scene-exec-receive">
              <g transform="translate(24 26) scale(1.3)">
                <ObjectGlyph element="person" />
              </g>
            </g>
            {glyph('scene-exec-fly-give')}
          </>
        );
      case 'place-basket':
      case 'place-in-basket':
        // the thing travels into its container
        return (
          <>
            <g className="scene-exec-receive">
              <g transform="translate(24 30) scale(1.15)">
                <ObjectGlyph element="basket" />
              </g>
            </g>
            {glyph('scene-exec-fly-give')}
          </>
        );
      case 'point-card':
        return glyph('scene-exec-open');
      case 'point-crystal':
        return glyph('scene-exec-uncover');
      case 'watch-fish':
        return glyph('scene-exec-bounce');
      case 'wash-hands':
        return glyph('scene-exec-drop');
      case 'point-mouse':
        return glyph('scene-exec-receive');
      case 'wave-and-greet':
      case 'smile-back':
      default:
        // the person reacts — the wave marks are the gesture
        return (
          <>
            {glyph('scene-exec-pop')}
            <g className="scene-exec-pop">
              <path d="M38 16l4-6M40 20l6-4" {...stroke} />
            </g>
          </>
        );
    }
  })();
  return (
    <svg
      className="demo"
      width="56"
      height="56"
      viewBox="0 0 48 48"
      style={{ color }}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-cue={cue}
    >
      {scene}
    </svg>
  );
}
