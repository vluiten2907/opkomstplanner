import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { reloadForUpdate } from './lib/reload';
import './styles.css';

// Data-router (nodig voor useBlocker: terugknop met niet-opgeslagen wijzigingen). De routes zelf staan in App.
const router = createBrowserRouter([{ path: '*', element: <App /> }], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  future: { v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true },
});

// Een stukje code van de site is weg (net een nieuwe versie gezet): één keer opnieuw laden haalt de nieuwe versie op.
// Lukt dat niet (al net herladen, of geen verbinding), dan toont de pagina een melding (ErrorBoundary).
window.addEventListener('vite:preloadError', () => { reloadForUpdate(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
);
