import { useEffect, useState } from 'react';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { SOURCE_RECORDS } from '../../content/sources/records.ts';
import { AUDIO_MANIFEST } from '../../services/audio/manifest.ts';
import type { GameState, QualityTier } from '../../domain/game/types.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';
import type { CacheStatus } from '../../services/pwa/serviceWorker.ts';
import { researchPendingCount } from '../../services/research/recorder.ts';
import { AvatarPortrait } from '../child/AvatarPortrait.tsx';

const CACHE_LABEL: Record<CacheStatus, string> = {
  unsupported: '—',
  caching: FA.offlineCaching,
  ready: FA.offlineReady,
  failed: FA.errorTitle,
};

/**
 * Parent-only area: provenance, credits, privacy, local diagnostics and a
 * confirmed reset. No external links, no network calls, no child-visible entry.
 */
const TIER_LABEL: Record<QualityTier, string> = {
  low: FA.qualityLow,
  medium: FA.qualityMedium,
  high: FA.qualityHigh,
};

export function ParentArea({
  state,
  cacheStatus,
  profiles,
  activeProfileId,
  onClose,
  onReset,
  onResetProfile,
  onRenameProfile,
  onDeleteProfile,
  onQualityChange,
  onOpenWorldBuilder,
  onOpenDiagnostics,
  researchActive = false,
  onExportResearch,
  onUploadResearch,
  updateReady,
  onApplyUpdate,
  installReady,
  onInstallApp,
}: {
  readonly state: GameState;
  readonly cacheStatus: CacheStatus;
  readonly profiles: readonly ProfileMeta[];
  readonly activeProfileId: string | null;
  readonly onClose: () => void;
  readonly onReset: () => void;
  readonly onResetProfile: (id: string) => void;
  readonly onRenameProfile: (id: string, nameFa: string) => void;
  /** Removes the profile card AND its save slot entirely. */
  readonly onDeleteProfile: (id: string) => void;
  readonly onQualityChange: (tier: QualityTier) => void;
  /** Navigates to the `?worldbuilder=1` authoring tool. */
  readonly onOpenWorldBuilder: () => void;
  /** Navigates to the `?diagnostics=1` live technical readout. */
  readonly onOpenDiagnostics: () => void;
  /** Research Session Mode (PR R+): an active session shows the badge, queue count, export and optional upload. */
  readonly researchActive?: boolean;
  readonly onExportResearch?: () => void;
  readonly onUploadResearch?: (() => Promise<void>) | undefined;
  readonly updateReady: boolean;
  readonly onApplyUpdate: () => void;
  readonly installReady: boolean;
  readonly onInstallApp: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmingProfileId, setConfirmingProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [researchPending, setResearchPending] = useState<number | null>(null);

  useEffect(() => {
    if (!researchActive) return;
    let live = true;
    void researchPendingCount().then((count) => {
      if (live) setResearchPending(count);
    });
    return () => {
      live = false;
    };
  }, [researchActive, researchPending === null]);

  return (
    <div className="layer layer--overlay layer--parent" data-testid="parent-area">
      <div className="panel panel--parent column" dir="rtl">
        <h2 className="subtitle">{FA.parentArea}</h2>

        {researchActive ? (
          <section data-testid="parent-research">
            <h3 className="subtitle">🔬 {FA.researchBadge}</h3>
            <p className="text text--soft">
              {FA.researchPending}:{' '}
              <span data-testid="research-pending-count">{researchPending ?? '…'}</span>
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onExportResearch}
              data-testid="research-export"
            >
              {FA.researchExport}
            </button>{' '}
            {onUploadResearch !== undefined ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  // Refresh the pending count once the flush settles — the
                  // queue only clears when every record landed.
                  void onUploadResearch().then(() => setResearchPending(null));
                }}
                data-testid="research-upload"
              >
                {FA.researchUpload}
              </button>
            ) : null}
          </section>
        ) : null}

        <section data-testid="parent-quality">
          <h3 className="subtitle">{FA.quality}</h3>
          <div className="row" role="group" aria-label={FA.quality}>
            {(['low', 'medium', 'high'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                className="btn btn--secondary"
                aria-pressed={state.qualityTier === tier}
                onClick={() => onQualityChange(tier)}
                data-testid={`quality-${tier}`}
              >
                {TIER_LABEL[tier]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentSources}</h3>
          <p className="text text--soft">{FA.sourcesDraftBody}</p>
          <ul className="text">
            {SOURCE_RECORDS.map((record) => (
              <li key={record.id} data-testid={`source-${record.id}`}>
                <strong>{getQuestCopy(record.relatedQuestId).titleFa}</strong> —{' '}
                {record.principleSummaryFa}
                <br />
                <span className="text--soft">
                  وضعیت بازبینی: {record.review.status} · نقل‌قول: — · ارجاع: —
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentCredits}</h3>
          <p className="text text--soft">
            قلم Vazirmatn با پروانه‌ی SIL Open Font License؛ کد بازی با پروانه‌ی MIT. صداها:{' '}
            {AUDIO_MANIFEST.every((asset) => asset.url === null)
              ? 'همه‌ی صداها فعلاً خاموش و جای‌نگه‌دارند.'
              : 'صداهای فعلی با ژنراتور داخلی بازی ساخته شده‌اند و جای‌نگه‌دارند.'}
          </p>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentPrivacy}</h3>
          <p className="text text--soft">{FA.privacyBody}</p>
        </section>

        <section data-testid="parent-tools">
          <h3 className="subtitle">{FA.parentTools}</h3>
          <p className="text text--soft">{FA.worldBuilderHint}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onOpenWorldBuilder}
            data-testid="open-worldbuilder"
          >
            {FA.worldBuilderOpen}
          </button>{' '}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onOpenDiagnostics}
            data-testid="open-diagnostics"
          >
            {FA.diagnosticsOpen}
          </button>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentInstall}</h3>
          <p className="text text--soft">{FA.installBody}</p>
          {installReady ? (
            <button
              type="button"
              className="btn btn--accent"
              onClick={onInstallApp}
              data-testid="install-app"
            >
              {FA.installApp}
            </button>
          ) : null}
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
        </section>

        {profiles.length > 0 ? (
          <section data-testid="parent-profiles">
            <h3 className="subtitle">{FA.parentProfiles}</h3>
            <ul className="column">
              {profiles.map((profile, index) => (
                <li key={profile.id} className="row parent-profile" dir="rtl">
                  <span className="parent-profile__identity" aria-hidden="true">
                    <span className="emoji">{profile.badge}</span>
                    <AvatarPortrait avatarId={profile.avatarId} size={32} />
                  </span>
                  <input
                    className="parent-profile__name"
                    type="text"
                    dir="rtl"
                    defaultValue={profile.nameFa}
                    placeholder={profile.nameFa || `${FA.playerFallback} ${index + 1}`}
                    aria-label={FA.profileNameHint}
                    data-testid={`rename-${profile.id}`}
                    onBlur={(event) => {
                      const nameFa = event.currentTarget.value.trim();
                      if (nameFa !== profile.nameFa) onRenameProfile(profile.id, nameFa);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <span className="text--soft">⭐ {profile.stickerCount}</span>
                  {profile.id === activeProfileId ? <span className="text--soft">●</span> : null}
                  {confirmingProfileId === profile.id ? (
                    <button
                      type="button"
                      className="btn btn--accent"
                      onClick={() => {
                        setConfirmingProfileId(null);
                        onResetProfile(profile.id);
                      }}
                      data-testid={`parent-reset-confirm-${profile.id}`}
                    >
                      {FA.parentResetYes}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setConfirmingProfileId(profile.id)}
                      data-testid={`parent-reset-${profile.id}`}
                    >
                      {FA.parentReset}
                    </button>
                  )}
                  {deletingProfileId === profile.id ? (
                    <>
                      <span className="text--soft">{FA.parentDeleteConfirm}</span>
                      <button
                        type="button"
                        className="btn btn--accent"
                        onClick={() => {
                          setDeletingProfileId(null);
                          onDeleteProfile(profile.id);
                        }}
                        data-testid={`parent-delete-confirm-${profile.id}`}
                      >
                        {FA.parentDeleteYes}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setDeletingProfileId(profile.id)}
                      data-testid={`parent-delete-${profile.id}`}
                    >
                      {FA.parentDelete}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="subtitle">{FA.parentDiagnostics}</h3>
          <ul className="text text--soft" data-testid="diagnostics">
            <li>وضعیت ذخیره‌سازی آفلاین: {CACHE_LABEL[cacheStatus]}</li>
            <li>سلامت فایل ذخیره: {state.saveHealth}</li>
            <li>نسخه‌ی طرح ذخیره: {state.schemaVersion}</li>
            <li>کیفیت تصویر: {state.qualityTier}</li>
            <li>پشتیبانی سه‌بعدی: {state.webglAvailable ? 'بله' : 'خیر'}</li>
            <li>تعداد برچسب‌ها: {state.stickers.length}</li>
          </ul>
        </section>

        <div className="row">
          {confirming ? (
            <>
              <span className="text">{FA.parentResetConfirm}</span>
              <button
                type="button"
                className="btn btn--accent"
                onClick={onReset}
                data-testid="reset-confirm"
              >
                {FA.parentResetYes}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirming(false)}
                data-testid="reset-cancel"
              >
                {FA.parentResetNo}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirming(true)}
              data-testid="reset-request"
            >
              {FA.parentReset}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} data-testid="parent-close">
            {FA.parentClose}
          </button>
        </div>
      </div>
    </div>
  );
}
