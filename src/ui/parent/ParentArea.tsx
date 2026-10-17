import { useEffect, useState } from 'react';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { SOURCE_RECORDS } from '../../content/sources/records.ts';
import { AUDIO_MANIFEST } from '../../services/audio/manifest.ts';
import type { GameState, QualityTier } from '../../domain/game/types.ts';
import type { ProfileMeta } from '../../services/persistence/repository.ts';
import type { CacheStatus } from '../../services/pwa/serviceWorker.ts';
import { researchPendingCount } from '../../services/research/recorder.ts';
import type { ObserverBookmark } from '../../domain/research/types.ts';
import { researchEndpointConfigured, submitParentFeedback } from '../../services/research/queue.ts';
import { AvatarPortrait } from '../child/AvatarPortrait.tsx';
import { Overlay } from '../Overlay.tsx';
import { QUALITY_TIERS, TIER_LABEL } from '../qualityTiers.ts';

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
  onBookmark,
  onEndResearch,
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
  /** Observer bookmark row (R.1): hand-marked moments during a session. */
  readonly onBookmark?: ((kind: ObserverBookmark) => void) | undefined;
  /** Ends the research session — stamps `session_ended` and stops recording. */
  readonly onEndResearch?: (() => void) | undefined;
  readonly updateReady: boolean;
  readonly onApplyUpdate: () => void;
  readonly installReady: boolean;
  readonly onInstallApp: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmingProfileId, setConfirmingProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [researchPending, setResearchPending] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState<
    'idle' | 'sending' | 'sent' | 'failed' | 'empty'
  >('idle');

  const pendingNeedsRefresh = researchPending === null;
  useEffect(() => {
    if (!researchActive) return;
    let live = true;
    void researchPendingCount().then((count) => {
      if (live) setResearchPending(count);
    });
    return () => {
      live = false;
    };
  }, [researchActive, pendingNeedsRefresh]);

  return (
    <Overlay
      testId="parent-area"
      ariaLabel={FA.parentArea}
      onDismiss={onClose}
      overlayClass="layer--parent"
    >
      <div className="panel panel--parent column" dir="rtl">
        <h2 className="subtitle">{FA.parentArea}</h2>

        {researchActive ? (
          <section className="section" data-testid="parent-research">
            <h3 className="section__title">🔬 {FA.researchBadge}</h3>
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
            {onBookmark !== undefined ? (
              <>
                <p className="text text--soft">{FA.researchBookmarks}</p>
                <div className="row" role="group" aria-label={FA.researchBookmarks}>
                  {(
                    [
                      ['stuck', FA.researchBookmarkStuck],
                      ['repeated', FA.researchBookmarkRepeated],
                      ['discovered', FA.researchBookmarkDiscovered],
                      ['completed_solo', FA.researchBookmarkSolo],
                      ['asked_help', FA.researchBookmarkHelp],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => {
                        onBookmark(kind);
                        setResearchPending(null);
                      }}
                      data-testid={`research-bookmark-${kind}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {onEndResearch !== undefined ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onEndResearch}
                data-testid="research-end"
              >
                {FA.researchEnd}
              </button>
            ) : null}
          </section>
        ) : null}

        <section className="section" data-testid="parent-quality">
          <h3 className="section__title">{FA.quality}</h3>
          <div className="row" role="radiogroup" aria-label={FA.quality}>
            {QUALITY_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                role="radio"
                className="btn btn--secondary"
                aria-checked={state.qualityTier === tier}
                onClick={() => onQualityChange(tier)}
                data-testid={`quality-${tier}`}
              >
                {TIER_LABEL[tier]}
              </button>
            ))}
          </div>
        </section>

        {researchEndpointConfigured() ? (
          <section className="section" data-testid="parent-feedback">
            <h3 className="section__title">{FA.feedbackTitle}</h3>
            <p className="text text--soft">{FA.feedbackHint}</p>
            <div className="feedback-form">
              <textarea
                className="input"
                rows={3}
                maxLength={4000}
                placeholder={FA.feedbackPlaceholder}
                value={feedbackText}
                onChange={(e) => {
                  setFeedbackText(e.target.value);
                  if (feedbackState !== 'sending') setFeedbackState('idle');
                }}
                data-testid="feedback-text"
              />
              <button
                type="button"
                className="btn btn--secondary"
                disabled={feedbackState === 'sending'}
                onClick={() => {
                  setFeedbackState('sending');
                  submitParentFeedback(feedbackText, {
                    mapId: state.mapId,
                    qualityTier: state.qualityTier,
                    researchSession: researchActive,
                  })
                    .then(() => {
                      setFeedbackState('sent');
                      setFeedbackText('');
                    })
                    .catch((error: unknown) => {
                      setFeedbackState(
                        error instanceof Error && error.message === 'feedback-empty'
                          ? 'empty'
                          : 'failed',
                      );
                    });
                }}
                data-testid="feedback-send"
              >
                {feedbackState === 'sending' ? FA.feedbackSending : FA.feedbackSend}
              </button>
            </div>{' '}
            {feedbackState === 'sent' ? (
              <span className="text" data-testid="feedback-status">
                {FA.feedbackSent}
              </span>
            ) : null}
            {feedbackState === 'failed' ? (
              <span className="text" data-testid="feedback-status">
                {FA.feedbackFailed}
              </span>
            ) : null}
            {feedbackState === 'empty' ? (
              <span className="text" data-testid="feedback-status">
                {FA.feedbackEmpty}
              </span>
            ) : null}
          </section>
        ) : null}

        <section className="section" data-testid="parent-info">
          {/* Reference material collapses — the area opens at settings height,
              not at the bottom of a wall of provenance text. */}
          <details>
            <summary className="section__title">{FA.parentSources}</summary>
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
          </details>
          <details>
            <summary className="section__title">{FA.parentCredits}</summary>
            <p className="text text--soft">
              قلم Vazirmatn با پروانه‌ی SIL Open Font License؛ کد بازی با پروانه‌ی MIT.
            </p>
            {/* Attribution lines are licence obligations — render every distinct
                one declared in the manifest (CC BY 4.0 requires this credit). */}
            {[...new Set(AUDIO_MANIFEST.map((a) => a.attribution).filter((a) => a !== ''))].map(
              (line) => (
                <p key={line} className="text text--soft" dir="ltr" data-testid="audio-credit">
                  🎵 {line}
                </p>
              ),
            )}
            <p className="text text--soft">
              جلوه‌های صوتی با ژنراتور داخلی بازی ساخته شده‌اند و با پروانه‌ی MIT منتشر می‌شوند.
            </p>
          </details>
          <details>
            <summary className="section__title">{FA.parentPrivacy}</summary>
            <p className="text text--soft">{FA.privacyBody}</p>
          </details>
        </section>

        <section className="section" data-testid="parent-tools">
          <h3 className="section__title">{FA.parentTools}</h3>
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

        <section className="section">
          <h3 className="section__title">{FA.parentInstall}</h3>
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
          <section className="section" data-testid="parent-profiles">
            <h3 className="section__title">{FA.parentProfiles}</h3>
            <ul className="column">
              {profiles.map((profile, index) => (
                <li key={profile.id} className="row parent-profile" dir="rtl">
                  <span className="parent-profile__meta">
                    <span className="parent-profile__identity" aria-hidden="true">
                      <span className="emoji">{profile.badge}</span>
                      <AvatarPortrait
                        avatarId={profile.avatarId}
                        headwear={profile.headwear}
                        size={32}
                      />
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
                        // Escape reverts the field — leaving the area is the
                        // overlay's job and it never sees an editable Escape.
                        if (event.key === 'Escape') {
                          event.currentTarget.value = profile.nameFa;
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <span className="text--soft">⭐ {profile.stickerCount}</span>
                    {profile.id === activeProfileId ? <span className="text--soft">●</span> : null}
                  </span>
                  <span className="parent-profile__actions">
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
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="section">
          <details>
            <summary className="section__title">{FA.parentDiagnostics}</summary>
            <dl className="diagnostics-list text text--soft" data-testid="diagnostics">
              <dt>وضعیت ذخیره‌سازی آفلاین</dt>
              <dd>{CACHE_LABEL[cacheStatus]}</dd>
              <dt>سلامت فایل ذخیره</dt>
              <dd>{state.saveHealth}</dd>
              <dt>نسخه‌ی طرح ذخیره</dt>
              <dd>{state.schemaVersion}</dd>
              <dt>کیفیت تصویر</dt>
              <dd>{state.qualityTier}</dd>
              <dt>پشتیبانی سه‌بعدی</dt>
              <dd>{state.webglAvailable ? 'بله' : 'خیر'}</dd>
              <dt>تعداد برچسب‌ها</dt>
              <dd>{state.stickers.length}</dd>
            </dl>
          </details>
        </section>

        <section className="section section--danger">
          <div className="confirm-slot">
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
          </div>
        </section>

        {/* Leaving is a footer, not a resident of the danger zone. */}
        <div className="row">
          <button type="button" className="btn" onClick={onClose} data-testid="parent-close">
            {FA.parentClose}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
