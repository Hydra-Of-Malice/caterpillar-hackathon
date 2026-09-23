import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './ui';

interface State {
  error: Error | null;
}

/** Keeps the frame (rails, header, safety banner) alive if one screen throws while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-6 flex items-start gap-4 border border-outline-variant bg-surface-container p-6">
        <Icon name="build_circle" size={36} className="text-cat-text" />
        <div>
          <div className="font-display text-headline-sm uppercase">This screen could not be drawn</div>
          <p className="text-body-md text-on-surface-variant">The rest of CAT Sentinel keeps running — safety alerts still arrive in the rail above. Detail: {this.state.error.message}</p>
          <div className="mt-3 flex gap-4 font-display text-label-md uppercase">
            <button type="button" className="text-notice-dark underline" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <Link to="/tour" className="text-notice-dark underline">
              Demo tour
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
