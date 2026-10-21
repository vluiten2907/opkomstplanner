import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { TentTree, ChevronDown, LogOut, Users, ShieldCheck } from 'lucide-react';
import { useRoles } from '../store/roles';
import { useAuth } from '../store/auth';
import { useSpeltak } from '../store/speltak';
import { ACCENTS } from '../lib/model';
import ModalHost from './ModalHost';

export function applyAccent(accent: string, logo: string) {
  const A = ACCENTS[accent] || ACCENTS.marine;
  let el = document.getElementById('accentStyle') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'accentStyle'; document.head.appendChild(el); }
  const dark = `--accent:${A.d};--accent-soft:${A.ds};--accent-ink:#0E1210;--pop:${A.popD};`;
  el.textContent = `:root{--accent:${A.l};--accent-soft:${A.ls};--accent-ink:#FFFFFF;--pop:${A.pop}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
  void logo;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { sp, sid, loading, denied, settings, isTL, isAdmin, isMember, myName } = useSpeltak();
  const roles = useRoles();
  const team = isTL || isAdmin;
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  useEffect(() => { applyAccent(settings.accent, settings.logo); document.title = sp ? `Opkomstplanner · ${sp.groupName || ''} ${sp.name || ''}`.trim() : 'Opkomstplanner'; }, [settings.accent, settings.logo, sp]);
  useEffect(() => { if (sp) localStorage.setItem('opk.sid', sid); }, [sp, sid]);
  useEffect(() => { if (!menu) return; const h = () => setMenu(false); document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [menu]);
  if (denied) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Geen toegang</h2><p className="hint">Je bent geen lid van deze speltak, of hij bestaat niet meer.</p><button className="btn primary" onClick={() => { localStorage.removeItem('opk.sid'); nav('/speltakken'); }}>Mijn speltakken</button></div></div>;
  if (loading || !sp) return <div className="loading">Speltak laden…</div>;
  const initials = (myName || user?.email || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  // [pad, label, korte label voor smalle schermen]
  const links: [string, string, string][] = [['dashboard', 'Dashboard', 'Dashboard'], ['jaarplanning', 'Jaarplanning', 'Jaarplanning'], ['bouwer', 'Opkomstbouwer', 'Bouwer'], ['activiteiten', 'Activiteitenbank', 'Activiteiten'], ['opkomsten', 'Opkomstenbank', 'Opkomsten'], ['instellingen', team ? 'Team & instellingen' : 'Instellingen', team ? 'Team' : 'Instellingen']];
  return <div className="app mx-auto">
    <header className="bar flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="brand flex items-center gap-2.5">
        {settings.logo ? <img id="brandLogo" src={settings.logo} alt="" /> : <TentTree size={26} strokeWidth={1.9} />}
        <span className="brand-txt"><span>Opkomstplanner</span><small>{[sp.groupName, sp.name].filter(Boolean).join(' · ')}</small></span>
      </div>
      <nav className="nav flex min-w-0 flex-1 overflow-x-auto" aria-label="Hoofdmenu">
        {links.map(([p, l, k]) => <NavLink key={p} to={`/s/${sid}/${p}`}>{k === l ? l : <span className="nl" data-short={k}><span>{l}</span></span>}</NavLink>)}
      </nav>
      <div className="acct">
        <button className="btn sm" aria-label="Account" onClick={e => { e.stopPropagation(); setMenu(m => !m); }}><span className="avatar">{initials}</span><span className="acct-name">{myName || 'Account'}</span><ChevronDown size={14} /></button>
        {menu && <div className="menu" onClick={e => e.stopPropagation()}>
          {roles.isAdmin && <button onClick={() => nav('/beheer')}><ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Beheer</button>}
          <button onClick={() => nav('/speltakken')}><Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Andere speltak</button>
          <button onClick={() => logout().then(() => nav('/inloggen'))}><LogOut size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Uitloggen</button>
        </div>}
      </div>
    </header>
    {!isMember && isAdmin && <div className="banknote adminnote"><span><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Je bekijkt deze speltak als beheerder: alleen-lezen. Het team beheer je onder Team.</span></div>}
    <main className="pb-16">{children}</main>
    <ModalHost />
    <div className="aurora pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <span className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full blur-3xl opacity-30 aur-a"></span>
      <span className="absolute -bottom-56 -right-32 h-[30rem] w-[30rem] rounded-full blur-3xl opacity-25 aur-b"></span>
    </div>
  </div>;
}
