import type { AvatarId } from '../../domain/game/types.ts';
import { AVATAR_VISUALS } from '../../world/models/modelProvider.ts';

/**
 * Clearly-human avatar portrait for DOM surfaces (picker, profile cards,
 * headwear preview). Mirrors `AVATAR_VISUALS` — same hair silhouette +
 * outfit colour the 3D figure wears — so the child recognizes "their kid"
 * across screens. Pure SVG: offline, deterministic, no emoji-font dependency.
 */
export function AvatarPortrait({
  avatarId,
  size = 72,
}: {
  readonly avatarId: AvatarId;
  readonly size?: number;
}) {
  const visual = AVATAR_VISUALS[avatarId];
  const skin = visual.palette.head;
  const shirt = visual.palette.body;
  const hair = visual.hairColor;
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
    >
      {/* shirt */}
      <path d="M14 60c1-12 8-18 18-18s17 6 18 18z" fill={shirt} />
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
