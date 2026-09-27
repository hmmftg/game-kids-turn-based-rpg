import { FA } from '../../content/fa/strings.ts';
import type { AudioSettings } from '../../domain/game/types.ts';

/**
 * Child-facing pause: resume is the single dominant action; sound toggles and
 * player switching are secondary. Technical settings (rendering quality,
 * diagnostics, updates) live in the parent area, not here.
 */
export function PauseMenu({
  audio,
  onResume,
  onAudioChange,
  onParentArea,
  onSwitchPlayer,
}: {
  readonly audio: AudioSettings;
  readonly onResume: () => void;
  readonly onAudioChange: (patch: Partial<AudioSettings>) => void;
  readonly onParentArea: () => void;
  readonly onSwitchPlayer: () => void;
}) {
  return (
    <div className="layer layer--overlay" data-testid="pause-menu">
      <div className="panel column">
        <h2 className="subtitle">{FA.pause}</h2>

        <button
          type="button"
          className="btn btn--large"
          onClick={onResume}
          data-testid="resume-button"
        >
          <span className="emoji" aria-hidden="true">
            ▶️
          </span>{' '}
          {FA.resumePlay}
        </button>

        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            aria-pressed={!audio.musicMuted}
            onClick={() => onAudioChange({ musicMuted: !audio.musicMuted })}
            data-testid="toggle-music"
          >
            <span className="emoji" aria-hidden="true">
              {audio.musicMuted ? '🔇' : '🎵'}
            </span>{' '}
            {FA.music}: {audio.musicMuted ? FA.off : FA.on}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            aria-pressed={!audio.sfxMuted}
            onClick={() => onAudioChange({ sfxMuted: !audio.sfxMuted })}
            data-testid="toggle-sfx"
          >
            <span className="emoji" aria-hidden="true">
              {audio.sfxMuted ? '🔕' : '🔔'}
            </span>{' '}
            {FA.sfx}: {audio.sfxMuted ? FA.off : FA.on}
          </button>
        </div>

        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onSwitchPlayer}
            data-testid="switch-player"
          >
            <span className="emoji" aria-hidden="true">
              🔁
            </span>{' '}
            {FA.switchPlayer}
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
