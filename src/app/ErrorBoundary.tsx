import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FA } from '../content/fa/strings.ts';

interface State {
  readonly error: Error | null;
}

/** Last-resort child-safe fallback: one calm message and one large restart button. */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local only: no analytics, no network, no third-party reporting.
    console.error('fatal', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="layer" role="alert" data-testid="error-boundary">
        <h1 className="title">{FA.errorTitle}</h1>
        <p className="text">{FA.errorHint}</p>
        <button type="button" className="btn btn--large" onClick={() => window.location.reload()}>
          {FA.errorAction}
        </button>
      </div>
    );
  }
}
