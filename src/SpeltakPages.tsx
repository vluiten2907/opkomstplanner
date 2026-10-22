import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Pagina's worden per stuk geladen, zodat de eerste bundel klein blijft.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jaarplanning = lazy(() => import('./pages/Jaarplanning'));
const Bouwer = lazy(() => import('./pages/Bouwer'));
const Activiteitenbank = lazy(() => import('./pages/Activiteitenbank'));
const Opkomstenbank = lazy(() => import('./pages/Opkomstenbank'));
const Instellingen = lazy(() => import('./pages/Instellingen'));

export const Loading = () => <div className="loading">Even geduld…</div>;

/** De pagina's binnen een speltak (ook gebruikt door de oefenomgeving). */
export default function SpeltakPages() {
  const { pathname } = useLocation();
  // een fout op één pagina: de kopbalk blijft staan, en naar een andere pagina gaan probeert het opnieuw
  return <Layout>
    <ErrorBoundary resetKey={pathname} inline><Suspense fallback={<Loading />}><Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="jaarplanning" element={<Jaarplanning />} />
      <Route path="bouwer" element={<Bouwer />} />
      <Route path="bouwer/:oid" element={<Bouwer />} />
      <Route path="activiteiten" element={<Activiteitenbank />} />
      <Route path="opkomsten" element={<Opkomstenbank />} />
      <Route path="instellingen" element={<Instellingen />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes></Suspense></ErrorBoundary>
  </Layout>;
}
