import { useState } from 'react';
import { FA } from '../../content/fa/strings.ts';
import { HEADWEAR_IDS } from '../../domain/game/types.ts';
import type { AvatarId, HeadwearId } from '../../domain/game/types.ts';
import { AVATAR_EMOJI, BADGE_EMOJIS, HEADWEAR_LABEL } from './emoji.ts';
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
      <span className="emoji" style={{ fontSize: 40 }} aria-hidden="true">
        🕹️
      </span>
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
      <span className="emoji title__emoji" aria-hidden="true">
        🧸
      </span>
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
      <h1 className="title">
        <span className="emoji title__emoji" aria-hidden="true">
          🏘️
        </span>
        {FA.appTitle}
      </h1>
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

/**
 * New-player flow: pick avatar → pick headwear → pick badge. Headwear is a
 * cosmetic category open to every avatar (no girl/boy routing); the preview
 * updates on the same tap that selects, and the choice lands on the profile
 * card next to the badge.
 */
export function AvatarSelectScreen({
  onSelect,
}: {
  readonly onSelect: (id: AvatarId, badge: string, headwear: HeadwearId) => void;
}) {
  const [step, setStep] = useState<'avatar' | 'headwear' | 'badge'>('avatar');
  const [avatarId, setAvatarId] = useState<AvatarId | null>(null);
  const [headwear, setHeadwear] = useState<HeadwearId>('none');
  return (
    <div className="layer" data-testid="avatar-select">
      {step === 'avatar' ? (
        <>
          <h1 className="subtitle">{FA.chooseAvatar}</h1>
          <div className="row">
            <button
              type="button"
              className="btn btn--large avatar-choice avatar-choice--aban"
              onClick={() => {
                setAvatarId('avatar-aban');
                setStep('headwear');
              }}
              data-testid="avatar-aban"
            >
              <span className="emoji avatar-choice__emoji" aria-hidden="true">
                {AVATAR_EMOJI['avatar-aban']}
              </span>
              {FA.avatarAban}
            </button>
            <button
              type="button"
              className="btn btn--large avatar-choice avatar-choice--arta"
              onClick={() => {
                setAvatarId('avatar-arta');
                setStep('headwear');
              }}
              data-testid="avatar-arta"
            >
              <span className="emoji avatar-choice__emoji" aria-hidden="true">
                {AVATAR_EMOJI['avatar-arta']}
              </span>
              {FA.avatarArta}
            </button>
          </div>
          <p className="text text--soft">{FA.avatarHint}</p>
        </>
      ) : null}

      {step === 'headwear' && avatarId !== null ? (
        <>
          <h1 className="subtitle">{FA.chooseHeadwear}</h1>
          <div className="headwear-preview" data-testid="headwear-preview" dir="rtl">
            <span className="emoji headwear-preview__avatar" aria-hidden="true">
              {AVATAR_EMOJI[avatarId]}
            </span>
            <Pictogram shape={`headwear-${headwear}`} size={72} />
          </div>
          <div className="row headwear-row" dir="rtl" data-testid="headwear-row">
            {HEADWEAR_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="btn btn--icon headwear-choice"
                aria-pressed={headwear === id}
                onClick={() => setHeadwear(id)}
                data-testid={`headwear-option-${id}`}
              >
                <Pictogram shape={`headwear-${id}`} size={44} />
                <span className="headwear-choice__label">{HEADWEAR_LABEL[id]}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setStep('avatar')}
              data-testid="headwear-back"
            >
              {FA.back}
            </button>
            <button
              type="button"
              className="btn btn--large"
              onClick={() => setStep('badge')}
              data-testid="headwear-next"
            >
              {FA.next}
            </button>
          </div>
        </>
      ) : null}

      {step === 'badge' && avatarId !== null ? (
        <>
          <h1 className="subtitle">{FA.chooseBadge}</h1>
          <div className="row badge-row" data-testid="badge-row">
            {BADGE_EMOJIS.map((badge, index) => (
              <button
                key={badge}
                type="button"
                className="btn btn--icon badge-choice"
                onClick={() => onSelect(avatarId, badge, headwear)}
                data-testid={`badge-${index}`}
                aria-label={badge}
              >
                <span className="emoji avatar-choice__emoji" aria-hidden="true">
                  {badge}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setStep('headwear')}
            data-testid="badge-back"
          >
            {FA.back}
          </button>
        </>
      ) : null}
    </div>
  );
}
