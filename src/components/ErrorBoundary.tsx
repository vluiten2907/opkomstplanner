import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isLoadError, isReloading, reloadForUpdate, SETTLE_MS } from '../lib/reload';

type State = { failed: boolean; reloading: boolean };

/**
 * Vangt een fout tijdens het tekenen van een pagina op, zodat niet de hele app wit wordt.
 * Een pagina die niet meer te laden is (na een update van de site, in een tabblad dat al open stond): eerst één keer
 * vanzelf opnieuw laden, dat haalt de nieuwe versie op; lukt het dan nog niet, dan de melding met Opnieuw laden.
 * Naar een andere pagina gaan (`resetKey`) probeert het opnieuw.
 */
export default class ErrorBoundary extends Component<{ resetKey?: string; inline?: boolean; children: ReactNode }, State> {
  state: State = { failed: false, reloading: false };
  timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError(error: unknown): State { return { failed: true, reloading: isLoadError(error) && isReloading() }; }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isLoadError(error) && (this.state.reloading || reloadForUpdate())) {
      if (!this.state.reloading) this.setState({ reloading: true });
      // het herladen werd tegengehouden: dan toch de melding tonen (eerst wordt hooguit SETTLE_MS gewacht op het opslaan)
      clearTimeout(this.timer); this.timer = setTimeout(() => this.setState({ reloading: false }), SETTLE_MS + 4500);
      return;
    }
    console.warn('Pagina kon niet worden getoond:', error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, reloading: false }); }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.reloading) return <div className="loading">Nieuwe versie laden…</div>;
    const card = <div className={'card pad stack auth-card' + (this.props.inline ? ' crash' : '')} role="alert">
      <h2>Er ging iets mis</h2>
      <p className="hint">Deze pagina kon niet worden getoond. Laad hem opnieuw; wat al was opgeslagen, blijft bewaard.</p>
      <div className="row"><button className="btn primary" onClick={() => window.location.reload()}>Opnieuw laden</button></div>
    </div>;
    return this.props.inline ? card : <div className="auth-wrap">{card}</div>;
  }
}
