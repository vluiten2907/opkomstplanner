import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, TentTree } from 'lucide-react';
import { useAuth } from '../store/auth';
import { applyAccent } from './Layout';
import { safeLogout } from '../store/saving';

/**
 * Kop van de pagina's buiten een speltak (Mijn speltakken, Beheer, Mijn account):
 * merk met je naam, eigen knoppen en Uitloggen. Zet de standaardkleur en de titel van het tabblad.
 */
export default function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  useEffect(() => { applyAccent('marine'); document.title = title; }, [title]);
  return <div className="row between page-head">
    <div className="brand flex items-center gap-2.5"><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>{user?.displayName || user?.email}</small></span></div>
    <div className="row" style={{ gap: 6 }}>{children}<button className="btn ghost sm" onClick={() => safeLogout(logout, () => nav('/inloggen'))}><LogOut size={14} />Uitloggen</button></div>
  </div>;
}
