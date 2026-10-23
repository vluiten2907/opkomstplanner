import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { CalendarDays, FileText, GraduationCap, ListTree, TentTree } from 'lucide-react';
import { useAuth, authError } from '../store/auth';
import { Field } from '../components/ui';
import { applyAccent } from '../components/Layout';

export default function AuthPage({ mode }: { mode: 'login' | 'reset' }) {
  const { login, reset, user, ready } = useAuth();
  const loc = useLocation();
  const next = (loc.state as any)?.next || '/';
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const heading = mode === 'login' ? 'Inloggen' : 'Wachtwoord vergeten';
  // standaardkleur (marine), ook als je net uit een speltak met een ander accent komt
  useEffect(() => { applyAccent('marine'); document.title = heading + ' · Opkomstplanner'; }, [heading]);
  // Na inloggen/registreren zet de auth-store de gebruiker; dan sturen we hier door.
  if (ready && user && mode !== 'reset') return <Navigate to={next} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, pw);
      else { await reset(email); setDone(true); }
    } catch (e: any) { setErr(authError(e)); }
    setBusy(false);
  };
  // foutmelding: wordt voorgelezen (role=alert) en hoort bij de velden
  const errProps = err ? { 'aria-invalid': true, 'aria-describedby': 'a-err' } as const : {};
  return <main className="auth-wrap">
    <div className="auth-split">
    <form className="card pad stack auth-card" onSubmit={submit}>
      <div className="brand flex items-center gap-2.5" style={{ paddingBottom: 0 }}><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>voor scoutinggroepen</small></span></div>
      <h1 className="auth-h">{heading}</h1>
      <Field label="E-mailadres" htmlFor="a-email"><input id="a-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required {...errProps} /></Field>
      {mode !== 'reset' && <Field label="Wachtwoord" htmlFor="a-pw"><input id="a-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" minLength={6} required {...errProps} /></Field>}
      {err && <p className="hint err" id="a-err" role="alert">{err}</p>}
      {done && <p className="hint" style={{ color: 'var(--good)', fontWeight: 700 }}>Als dit adres bekend is, staat er een e-mail klaar om een nieuw wachtwoord te kiezen. Niets ontvangen? Kijk ook in je spammap.</p>}
      <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Inloggen' : 'E-mail sturen'}</button>
      <div className="row between" style={{ fontSize: 14 }}>
        {mode === 'login' ? <Link to="/wachtwoord" state={{ next }}>Wachtwoord vergeten</Link> : <Link to="/inloggen" state={{ next }}>Terug naar inloggen</Link>}
      </div>
      {mode === 'login' && <p className="hint">Nog geen account? Dat maak je aan via de uitnodigingslink die je van je teamleider of beheerder krijgt.</p>}
      {mode === 'login' && <div className="oefenlink"><span className="hint">Eerst rondkijken? Probeer alles uit met voorbeelddata, zonder account.</span><Link className="btn" to="/s/oefen"><GraduationCap size={16} />Oefenomgeving</Link></div>}
    </form>
    {/* wat de app doet; op de telefoon onder het formulier, breed ernaast */}
    {mode === 'login' && <section className="auth-pitch" aria-label="Over de Opkomstplanner">
      <p className="pitch-h">Jaarplanning, opkomsten en kampen voor je hele speltak, op één plek.</p>
      <ul className="pitch-cards">
        <li><span className="pi" aria-hidden="true"><CalendarDays /></span><b>Jaarplanning</b><span>Onderwerp en planning per opkomst</span></li>
        <li><span className="pi pop" aria-hidden="true"><ListTree /></span><b>Opkomst bouwen</b><span>Programma per 5 minuten</span></li>
        <li><span className="pi ink" aria-hidden="true"><FileText /></span><b>PDF voor de leiding</b><span>Wie doet wat, op papier</span></li>
      </ul>
    </section>}
    </div>
  </main>;
}
