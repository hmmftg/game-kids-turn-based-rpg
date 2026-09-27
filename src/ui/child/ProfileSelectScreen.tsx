import { FA } from '../../content/fa/strings.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';
import { AVATAR_EMOJI } from './emoji.ts';

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);
}

/**
 * «Who is playing?» picker. Pre-readers find their card by badge + avatar, so
 * each card is one giant recognisable picture plus a sticker count. Destructive
 * resets are deliberately absent from this child-facing flow: they live behind
 * the press-and-hold parent gate.
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
              <span className="emoji profile-card__badge" aria-hidden="true">
                {profile.badge}
              </span>
              <span className="emoji profile-card__avatar" aria-hidden="true">
                {AVATAR_EMOJI[profile.avatarId]}
              </span>
              <span className="trail__title">
                {profile.nameFa || `${FA.playerFallback} ${persianDigits(index + 1)}`}
              </span>
              <span className="text--soft">⭐ {persianDigits(profile.stickerCount)}</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--icon profile-card__main profile-card__main--new"
          onClick={onNew}
          data-testid="profile-new"
        >
          <span className="emoji profile-card__badge" aria-hidden="true">
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
