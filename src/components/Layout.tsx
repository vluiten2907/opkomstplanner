import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { TentTree, ChevronDown, LogOut, Users, ShieldCheck, UserRound, RotateCcw, GraduationCap, Check, CloudOff, CloudUpload, TriangleAlert } from 'lucide-react';
import { useRoles } from '../store/roles';
import { useAuth } from '../store/auth';
import { useSpeltak } from '../store/speltak';
import { ACCENTS } from '../lib/model';
import { fromISO, MONTHS } from '../lib/time';
import { lastSpeltak } from '../lib/lastSpeltak';
import ModalHost from './ModalHost';
import { ConfirmBtn } from './ui';
import VerifyNote from './VerifyNote';
import { guardLeave, useUnsaved } from '../store/unsaved';
import { safeLogout, useSaving } from '../store/saving';

/** Opslagstatus in de kopbalk, als icoon met uitleg (vaste breedte: de balk verspringt niet). */
function SaveState() {
  const { queued, busy, last, online } = useSaving();
  const waiting = queued + busy > 0;
  const [cls, icon, txt] = !online ? ['off', <CloudOff key="i" size={17} />, waiting ? 'Niet verbonden – wordt opgeslagen zodra je weer online bent' : 'Niet verbonden']
    : waiting ? ['busy', <CloudUpload key="i" size={17} />, 'Opslaan…']
    : last === 'fail' ? ['fail', <TriangleAlert key="i" size={17} />, 'Niet opgeslagen']
    : last === 'ok' ? ['ok', <Check key="i" size={17} />, 'Opgeslagen'] : ['', null, ''];
  return <span className={'savestate ' + cls} title={txt || undefined}>{icon}<span className="sr-only">{txt}</span></span>;
}

export function applyAccent(accent: string) {
  const A = ACCENTS[accent] || ACCENTS.marine;
  let el = document.getElementById('accentStyle') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'accentStyle'; document.head.appendChild(el); }
  const dark = `--accent:${A.d};--accent-soft:${A.ds};--accent-ink:#0E1210;--pop:${A.popD};`;
  el.textContent = `:root{--accent:${A.l};--accent-soft:${A.ls};--accent-ink:#FFFFFF;--pop:${A.pop}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { sp, sid, loading, denied, offline: noConn, loadError, settings, isTL, isAdmin, isMember, myName, practice, resetPractice, practiceFrom, flushAll } = useSpeltak();
  const { online, queued, busy } = useSaving();
  const roles = useRoles();
  const team = isTL || isAdmin;
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const acctBtn = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  // [pad, label, korte label voor smalle schermen]
  const links: [string, string, string][] = [['dashboard', 'Dashboard', 'Dashboard'], ['jaarplanning', 'Jaarplanning', 'Jaarplanning'], ['bouwer', 'Opkomstbouwer', 'Bouwer'], ['activiteiten', 'Activiteitenbank', 'Activiteiten'], ['opkomsten', 'Opkomstenbank', 'Opkomsten'], ['instellingen', team ? 'Team & instellingen' : 'Instellingen', team ? 'Team' : 'Instellingen']];
  // titel van het tabblad per pagina, bijv. "Jaarplanning · Welpen · Opkomstplanner"
  const page = (links.find(([p]) => p === (pathname.split('/')[3] || 'dashboard')) || [])[1];
  const where = sp ? sp.name || sp.groupName || '' : '';
  useEffect(() => { applyAccent(settings.accent); }, [settings.accent]);
  useEffect(() => { document.title = sp ? [page, where, 'Opkomstplanner'].filter(Boolean).join(' · ') : 'Opkomstplanner'; }, [sp, page, where]);
  useEffect(() => { if (sp && !practice) lastSpeltak.set(sid); }, [sp, sid, practice]);
  useEffect(() => { if (!menu) return; const h = () => setMenu(false); document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [menu]);
  // menu open: focus op het eerste item (ook met de muis, zoals bij elk menu)
  useEffect(() => { if (menu) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, [menu]);
  if (denied) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Geen toegang</h2><p className="hint">Je bent geen lid van deze speltak, of hij bestaat niet meer.</p><button className="btn primary" onClick={() => { lastSpeltak.clearIf(sid); nav('/speltakken'); }}>Mijn speltakken</button></div></div>;
  const reload = <button className="btn primary" onClick={() => window.location.reload()}>Opnieuw laden</button>;
  // nog geen verbinding en de speltak staat niet in de cache: niet "Geen toegang" (en de laatste speltak niet vergeten); laadt vanzelf zodra er verbinding is
  if (noConn && !sp) return <div className="auth-wrap"><div className="card pad stack auth-card" role="status"><h2>Geen verbinding</h2><p className="hint">De speltak kan nu niet worden geladen. We proberen het opnieuw zodra er weer verbinding is.</p><div className="row"><button className="btn" onClick={() => nav('/speltakken')}>Mijn speltakken</button></div></div></div>;
  if (loadError && !sp) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Laden mislukt</h2><p className="hint">De gegevens van deze speltak konden niet worden geladen. Probeer het over een paar minuten opnieuw.</p><div className="row">{reload}</div></div></div>;
  if (loading || !sp) return <div className="loading">Speltak laden…</div>;
  // eerst alles wegschrijven; lukt dat niet (geen verbinding), dan niet zomaar uitloggen
  const doLogout = () => { setMenu(false); return safeLogout(logout, () => nav('/inloggen'), flushAll); };
  // oefenomgeving terugzetten: pas na bevestigen, en eerst vragen als er nog iets niet is opgeslagen
  const reset = () => guardLeave(() => resetPractice?.());
  const initials = (myName || user?.email || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  /** Accountmenu met het toetsenbord: pijltjes, Home/End, Esc sluit en zet de focus terug op de knop, Tab gaat verder en sluit. */
  const menuKey = (ev: ReactKeyboardEvent) => {
    if (!menu) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setMenu(false); acctBtn.current?.focus(); return; }
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])]; if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = ev.key === 'ArrowDown' ? (at + 1) % items.length : ev.key === 'ArrowUp' ? (at - 1 + items.length) % items.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : -1;
    if (to >= 0) { ev.preventDefault(); items[to].focus(); }
  };
  // focus gaat naar iets buiten het menu (Tab): menu dicht. Klikken buiten het menu sluit het via de documentklik.
  const menuBlur = (ev: React.FocusEvent) => { const t = ev.relatedTarget as Node | null; if (menu && t && !ev.currentTarget.contains(t)) setMenu(false); };
  const acctLabel = myName ? `${myName}, account` : 'Account';
  const item = { role: 'menuitem', tabIndex: -1 } as const;
  return <div className="app mx-auto">
    <a className="skiplink" href="#inhoud" onClick={ev => { ev.preventDefault(); document.getElementById('inhoud')?.focus(); }}>Naar inhoud</a>
    <header className="bar flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="brand flex items-center gap-2.5">
        {settings.logo ? <img id="brandLogo" src={settings.logo} alt="" /> : <TentTree size={26} strokeWidth={1.9} />}
        <span className="brand-txt"><span>Opkomstplanner</span><small>{sp.name && <b className="brand-sp">{sp.name}</b>}{sp.groupName && sp.name ? ' · ' : ''}{sp.groupName}</small></span>
      </div>
      <nav className="nav flex min-w-0 flex-1 overflow-x-auto" aria-label="Hoofdmenu">
        {links.map(([p, l, k]) => <NavLink key={p} to={`/s/${sid}/${p}`} onClick={ev => { if (useUnsaved.getState().dirty) { ev.preventDefault(); guardLeave(() => nav(`/s/${sid}/${p}`)); } }}>{k === l ? l : <span className="nl" data-short={k}><span>{l}</span></span>}</NavLink>)}
      </nav>
      <div className="acct" onKeyDown={menuKey} onBlur={menuBlur}>
        <SaveState />
        <button ref={acctBtn} className="btn sm" aria-label={acctLabel} aria-haspopup="menu" aria-expanded={menu} aria-controls={menu ? 'acct-menu' : undefined}
          onClick={e => { e.stopPropagation(); setMenu(m => !m); }}><span className="avatar" aria-hidden="true">{initials}</span><span className="acct-name">{myName || 'Account'}</span><ChevronDown size={14} aria-hidden="true" /></button>
        {menu && practice && <div ref={menuRef} id="acct-menu" className="menu" role="menu" aria-label="Account" onClick={e => e.stopPropagation()}>
          <ConfirmBtn className="" role="menuitem" tabIndex={-1} label={<><RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Opnieuw beginnen</>} confirm="Klik nogmaals: alles terugzetten" onConfirm={() => { setMenu(false); reset(); }} />
          <button {...item} onClick={() => guardLeave(() => nav('/'))}><LogOut size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Oefenen stoppen</button>
        </div>}
        {menu && !practice && <div ref={menuRef} id="acct-menu" className="menu" role="menu" aria-label="Account" onClick={e => e.stopPropagation()}>
          {roles.isAdmin && <button {...item} onClick={() => guardLeave(() => nav('/beheer'))}><ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Beheer</button>}
          <button {...item} onClick={() => guardLeave(() => nav('/account'))}><UserRound size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Mijn account</button>
          <button {...item} onClick={() => guardLeave(() => nav('/speltakken'))}><Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Andere speltak</button>
          <button {...item} onClick={() => guardLeave(doLogout)}><LogOut size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Uitloggen</button>
        </div>}
      </div>
    </header>
    {practice && <div className="demobar oefenbar"><span><GraduationCap size={16} style={{ verticalAlign: -3, marginRight: 6 }} /><b>Oefenomgeving.</b> {practiceFrom
      ? <>Deze voorbeelddata is van {fromISO(practiceFrom).getDate()} {MONTHS[fromISO(practiceFrom).getMonth()]} en loopt achter. Opnieuw beginnen zet alles weer rond vandaag; je wijzigingen gaan dan weg.</>
      : 'Dit is voorbeelddata. Probeer gerust alles uit: wat je verandert, blijft alleen in deze browser.'}</span>
      <div className="row"><ConfirmBtn className="btn sm" label={<><RotateCcw size={14} />Opnieuw beginnen</>} confirm="Klik nogmaals: alles terugzetten" onConfirm={reset} /><button className="btn sm primary" onClick={() => guardLeave(() => nav('/'))}>Stoppen</button></div></div>}
    {practice && <div className="watermark on" aria-hidden="true"><div><b>OEFENEN</b><span>voorbeelddata · niet echt</span></div></div>}
    {!online && <div className="banknote offnote" role="status"><span><CloudOff size={15} style={{ verticalAlign: -3, marginRight: 6 }} /><b>Geen verbinding.</b> {queued + busy > 0 ? 'Je wijzigingen worden opgeslagen zodra je weer online bent. Sluit dit tabblad nog niet.' : 'Wat je verandert, wordt opgeslagen zodra je weer online bent.'}</span></div>}
    {loadError && <div className="banknote offnote" role="alert"><span>Niet alles kon worden geladen. Probeer het over een paar minuten opnieuw.</span><div className="row">{reload}</div></div>}
    {!practice && <VerifyNote />}
    {roles.profile && !(roles.profile.firstName && roles.profile.lastName) && <div className="banknote namenote"><span>Vul je voor- en achternaam in, zodat de beheerder van je groep weet wie je bent.</span><div className="row"><button className="btn sm primary" onClick={() => guardLeave(() => nav('/account'))}>Naar mijn account</button></div></div>}
    {!isMember && isAdmin && <div className="banknote adminnote"><span><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Je bekijkt deze speltak als beheerder: alleen-lezen. Het team beheer je onder Team.</span></div>}
    <main id="inhoud" tabIndex={-1} className="pb-16">{children}</main>
    <ModalHost />
    <div className="aurora pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <span className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full blur-3xl opacity-30 aur-a"></span>
      <span className="absolute -bottom-56 -right-32 h-[30rem] w-[30rem] rounded-full blur-3xl opacity-25 aur-b"></span>
    </div>
  </div>;
}
