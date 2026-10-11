import { FA } from '../../content/fa/strings.ts';
import { clampUserZoom, USER_ZOOM_MAX, USER_ZOOM_MIN } from '../../framework/index.ts';
import type { AudioSettings, StickerId } from '../../domain/game/types.ts';
import { StickerShelf } from './QuestTrail.tsx';

/**
 * The one child-facing menu (W4): every scattered HUD control gathers here —
 * album, friends, zoom, sound, player switching. The world keeps only the
 * menu opener and the guidance surface (objective chip + quest trail).
 * Sheet-opening entries resume first because the sheets overlay the HUD,
 * not the paused layer. Technical settings (rendering quality, diagnostics,
 * updates) live in the parent area, not here.
 */
export function PauseMenu({
  audio,
  stickers,
  zoomFactor,
  onResume,
  onAudioChange,
  onParentArea,
  onSwitchPlayer,
  onOpenAlbum,
  onOpenNearby,
  onZoom,
}: {
  readonly audio: AudioSettings;
  readonly stickers: readonly StickerId[];
  readonly zoomFactor: number;
  readonly onResume: () => void;
  readonly onAudioChange: (patch: Partial<AudioSettings>) => void;
  readonly onParentArea: () => void;
  readonly onSwitchPlayer: () => void;
  readonly onOpenAlbum: () => void;
  readonly onOpenNearby: () => void;
  readonly onZoom: (factor: number) => void;
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

        {/* World entries: each resumes, then opens its sheet over the HUD.
            Same data-testids as the scattered chrome they replace. */}
        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onOpenNearby}
            data-testid="nearby-button"
            aria-label={FA.nearby}
          >
            <span className="emoji" aria-hidden="true">
              👥
            </span>{' '}
            {FA.nearby}
          </button>
          <StickerShelf stickers={stickers} onOpen={onOpenAlbum} />
        </div>

        {/* Zoom clamps at the 0.75–1.35 band — at a limit the button reads
            as a picture, not a verb. */}
        <div className="row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => onZoom(clampUserZoom(zoomFactor - 0.1))}
            data-testid="zoom-out"
            aria-label={FA.zoomOut}
            disabled={zoomFactor <= USER_ZOOM_MIN}
          >
            <span className="emoji" aria-hidden="true">
              🔍➖
            </span>{' '}
            {FA.zoomOut}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => onZoom(clampUserZoom(zoomFactor + 0.1))}
            data-testid="zoom-in"
            aria-label={FA.zoomIn}
            disabled={zoomFactor >= USER_ZOOM_MAX}
          >
            <span className="emoji" aria-hidden="true">
              🔍➕
            </span>{' '}
            {FA.zoomIn}
          </button>
        </div>

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
