import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import { RolesProvider, useRoles } from './store/roles';
import { SpeltakProvider } from './store/speltak';
import { Toast } from './components/ui';
import SpeltakPages, { Loading } from './SpeltakPages';
import { configured } from './lib/firebase';
import { LeaveGuard } from './store/unsaved';
// Pagina's worden per stuk geladen, zodat de eerste bundel klein blijft.
const AuthPage = lazy(() => import('./pages/Auth'));
const InvitePage = lazy(() => import('./pages/Invite'));
const SpeltakkenPage = lazy(() => import('./pages/Speltakken'));
const Beheer = lazy(() => import('./pages/Beheer'));
const AccountPage = lazy(() => import('./pages/Account'));
const Oefenen = lazy(() => import('./pages/Oefenen'));

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/inloggen" replace />;
  return <>{children}</>;
}
function SpeltakRoutes() {
  const { sid } = useParams();
  return <SpeltakProvider sid={sid!}><SpeltakPages /></SpeltakProvider>;
}
function Home() {
  const { ready, isAdmin } = useRoles();
  const last = localStorage.getItem('opk.sid');
  if (last) return <Navigate to={`/s/${last}`} replace />;
  if (!ready) return <Loading />;
  return <Navigate to={isAdmin ? '/beheer' : '/speltakken'} replace />;
}
export default function App() {
  if (!configured) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Firebase nog niet ingesteld</h2><p className="hint">Kopieer <code>.env.example</code> naar <code>.env</code>, vul de gegevens van je Firebase-webapp in en start opnieuw.</p></div></div>;
  return <AuthProvider><RolesProvider>
    <Suspense fallback={<Loading />}><Routes>
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
    </Routes></Suspense>
    <Toast />
    <LeaveGuard />
  </RolesProvider></AuthProvider>;
}
