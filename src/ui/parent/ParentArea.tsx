import { useState } from 'react';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { SOURCE_RECORDS } from '../../content/sources/records.ts';
import { AUDIO_MANIFEST } from '../../services/audio/manifest.ts';
import type { GameState } from '../../domain/game/types.ts';
import type { CacheStatus } from '../../services/pwa/serviceWorker.ts';

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
  onClose,
  onReset,
}: {
  readonly state: GameState;
  readonly cacheStatus: CacheStatus;
  readonly onClose: () => void;
  readonly onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="layer layer--overlay" data-testid="parent-area">
      <div className="panel column" dir="rtl">
        <h2 className="subtitle">{FA.parentArea}</h2>

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
              : 'دارای مجوز.'}
          </p>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentPrivacy}</h3>
          <p className="text text--soft">{FA.privacyBody}</p>
        </section>

        <section>
          <h3 className="subtitle">{FA.parentInstall}</h3>
          <p className="text text--soft">{FA.installBody}</p>
        </section>

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
