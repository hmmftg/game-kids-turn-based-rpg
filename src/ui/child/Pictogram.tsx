/**
 * Pictograms are geometric, high-contrast and never rely on colour alone:
 * each one pairs a distinct silhouette with a visible Persian label.
 */
export function Pictogram({
  shape,
  size = 56,
}: {
  readonly shape: string;
  readonly size?: number;
}) {
  return (
    <svg
      className="pictogram"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {renderShape(shape)}
    </svg>
  );
}

function renderShape(shape: string) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (shape) {
    case 'hand-wave':
      return (
        <>
          <path
            d="M18 40V20a3 3 0 0 1 6 0v-4a3 3 0 0 1 6 0v4a3 3 0 0 1 6 0v12a8 8 0 0 1-8 8z"
            {...stroke}
          />
          <path d="M12 14l-4-4M14 8l-1-5" {...stroke} />
        </>
      );
    case 'smile':
      return (
        <>
          <circle cx="24" cy="24" r="17" {...stroke} />
          <path d="M16 28a10 10 0 0 0 16 0" {...stroke} />
          <circle cx="18" cy="20" r="1.8" fill="currentColor" />
          <circle cx="30" cy="20" r="1.8" fill="currentColor" />
        </>
      );
    case 'hand-stop':
      return (
        <>
          <path
            d="M16 40V18a3 3 0 0 1 6 0v-6a3 3 0 0 1 6 0v6a3 3 0 0 1 6 0v14a8 8 0 0 1-8 8z"
            {...stroke}
          />
          <path d="M8 8l10 10" {...stroke} />
        </>
      );
    case 'arrow-back':
      return <path d="M34 24H14m8-8l-8 8 8 8" {...stroke} />;
    case 'arrow-forward':
      return <path d="M14 24h20m-8-8l8 8-8 8" {...stroke} />;
    case 'hands-carry':
      return (
        <>
          <rect x="12" y="14" width="24" height="14" rx="3" {...stroke} />
          <path d="M10 30l6 8M38 30l-6 8" {...stroke} />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M6 24s7-10 18-10 18 10 18 10-7 10-18 10S6 24 6 24z" {...stroke} />
          <circle cx="24" cy="24" r="4.5" {...stroke} />
        </>
      );
    case 'basket':
    case 'basket-down':
      return (
        <>
          <path d="M10 20h28l-4 18H14z" {...stroke} />
          <path d="M18 20a6 6 0 0 1 12 0" {...stroke} />
          {shape === 'basket-down' ? <path d="M24 6v8m-4-4l4 4 4-4" {...stroke} /> : null}
        </>
      );
    case 'basket-tilt':
      return (
        <g transform="rotate(28 24 24)">
          <path d="M10 20h28l-4 18H14z" {...stroke} />
        </g>
      );
    case 'hand-pick':
      return (
        <>
          <path
            d="M14 38V22a3 3 0 0 1 6 0v-2a3 3 0 0 1 6 0v2a3 3 0 0 1 6 0v10a8 8 0 0 1-8 8z"
            {...stroke}
          />
          <circle cx="36" cy="12" r="4" {...stroke} />
        </>
      );
    case 'foot':
      return (
        <>
          <path d="M18 38c-4-6-4-14 0-20s10-6 12 0-2 14-6 20z" {...stroke} />
          <circle cx="34" cy="16" r="3" {...stroke} />
        </>
      );
    case 'ground':
      return <path d="M6 34h36M12 26h10M28 26h8" {...stroke} />;
    case 'water-drop':
      return (
        <>
          <path d="M24 6s10 12 10 19a10 10 0 0 1-20 0c0-7 10-19 10-19z" {...stroke} />
          <path d="M18 40h12" {...stroke} />
        </>
      );
    case 'star':
      return (
        <path
          d="M24 6l5.5 11.5L42 19l-9 8.8L35.5 41 24 34.6 12.5 41 15 27.8 6 19l12.5-1.5z"
          {...stroke}
        />
      );
    case 'play':
      return <path d="M17 12l18 12-18 12z" {...stroke} />;
    case 'pause':
      return <path d="M18 12v24M30 12v24" {...stroke} />;
    default:
      return <circle cx="24" cy="24" r="16" {...stroke} />;
  }
}
