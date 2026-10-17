import { FA } from '../../content/fa/strings.ts';
import { clampUserZoom, USER_ZOOM_MAX, USER_ZOOM_MIN } from '../../framework/index.ts';
import type { AudioSettings, QualityTier, StickerId } from '../../domain/game/types.ts';
import { QUALITY_GLYPH, QUALITY_TIERS, TIER_LABEL } from '../qualityTiers.ts';
import { Overlay } from '../Overlay.tsx';
import { StickerShelf } from './QuestTrail.tsx';

/**
 * The one child-facing menu (W4): every scattered HUD control gathers here —
 * album, friends, zoom, sound, player switching. The world keeps only the
 * menu opener and the guidance surface (objective chip + quest trail).
 * Sheet-opening entries resume first because the sheets overlay the HUD,
 * not the paused layer. Picture quality is a pictogram choice here too
 * (child-accessible by user decision); diagnostics/updates stay parent-only.
 */
export function PauseMenu({
  audio,
  stickers,
  zoomFactor,
  qualityTier,
  onResume,
  onAudioChange,
  onParentArea,
  onSwitchPlayer,
  onOpenAlbum,
  onOpenNearby,
  onZoom,
  onQualityChange,
}: {
  readonly audio: AudioSettings;
  readonly stickers: readonly StickerId[];
  readonly zoomFactor: number;
  readonly qualityTier: QualityTier;
  readonly onResume: () => void;
  readonly onAudioChange: (patch: Partial<AudioSettings>) => void;
  readonly onParentArea: () => void;
  readonly onSwitchPlayer: () => void;
  readonly onOpenAlbum: () => void;
  readonly onOpenNearby: () => void;
  readonly onZoom: (factor: number) => void;
  readonly onQualityChange: (tier: QualityTier) => void;
}) {
  return (
    <Overlay testId="pause-menu" ariaLabel={FA.pause} onDismiss={onResume}>
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

        <hr className="menu-divider" aria-hidden="true" />

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

        {/* Volume sliders ride the same SET_AUDIO_SETTINGS patch as the mute
            toggles — 0..1, already clamped + persisted by the reducer. Muted
            buses keep their stored level; the slider just can't be dragged. */}
        <div className="volume-row">
          <span className="emoji" aria-hidden="true">
            🎵
          </span>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={audio.musicVolume}
            disabled={audio.musicMuted}
            aria-label={FA.musicVolume}
            onChange={(e) => onAudioChange({ musicVolume: Number(e.currentTarget.value) })}
            data-testid="music-volume"
          />
        </div>
        <div className="volume-row">
          <span className="emoji" aria-hidden="true">
            🔔
          </span>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={audio.sfxVolume}
            disabled={audio.sfxMuted}
            aria-label={FA.sfxVolume}
            onChange={(e) => onAudioChange({ sfxVolume: Number(e.currentTarget.value) })}
            data-testid="sfx-volume"
          />
        </div>

        {/* W5: child quality choice — a pictogram speed scale instead of the
            parent's word labels. Same state and dispatch as parent-quality. */}
        <div className="row" role="radiogroup" aria-label={FA.quality}>
          {QUALITY_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              role="radio"
              className="btn btn--secondary"
              aria-checked={qualityTier === tier}
              aria-label={TIER_LABEL[tier]}
              onClick={() => onQualityChange(tier)}
              data-testid={`child-quality-${tier}`}
            >
              <span className="emoji" aria-hidden="true">
                {QUALITY_GLYPH[tier]}
              </span>
            </button>
          ))}
        </div>

        <hr className="menu-divider" aria-hidden="true" />

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
    </Overlay>
  );
}
