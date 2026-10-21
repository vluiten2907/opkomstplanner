import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';

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
  return <Layout>
    <Suspense fallback={<Loading />}><Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="jaarplanning" element={<Jaarplanning />} />
      <Route path="bouwer" element={<Bouwer />} />
      <Route path="bouwer/:oid" element={<Bouwer />} />
      <Route path="activiteiten" element={<Activiteitenbank />} />
      <Route path="opkomsten" element={<Opkomstenbank />} />
      <Route path="instellingen" element={<Instellingen />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes></Suspense>
  </Layout>;
}
