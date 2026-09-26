import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { GameProvider } from './app/GameProvider.tsx';
import { FA } from './content/fa/strings.ts';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <GameProvider>
        <App />
        {/* Draft-content marker: the educational copy has not been reviewed. */}
        <span className="draft-badge" title={FA.draftBadgeLong}>
          {FA.draftBadge}
        </span>
      </GameProvider>
    </ErrorBoundary>
  </StrictMode>,
);
