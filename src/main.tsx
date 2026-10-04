import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { GameProvider } from './app/GameProvider.tsx';
import { FA } from './content/fa/strings.ts';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

// Authoring surface: `?worldbuilder=1` mounts the World Builder instead of
// the game — no reducer boot, no IndexedDB, separate shell. Gated on the
// query param alone (the lazy chunk stays out of the normal game path) so
// the e2e acceptance run can drive it against the production preview build.
const worldBuilderRequested = new URLSearchParams(window.location.search).has('worldbuilder');
const BuilderApp = lazy(() =>
  import('./worldbuilder/BuilderApp.tsx').then((module) => ({ default: module.BuilderApp })),
);

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {worldBuilderRequested ? (
        <Suspense fallback={null}>
          <BuilderApp />
        </Suspense>
      ) : (
        <GameProvider>
          <App />
          {/* Draft-content marker: the educational copy has not been reviewed. */}
          <span className="draft-badge" title={FA.draftBadgeLong}>
            {FA.draftBadge}
          </span>
        </GameProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
