import type { IconId } from '../../domain/game/types.ts';
import { getIcon } from '../../content/fa/icons.ts';

/**
 * Action glyphs: concrete mini-scenes, not abstract symbols. Each glyph shows
 * the object that will move, the actor's hand, and a motion cue (arrow/arc)
 * toward the result — a pre-reader sees *what happens* without decoding a
 * symbolic metaphor or reading the label.
 *
 * `animate` (used by the demonstrate phase) applies a looping CSS keyframe to
 * the moving part — pure CSS, frozen under prefers-reduced-motion.
 */
export function ActionGlyph({
  iconId,
  size = 56,
  color,
  animate = false,
}: {
  readonly iconId: IconId;
  readonly size?: number;
  readonly color?: string | undefined;
  readonly animate?: boolean;
}) {
  const icon = getIcon(iconId);
  const cueClass = animate ? ` glyph--anim glyph--anim-${icon.animationCue}` : '';
  return (
    <svg
      className={`action-glyph${cueClass}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={color ? { color } : undefined}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon={iconId}
    >
      {color ? <circle cx="24" cy="24" r="23" fill={color} opacity={0.14} /> : null}
      {renderGlyph(iconId)}
    </svg>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/* Shared parts --------------------------------------------------------- */

const HAND = (
  <path
    d="M12 20a3 3 0 0 1 3-3v-4a3 3 0 0 1 6 0v-2a3 3 0 0 1 6 0v4a3 3 0 0 1 3 3v8a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z"
    {...stroke}
  />
);

const LEAF = <ellipse className="glyph-object" cx="30" cy="34" rx="5" ry="3" {...stroke} />;

const BASKET = (
  <g className="glyph-target">
    <path d="M14 28h20l-3 13H17z" {...stroke} />
    <path d="M19 28a5 5 0 0 1 10 0" {...stroke} />
  </g>
);

const GROUND = <path d="M8 40h32" {...stroke} />;

const FACE = (
  <>
    <circle cx="24" cy="24" r="15" {...stroke} />
    <circle cx="19" cy="21" r="1.6" fill="currentColor" />
    <circle cx="29" cy="21" r="1.6" fill="currentColor" />
  </>
);

const ARROW_UP = (
  <path className="glyph-cue" d="M38 30V14m-5 6l5-6 5 6" {...stroke} strokeDasharray="none" />
);
const ARROW_DOWN = <path className="glyph-cue" d="M32 8v10m-4-4l4 4 4-4" {...stroke} />;
const ARC = <path className="glyph-cue" d="M34 26q8-6 6-14" {...stroke} strokeDasharray="3 3" />;
const ARROW_ARC = <path className="glyph-cue" d="M40 14l-1.5 3M40 14l-3.5-.5" {...stroke} />;

/* Per-icon scenes ------------------------------------------------------- */

function renderGlyph(iconId: IconId) {
  switch (iconId) {
    case 'icon-pick-up':
      // hand reaches down to the object and lifts it up
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(2 -6)">{HAND}</g>
          </g>
          {LEAF}
          {GROUND}
          {ARROW_UP}
        </>
      );
    case 'icon-kick':
      // foot nudges the object along an arc
      return (
        <>
          <g className="glyph-hand">
            <path d="M14 34c-4-8-4-16 0-22s9-6 11 0-2 14-5 22z" {...stroke} />
          </g>
          {LEAF}
          {GROUND}
          {ARC}
          {ARROW_ARC}
        </>
      );
    case 'icon-help-carry':
      // two hands lifting the basket together
      return (
        <>
          <g className="glyph-hand">
            <path d="M10 36l6-8" {...stroke} />
            <path d="M38 36l-6-8" {...stroke} />
          </g>
          <g className="glyph-object">{BASKET}</g>
          <path className="glyph-cue" d="M24 18V8m-4 5l4-5 4 5" {...stroke} />
        </>
      );
    case 'icon-place-basket':
      // object descending into the basket
      return (
        <>
          {BASKET}
          <g className="glyph-object">
            <ellipse cx="24" cy="12" rx="4" ry="3" {...stroke} />
          </g>
          {ARROW_DOWN}
        </>
      );
    case 'icon-drop-basket':
      // basket tips, object spills beside it — the wrong outcome is shown
      return (
        <>
          <g transform="rotate(24 24 28)">
            <path d="M14 28h20l-3 13H17z" {...stroke} />
          </g>
          <ellipse className="glyph-object" cx="38" cy="38" rx="4" ry="3" {...stroke} />
          <path className="glyph-cue" d="M34 14q6 8 3 18" {...stroke} strokeDasharray="3 3" />
        </>
      );
    case 'icon-basket-bin':
      // hand carries the object into the basket
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(-6 -4) scale(0.8) translate(6 8)">{HAND}</g>
          </g>
          {BASKET}
          <path className="glyph-cue" d="M20 16q8-4 12 4" {...stroke} strokeDasharray="3 3" />
          <path className="glyph-cue" d="M33 22l-1 4M33 22l-4-1" {...stroke} />
        </>
      );
    case 'icon-leave-ground':
      // object stays on the ground
      return (
        <>
          {GROUND}
          <ellipse className="glyph-object" cx="24" cy="36" rx="6" ry="3.5" {...stroke} />
          <path className="glyph-cue" d="M24 12v10m-4-4l4 4 4-4" {...stroke} />
        </>
      );
    case 'icon-pick-kite':
      // hand lifts the fallen kite
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(2 -6)">{HAND}</g>
          </g>
          <path className="glyph-object" d="M30 24l6 6-6 8-6-8z" {...stroke} />
          {GROUND}
          {ARROW_UP}
        </>
      );
    case 'icon-give-kite':
      // the kite goes to the friend
      return (
        <>
          {FACE}
          <g className="glyph-object">
            <path d="M10 34l5 5-5 6-5-6z" {...stroke} />
          </g>
          <path className="glyph-cue" d="M14 26q10-2 18 6" {...stroke} strokeDasharray="3 3" />
        </>
      );
    case 'icon-spot-fish':
      // eye watching the fish in the river
      return (
        <>
          <path d="M8 18s6-8 16-8 16 8 16 8-6 8-16 8-16-8-16-8z" {...stroke} />
          <circle cx="24" cy="18" r="4" {...stroke} />
          <path className="glyph-object" d="M16 36q4-4 9-4t8 4q-3.5 4-8 4t-9-4z" {...stroke} />
        </>
      );
    case 'icon-collect-shell':
      // hand picks the shell off the bank
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(2 -6)">{HAND}</g>
          </g>
          <path className="glyph-object" d="M25 36a5 5 0 0 1 10 0z" {...stroke} />
          {GROUND}
          {ARROW_UP}
        </>
      );
    case 'icon-give-shell':
      // the shell lands in the basket
      return (
        <>
          {BASKET}
          <g className="glyph-object">
            <path d="M19 16a5 5 0 0 1 10 0z" {...stroke} />
          </g>
          {ARROW_DOWN}
        </>
      );
    case 'icon-take-bread':
      // hand lifts the warm loaf
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(2 -6)">{HAND}</g>
          </g>
          <ellipse className="glyph-object" cx="30" cy="34" rx="7" ry="4" {...stroke} />
          {GROUND}
          {ARROW_UP}
        </>
      );
    case 'icon-place-bread':
      // the loaf goes down onto the shelf
      return (
        <>
          <path d="M12 34h24" {...stroke} strokeWidth={4.4} />
          <path d="M16 34v7M32 34v7" {...stroke} />
          <g className="glyph-object">
            <ellipse cx="24" cy="24" rx="7" ry="4" {...stroke} />
          </g>
          {ARROW_DOWN}
        </>
      );
    case 'icon-tap-book':
      // the finger taps the picture card
      return (
        <>
          <path d="M12 14q6-2 12 0v18q-6-2-12 0z" {...stroke} />
          <path d="M36 14q-6-2-12 0v18q6-2 12 0z" {...stroke} />
          <path className="glyph-cue" d="M38 30l6-5-1 8" {...stroke} />
        </>
      );
    case 'icon-tap-ball':
      // the finger taps the ball
      return (
        <>
          <circle cx="22" cy="26" r="10" {...stroke} />
          <path d="M12 26h20M22 16v20" {...stroke} opacity={0.6} />
          <path className="glyph-cue" d="M38 20l6-4-1 8" {...stroke} />
        </>
      );
    case 'icon-find-crystal':
      // hand picks the glowing crystal
      return (
        <>
          <g className="glyph-hand">
            <g transform="translate(2 -6)">{HAND}</g>
          </g>
          <path className="glyph-object" d="M27 36l-2-10 3-5 2 5zM33 36l1-7 3-3 1 4z" {...stroke} />
          {GROUND}
          {ARROW_UP}
        </>
      );
    case 'icon-give-crystal':
      // the crystal goes to the little mouse
      return (
        <>
          <g className="glyph-object">
            <path d="M8 34l-1-7 2-3 1 3zM12 34l1-5 2-2 1 3z" {...stroke} />
          </g>
          <path d="M28 22a4 4 0 1 1 8 0M38 22a4 4 0 1 0-8 0" {...stroke} />
          <ellipse cx="34" cy="30" rx="6" ry="5" {...stroke} />
          <path className="glyph-cue" d="M16 30q8-3 12 0" {...stroke} strokeDasharray="3 3" />
        </>
      );
    case 'icon-greet':
      // face with a raised waving hand
      return (
        <>
          {FACE}
          <path d="M28 31a5 5 0 0 0 10 0" {...stroke} />
          <g className="glyph-hand">
            <path d="M38 12v-6M42 13v-7M46 14v-6" {...stroke} />
          </g>
        </>
      );
    case 'icon-smile':
      return (
        <>
          {FACE}
          <path d="M16 29a9 9 0 0 0 16 0" {...stroke} />
        </>
      );
    case 'icon-wave-away':
      // turned away: face with a sideways exit arrow
      return (
        <>
          {FACE}
          <path className="glyph-cue" d="M40 36l6-6-6-6M46 30h-8" {...stroke} />
        </>
      );
    case 'icon-watch':
      // eye looking at the object
      return (
        <>
          <path d="M8 22s6-8 16-8 16 8 16 8-6 8-16 8-16-8-16-8z" {...stroke} />
          <circle cx="24" cy="22" r="4" {...stroke} />
          <ellipse className="glyph-object" cx="24" cy="40" rx="5" ry="3" {...stroke} />
        </>
      );
    case 'icon-wash-hands':
      // two hands under falling drops
      return (
        <>
          <g className="glyph-hand">
            <path d="M10 30q6-6 12 0M26 30q6-6 12 0" {...stroke} />
            <path d="M14 36q10 8 20 0" {...stroke} />
          </g>
          <g className="glyph-object">
            <path d="M20 8q3 5 0 8M28 8q3 5 0 8M24 14q3 5 0 8" {...stroke} />
          </g>
        </>
      );
    case 'icon-turn-back':
      // the kid walking back to the neighbourhood — figure + return arrow
      return (
        <>
          <circle cx="34" cy="12" r="5" {...stroke} />
          <path d="M30 40c0-8 2-12 4-16" {...stroke} />
          {GROUND}
          <path className="glyph-cue" d="M30 20H12m6-5l-6 5 6 5" {...stroke} />
        </>
      );
    case 'icon-skip':
      // moving on: kid figure + forward arrow
      return (
        <>
          <circle cx="14" cy="12" r="5" {...stroke} />
          <path d="M18 40c0-8-2-12-4-16" {...stroke} />
          {GROUND}
          <path className="glyph-cue" d="M18 20h18m-6-5l6 5-6 5" {...stroke} />
        </>
      );
    default:
      return <circle cx="24" cy="24" r="16" {...stroke} />;
  }
}
