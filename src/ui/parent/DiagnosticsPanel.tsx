import { useEffect, useState } from 'react';
import { FA } from '../../content/fa/strings.ts';
import type { GameState } from '../../domain/game/types.ts';
import { worldDiag } from '../../world/diagnostics.ts';

/**
 * Live technical readout over the running world (`?diagnostics=1`).
 * Parent-facing only: the flag gates both the HUD button and the in-canvas
 * probe that publishes `window.__worldDiag`. Everything here is read on
 * demand — no render-loop instrumentation, no writes into the scene.
 *
 * Under `frameloop="demand"` the canvas only renders when something
 * invalidates it, so "fps" is the honest count of frames drawn in the last
 * sample window: 0 while the scene is still, ~60 while the avatar walks.
 */
interface Snapshot {
  readonly fps: string;
  readonly drawCalls: string;
  readonly triangles: string;
  readonly geometries: string;
  readonly textures: string;
  readonly sceneNodes: string;
  readonly activeEpisodes: string;
}

const SAMPLE_MS = 1000;

export function DiagnosticsPanel({
  state,
  onClose,
}: {
  readonly state: GameState;
  readonly onClose: () => void;
}) {
  const [snap, setSnap] = useState<Snapshot>({
    fps: '—',
    drawCalls: '—',
    triangles: '—',
    geometries: '—',
    textures: '—',
    sceneNodes: '—',
    activeEpisodes: '—',
  });

  useEffect(() => {
    let prevFrames = 0;
    let prevTime = performance.now();
    const id = setInterval(() => {
      const diag = worldDiag();
      const now = performance.now();
      const elapsed = (now - prevTime) / 1000;
      if (!diag) {
        setSnap({
          fps: '—',
          drawCalls: '—',
          triangles: '—',
          geometries: '—',
          textures: '—',
          sceneNodes: '—',
          activeEpisodes: '—',
        });
        prevTime = now;
        return;
      }
      const fps = elapsed > 0 ? (diag.frames - prevFrames) / elapsed : 0;
      prevFrames = diag.frames;
      prevTime = now;
      const info = diag.renderer.info;
      let nodes = 0;
      diag.scene.traverse(() => {
        nodes += 1;
      });
      const episodes = (window as unknown as Record<string, unknown>)['__worldAnimationStats'] as
        { active?: number } | undefined;
      setSnap({
        fps: String(Math.round(fps)),
        drawCalls: String(info.render.calls),
        triangles: String(info.render.triangles),
        geometries: String(info.memory.geometries),
        textures: String(info.memory.textures),
        sceneNodes: String(nodes),
        activeEpisodes: episodes?.active !== undefined ? String(episodes.active) : '—',
      });
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="diag-panel" data-testid="diagnostics-panel" dir="rtl">
      <h3 className="subtitle">{FA.parentDiagnostics}</h3>
      <ul className="text text--soft diag-panel__rows">
        <li data-testid="diag-fps">فریم بر ثانیه (صحنه‌ی زنده): {snap.fps}</li>
        <li data-testid="diag-calls">فراخوان‌های ترسیم: {snap.drawCalls}</li>
        <li data-testid="diag-tris">مثلث‌ها: {snap.triangles}</li>
        <li data-testid="diag-geoms">هندسه‌ها: {snap.geometries}</li>
        <li data-testid="diag-tex">بافت‌ها: {snap.textures}</li>
        <li data-testid="diag-nodes">گره‌های صحنه: {snap.sceneNodes}</li>
        <li data-testid="diag-episodes">پویانمایی فعال: {snap.activeEpisodes}</li>
        <li data-testid="diag-map">نقشه: {state.mapId}</li>
        <li data-testid="diag-save">سلامت فایل ذخیره: {state.saveHealth}</li>
        <li data-testid="diag-tier">کیفیت تصویر: {state.qualityTier}</li>
      </ul>
      <button type="button" className="btn" onClick={onClose} data-testid="diagnostics-close">
        {FA.parentClose}
      </button>
    </div>
  );
}
