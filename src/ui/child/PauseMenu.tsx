import { FA } from '../../content/fa/strings.ts';
import type { AudioSettings, QualityTier } from '../../domain/game/types.ts';

const TIER_LABEL: Record<QualityTier, string> = {
  low: FA.qualityLow,
  medium: FA.qualityMedium,
  high: FA.qualityHigh,
};

export function PauseMenu({
  audio,
  qualityTier,
  updateReady,
  onResume,
  onAudioChange,
  onQualityChange,
  onParentArea,
  onApplyUpdate,
}: {
  readonly audio: AudioSettings;
  readonly qualityTier: QualityTier;
  readonly updateReady: boolean;
  readonly onResume: () => void;
  readonly onAudioChange: (patch: Partial<AudioSettings>) => void;
  readonly onQualityChange: (tier: QualityTier) => void;
  readonly onParentArea: () => void;
  readonly onApplyUpdate: () => void;
}) {
  return (
    <div className="layer layer--overlay" data-testid="pause-menu">
      <div className="panel column">
        <h2 className="subtitle">{FA.pause}</h2>

        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            aria-pressed={!audio.musicMuted}
            onClick={() => onAudioChange({ musicMuted: !audio.musicMuted })}
            data-testid="toggle-music"
          >
            {FA.music}: {audio.musicMuted ? FA.off : FA.on}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            aria-pressed={!audio.sfxMuted}
            onClick={() => onAudioChange({ sfxMuted: !audio.sfxMuted })}
            data-testid="toggle-sfx"
          >
            {FA.sfx}: {audio.sfxMuted ? FA.off : FA.on}
          </button>
        </div>

        <div className="row" role="group" aria-label={FA.quality}>
          {(['low', 'medium', 'high'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              className="btn btn--secondary"
              aria-pressed={qualityTier === tier}
              onClick={() => onQualityChange(tier)}
              data-testid={`quality-${tier}`}
            >
              {TIER_LABEL[tier]}
            </button>
          ))}
        </div>

        {updateReady ? (
          <div className="row" data-testid="update-prompt">
            <span className="text">{FA.updateAvailable}</span>
            <button
              type="button"
              className="btn btn--accent"
              onClick={onApplyUpdate}
              data-testid="apply-update"
            >
              {FA.updateApply}
            </button>
          </div>
        ) : null}

        <div className="row">
          <button
            type="button"
            className="btn btn--large"
            onClick={onResume}
            data-testid="resume-button"
          >
            {FA.resumePlay}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onParentArea}
            data-testid="parent-entry-pause"
          >
            {FA.parentArea}
          </button>
        </div>
      </div>
    </div>
  );
}
