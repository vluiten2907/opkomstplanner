import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Vangt een fout tijdens het tekenen van een pagina op, zodat niet de hele app wit wordt.
 * Ook een pagina die niet meer te laden is (na een update van de site, in een tabblad dat al open stond) komt hier:
 * opnieuw laden haalt dan de nieuwe versie op. Naar een andere pagina gaan (`resetKey`) probeert het opnieuw.
 */
export default class ErrorBoundary extends Component<{ resetKey?: string; inline?: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.warn('Pagina kon niet worden getoond:', error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    const card = <div className={'card pad stack auth-card' + (this.props.inline ? ' crash' : '')} role="alert">
      <h2>Er ging iets mis</h2>
      <p className="hint">Deze pagina kon niet worden getoond. Laad hem opnieuw; wat al was opgeslagen, blijft bewaard.</p>
      <div className="row"><button className="btn primary" onClick={() => window.location.reload()}>Opnieuw laden</button></div>
    </div>;
    return this.props.inline ? card : <div className="auth-wrap">{card}</div>;
  }
}
