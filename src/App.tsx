import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import { SpeltakProvider } from './store/speltak';
import { Toast } from './components/ui';
import Layout from './components/Layout';
import AuthPage from './pages/Auth';
import InvitePage from './pages/Invite';
import SpeltakkenPage from './pages/Speltakken';
import Dashboard from './pages/Dashboard';
import Jaarplanning from './pages/Jaarplanning';
import Bouwer from './pages/Bouwer';
import Activiteitenbank from './pages/Activiteitenbank';
import Opkomstenbank from './pages/Opkomstenbank';
import Instellingen from './pages/Instellingen';
import { configured } from './lib/firebase';

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="loading">Even geduld…</div>;
  if (!user) return <Navigate to="/inloggen" replace />;
  return <>{children}</>;
}
function SpeltakRoutes() {
  const { sid } = useParams();
  return <SpeltakProvider sid={sid!}>
    <Layout>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="jaarplanning" element={<Jaarplanning />} />
        <Route path="bouwer" element={<Bouwer />} />
        <Route path="bouwer/:oid" element={<Bouwer />} />
        <Route path="activiteiten" element={<Activiteitenbank />} />
        <Route path="opkomsten" element={<Opkomstenbank />} />
        <Route path="instellingen" element={<Instellingen />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </Layout>
  </SpeltakProvider>;
}
function Home() {
  const last = localStorage.getItem('opk.sid');
  return <Navigate to={last ? `/s/${last}` : '/speltakken'} replace />;
}
export default function App() {
  if (!configured) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Firebase nog niet ingesteld</h2><p className="hint">Kopieer <code>.env.example</code> naar <code>.env</code>, vul de gegevens van je Firebase-webapp in en start opnieuw.</p></div></div>;
  return <AuthProvider>
    <Routes>
      <Route path="/inloggen" element={<AuthPage mode="login" />} />
      <Route path="/registreren" element={<AuthPage mode="register" />} />
      <Route path="/wachtwoord" element={<AuthPage mode="reset" />} />
      <Route path="/uitnodiging/:token" element={<InvitePage />} />
      <Route path="/speltakken" element={<Gate><SpeltakkenPage /></Gate>} />
      <Route path="/s/:sid/*" element={<Gate><SpeltakRoutes /></Gate>} />
      <Route path="/" element={<Gate><Home /></Gate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <Toast />
  </AuthProvider>;
}
