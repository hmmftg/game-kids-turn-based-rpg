import { useEffect, useState } from 'react';
import { FA } from '../../content/fa/strings.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';
import { AVATAR_EMOJI } from './emoji.ts';

const CONFIRM_DISARM_MS = 5000;

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);
}

/**
 * «Who is playing?» picker. Pre-readers find their card by badge + avatar, so
 * each card is one giant recognisable picture plus a sticker count. The reset
 * chip arms first («مطمئنی؟») and only deletes on a second tap — a stray poke
 * can never wipe a sibling's progress.
 */
export function ProfileSelectScreen({
  profiles,
  onSelect,
  onNew,
  onReset,
  onParent,
}: {
  readonly profiles: readonly ProfileMeta[];
  readonly onSelect: (id: string) => void;
  readonly onNew: () => void;
  readonly onReset: (id: string) => void;
  readonly onParent: () => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmingId === null) return;
    const timer = setTimeout(() => setConfirmingId(null), CONFIRM_DISARM_MS);
    return () => clearTimeout(timer);
  }, [confirmingId]);

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
            <button
              type="button"
              className="btn btn--secondary profile-card__reset"
              onClick={() =>
                confirmingId === profile.id ? onReset(profile.id) : setConfirmingId(profile.id)
              }
              data-testid={`profile-reset-${profile.id}`}
            >
              {confirmingId === profile.id ? FA.resetCardConfirm : FA.resetCard}
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
