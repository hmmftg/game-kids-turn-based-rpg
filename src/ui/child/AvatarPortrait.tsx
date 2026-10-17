import type { AvatarId, HeadwearId } from '../../domain/game/types.ts';
import { AVATAR_VISUALS } from '../../world/models/modelProvider.ts';

/** Same palette the 3D figure's headwear layer uses (`cubic.tsx`). */
const HEADWEAR_COLORS: Record<Exclude<HeadwearId, 'none'>, string> = {
  scarf: '#c96f8d',
  chador: '#44465e',
  kolah: '#8a5a33',
  kufi: '#efe6d2',
  beanie: '#5b8ab5',
};

/**
 * The portrait's flat headwear, split by draw order: `behind` pieces render
 * before the face circle so the face masks their centre and only a cloth rim
 * survives (scarf/chador drape); `crown` pieces render over the hair (a band
 * finishing the wrap, or the kolah/kufi/beanie cap itself).
 */
function HeadwearLayer({
  id,
  part,
}: {
  readonly id: HeadwearId;
  readonly part: 'behind' | 'crown';
}) {
  if (id === 'none') return null;
  const color = HEADWEAR_COLORS[id];
  if (part === 'behind') {
    if (id === 'scarf') {
      return (
        <path
          d="M32 7c-10 0-17 7-17 16v17c0 4 2 7 5 7h24c3 0 5-3 5-7V23c0-9-7-16-17-16z"
          fill={color}
        />
      );
    }
    if (id === 'chador') {
      return (
        <path
          d="M32 6c-11 0-19 8-19 18v26c0 5 3 8 7 8h24c4 0 7-3 7-8V24c0-10-8-18-19-18z"
          fill={color}
        />
      );
    }
    return null;
  }
  switch (id) {
    case 'scarf':
      return <path d="M18 23a14 11 0 0 1 28 0v-5a14 10 0 0 0-28 0z" fill={color} />;
    case 'chador':
      return <path d="M17 23a15 12 0 0 1 30 0v-5a15 11 0 0 0-30 0z" fill={color} />;
    case 'kolah':
      return (
        <>
          <ellipse cx="32" cy="14" rx="15" ry="4" fill={color} />
          <path d="M21 14a11 9 0 0 1 22 0z" fill={color} />
        </>
      );
    case 'kufi':
      return <path d="M22 16a10 7 0 0 1 20 0v3h-20z" fill={color} />;
    case 'beanie':
      return (
        <>
          <circle cx="32" cy="7" r="3.5" fill="#e8eef4" />
          <path d="M20 17a12 10 0 0 1 24 0v3h-24z" fill={color} />
          <rect x="20" y="17" width="24" height="4" rx="2" fill="#e8eef4" />
        </>
      );
    default:
      return null;
  }
}

/**
 * Clearly-human avatar portrait for DOM surfaces (picker, profile cards,
 * headwear preview). Mirrors `AVATAR_VISUALS` — same hair silhouette +
 * outfit colour the 3D figure wears — so the child recognizes "their kid"
 * across screens. `headwear` composites the chosen covering onto the same
 * portrait, so the preview is the actual result. Pure SVG: offline,
 * deterministic, no emoji-font dependency.
 */
export function AvatarPortrait({
  avatarId,
  headwear = 'none',
  size = 72,
}: {
  readonly avatarId: AvatarId;
  readonly headwear?: HeadwearId | undefined;
  readonly size?: number;
}) {
  const visual = AVATAR_VISUALS[avatarId];
  const skin = visual.palette.head;
  const shirt = visual.palette.body;
  const hair = visual.hairColor;
  const covering = headwear === 'scarf' || headwear === 'chador';
  const cap = headwear === 'kolah' || headwear === 'kufi' || headwear === 'beanie';
  return (
    <svg
      className="avatar-portrait"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-hair={visual.hairStyle}
      data-headwear={headwear}
    >
      {/* shirt */}
      <path d="M14 60c1-12 8-18 18-18s17 6 18 18z" fill={shirt} />
      {/* coverings drape behind the head — the face masks their centre */}
      {covering ? <HeadwearLayer id={headwear} part="behind" /> : null}
      {/* neck + face */}
      <rect x="28" y="34" width="8" height="9" rx="3" fill={skin} />
      <circle cx="32" cy="26" r="14" fill={skin} />
      {/* hair per style */}
      {visual.hairStyle === 'pigtails' ? (
        <>
          <path d="M18 26a14 14 0 0 1 28 0v-4a14 10 0 0 0-28 0z" fill={hair} />
          <path d="M16 26c0-9 7-15 16-15s16 6 16 15l-4-2c0-7-5-10-12-10s-12 3-12 10z" fill={hair} />
          <rect x="12" y="26" width="8" height="16" rx="4" fill={hair} />
          <rect x="44" y="26" width="8" height="16" rx="4" fill={hair} />
        </>
      ) : null}
      {visual.hairStyle === 'short' ? (
        <path d="M18 27a14 14 0 0 1 28 0c0-9-6-16-14-16s-14 7-14 16z" fill={hair} />
      ) : null}
      {visual.hairStyle === 'curly' ? (
        <>
          <path d="M18 28a14 14 0 0 1 28 0c0-10-6-17-14-17s-14 7-14 17z" fill={hair} />
          <circle cx="19" cy="22" r="5" fill={hair} />
          <circle cx="45" cy="22" r="5" fill={hair} />
          <circle cx="32" cy="12" r="5" fill={hair} />
        </>
      ) : null}
      {visual.hairStyle === 'bun' ? (
        <>
          <path d="M18 27a14 14 0 0 1 28 0c0-9-6-15-14-15s-14 6-14 15z" fill={hair} />
          <circle cx="32" cy="9" r="5" fill={hair} />
        </>
      ) : null}
      {/* wrap band over the crown, or the cap itself */}
      {covering || cap ? <HeadwearLayer id={headwear} part="crown" /> : null}
      {/* face: eyes + smile */}
      <circle cx="26.5" cy="25" r="1.6" fill="#33303a" />
      <circle cx="37.5" cy="25" r="1.6" fill="#33303a" />
      <path
        d="M27 31a7 7 0 0 0 10 0"
        fill="none"
        stroke="#b06a5a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
