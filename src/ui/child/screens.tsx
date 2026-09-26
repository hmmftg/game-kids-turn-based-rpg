import { FA } from '../../content/fa/strings.ts';
import { Pictogram } from './Pictogram.tsx';

export function LoadingScreen() {
  return (
    <div className="layer" role="status" aria-live="polite">
      <h1 className="title">{FA.appTitle}</h1>
      <p className="text">{FA.loading}</p>
      <p className="text text--soft">{FA.loadingHint}</p>
    </div>
  );
}

export function OrientationScreen() {
  return (
    <div className="layer" data-testid="orientation-blocker">
      <div className="rotate-icon" aria-hidden="true" />
      <h1 className="title">{FA.rotateTitle}</h1>
      <p className="text">{FA.rotateHint}</p>
    </div>
  );
}

/**
 * Non-covering notice shown in place of the hub hint when WebGL is missing.
 * It must not overlay the quest trail or other DOM controls — the DOM fallback
 * is how the child actually plays.
 */
export function WebglFallbackScreen({ onContinue }: { readonly onContinue: () => void }) {
  return (
    <section className="webgl-fallback" data-testid="webgl-fallback">
      <h1 className="subtitle">{FA.webglTitle}</h1>
      <p className="text">{FA.webglHint}</p>
      <button type="button" className="btn btn--large" onClick={onContinue}>
        {FA.webglAction}
      </button>
    </section>
  );
}

export function ErrorScreen({
  onRestart,
  reason,
}: {
  readonly onRestart: () => void;
  readonly reason: string | null;
}) {
  return (
    <div className="layer" role="alert" data-testid="error-screen">
      <h1 className="title">{FA.errorTitle}</h1>
      <p className="text">{FA.errorHint}</p>
      <button type="button" className="btn btn--large" onClick={onRestart}>
        {FA.errorAction}
      </button>
      {reason ? <p className="text text--soft">{reason}</p> : null}
    </div>
  );
}

export function TitleScreen({
  hasProgress,
  onStart,
  onParent,
  notice,
}: {
  readonly hasProgress: boolean;
  readonly onStart: () => void;
  readonly onParent: () => void;
  readonly notice: string | null;
}) {
  return (
    <div className="layer" data-testid="title-screen">
      <h1 className="title">{FA.appTitle}</h1>
      {notice ? <p className="text text--soft">{notice}</p> : null}
      <button type="button" className="btn btn--large" onClick={onStart} data-testid="start-button">
        <Pictogram shape="play" />
        <span>{hasProgress ? FA.resume : FA.play}</span>
      </button>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onParent}
        data-testid="parent-entry"
      >
        {FA.parentArea}
      </button>
    </div>
  );
}

export function AvatarSelectScreen({
  onSelect,
}: {
  readonly onSelect: (id: 'avatar-aban' | 'avatar-arta') => void;
}) {
  return (
    <div className="layer" data-testid="avatar-select">
      <h1 className="subtitle">{FA.chooseAvatar}</h1>
      <div className="row">
        <button
          type="button"
          className="btn btn--large avatar-choice avatar-choice--aban"
          onClick={() => onSelect('avatar-aban')}
          data-testid="avatar-aban"
        >
          {FA.avatarAban}
        </button>
        <button
          type="button"
          className="btn btn--large avatar-choice avatar-choice--arta"
          onClick={() => onSelect('avatar-arta')}
          data-testid="avatar-arta"
        >
          {FA.avatarArta}
        </button>
      </div>
      <p className="text text--soft">{FA.avatarHint}</p>
    </div>
  );
}
