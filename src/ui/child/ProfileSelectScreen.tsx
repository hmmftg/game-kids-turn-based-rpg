import { FA } from '../../content/fa/strings.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';
import { faDigits } from '../faDigits.ts';
import { AvatarPortrait } from './AvatarPortrait.tsx';

/**
 * «Who is playing?» picker. Pre-readers find their card by portrait — the same
 * kid they picked — so each card is one giant recognisable picture plus a
 * sticker count. Destructive resets are deliberately absent from this
 * child-facing flow: they live behind the press-and-hold parent gate.
 */
export function ProfileSelectScreen({
  profiles,
  onSelect,
  onNew,
  onParent,
}: {
  readonly profiles: readonly ProfileMeta[];
  readonly onSelect: (id: string) => void;
  readonly onNew: () => void;
  readonly onParent: () => void;
}) {
  // "Whose card is whose" cue: the most recently played profile gets a word
  // badge so a returning child spots their card first — text, not colour.
  const lastPlayedId = profiles.reduce<string | null>(
    (latest, profile) =>
      profile.lastPlayedAt > 0 &&
      (latest === null ||
        profile.lastPlayedAt > (profiles.find((p) => p.id === latest)?.lastPlayedAt ?? 0))
        ? profile.id
        : latest,
    null,
  );
  return (
    <div className="layer" data-testid="profile-select">
      <h1 className="subtitle">{FA.whoIsPlaying}</h1>
      <div className="row profile-grid" dir="rtl">
        {profiles.map((profile, index) => (
          <div key={profile.id} className="profile-card">
            <button
              type="button"
              className="btn btn--icon profile-card__main"
              onClick={() => onSelect(profile.id)}
              data-testid={`profile-card-${profile.id}`}
            >
              <span className="profile-card__avatar" aria-hidden="true">
                <AvatarPortrait avatarId={profile.avatarId} headwear={profile.headwear} size={64} />
              </span>
              <span className="trail__title">
                {profile.nameFa || `${FA.playerFallback} ${faDigits(index + 1)}`}
              </span>
              <span className="text--soft">⭐ {faDigits(profile.stickerCount)}</span>
            </button>
            {profile.id === lastPlayedId ? (
              <span className="profile-card__last" data-testid="profile-last-played">
                {FA.lastPlayed}
              </span>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="btn btn--icon profile-card__main profile-card__main--new"
          onClick={onNew}
          data-testid="profile-new"
        >
          <span className="emoji" style={{ fontSize: 48 }} aria-hidden="true">
            ➕
          </span>
          <span className="trail__title">{FA.newPlayer}</span>
        </button>
      </div>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onParent}
        data-testid="parent-entry-profiles"
      >
        {FA.parentArea}
      </button>
    </div>
  );
}
