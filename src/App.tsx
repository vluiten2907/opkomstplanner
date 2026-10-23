import { lazy, Suspense, useLayoutEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import { RolesProvider, useRoles } from './store/roles';
import { SpeltakProvider } from './store/speltak';
import { Toast } from './components/ui';
import SpeltakPages, { Loading } from './SpeltakPages';
import { configured } from './lib/firebase';
import { lastSpeltak } from './lib/lastSpeltak';
import { LeaveGuard } from './store/unsaved';
import ErrorBoundary from './components/ErrorBoundary';
// Pagina's worden per stuk geladen, zodat de eerste bundel klein blijft.
const AuthPage = lazy(() => import('./pages/Auth'));
const InvitePage = lazy(() => import('./pages/Invite'));
const SpeltakkenPage = lazy(() => import('./pages/Speltakken'));
const Beheer = lazy(() => import('./pages/Beheer'));
const AccountPage = lazy(() => import('./pages/Account'));
const Oefenen = lazy(() => import('./pages/Oefenen'));

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loading />;
  // na het inloggen terug naar de pagina die je wilde openen (bijv. een gedeelde link)
  if (!user) return <Navigate to="/inloggen" replace state={{ next: loc.pathname + loc.search }} />;
  return <>{children}</>;
}
function SpeltakRoutes() {
  const { sid } = useParams();
  // key: een andere speltak (bijv. via de terugknop) begint met een schone staat, zonder gegevens van de vorige
  return <SpeltakProvider key={sid} sid={sid!}><SpeltakPages /></SpeltakProvider>;
}
function Home() {
  const { ready, isAdmin } = useRoles();
  const last = lastSpeltak.get();
  if (last) return <Navigate to={`/s/${last}`} replace />;
  if (!ready) return <Loading />;
  return <Navigate to={isAdmin ? '/beheer' : '/speltakken'} replace />;
}
/**
 * Naar een andere pagina: bovenaan beginnen (de browser houdt anders de oude scrollpositie, bijv. midden in de tijdlijn).
 * Niet bij Terug/Vooruit (de browser zet je dan terug waar je was) en niet met ?focus= (de jaarplanning scrolt zelf naar die rij).
 * Was de focus weg (de knop waarmee je ging bestaat niet meer of is verborgen), dan naar de inhoud, zodat een schermlezer daar verder leest
 * en Tab niet bij het begin van de pagina begint. Een veld met autoFocus op de nieuwe pagina houdt de focus.
 */
function ScrollTop() {
  const { pathname, search } = useLocation(), type = useNavigationType();
  useLayoutEffect(() => {
    if (type === 'POP' || new URLSearchParams(search).has('focus')) return;
    window.scrollTo(0, 0);
    // (weg = niet meer in de pagina, of verborgen omdat de nieuwe pagina nog laadt). Pas na de effecten: een venster dat net
    // dichtging, zet de focus eerst nog terug (en houdt de pagina tot dan onbereikbaar).
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected || !a.getClientRects().length) document.getElementById('inhoud')?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
export default function App() {
  const { pathname } = useLocation();
  if (!configured) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Firebase nog niet ingesteld</h2><p className="hint">Kopieer <code>.env.example</code> naar <code>.env</code>, vul de gegevens van je Firebase-webapp in en start opnieuw.</p></div></div>;
  return <AuthProvider><RolesProvider>
    <ErrorBoundary resetKey={pathname}><Suspense fallback={<Loading />}><Routes>
      <Route path="/inloggen" element={<AuthPage mode="login" />} />
      <Route path="/registreren" element={<Navigate to="/inloggen" replace />} />
      <Route path="/wachtwoord" element={<AuthPage mode="reset" />} />
      <Route path="/uitnodiging/:token" element={<InvitePage />} />
      <Route path="/speltakken" element={<Gate><SpeltakkenPage /></Gate>} />
      <Route path="/beheer" element={<Gate><Beheer /></Gate>} />
      <Route path="/account" element={<Gate><AccountPage /></Gate>} />
      <Route path="/oefenen" element={<Navigate to="/s/oefen" replace />} />
      <Route path="/s/oefen/*" element={<Oefenen />} />
      <Route path="/s/:sid/*" element={<Gate><SpeltakRoutes /></Gate>} />
      <Route path="/" element={<Gate><Home /></Gate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense></ErrorBoundary>
    <ScrollTop />
    <Toast />
    <LeaveGuard />
  </RolesProvider></AuthProvider>;
}
