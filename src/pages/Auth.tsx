import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { GraduationCap, TentTree } from 'lucide-react';
import { useAuth, authError } from '../store/auth';
import { Field } from '../components/ui';

export default function AuthPage({ mode }: { mode: 'login' | 'reset' }) {
  const { login, reset, user, ready } = useAuth();
  const loc = useLocation();
  const next = (loc.state as any)?.next || '/';
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
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
  return <div className="auth-wrap">
    <form className="card pad stack auth-card" onSubmit={submit}>
      <div className="brand flex items-center gap-2.5" style={{ paddingBottom: 0 }}><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>voor scoutinggroepen</small></span></div>
      <h2>{mode === 'login' ? 'Inloggen' : 'Wachtwoord vergeten'}</h2>
      <Field label="E-mailadres" htmlFor="a-email"><input id="a-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
      {mode !== 'reset' && <Field label="Wachtwoord" htmlFor="a-pw"><input id="a-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" minLength={6} required /></Field>}
      {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
      {done && <p className="hint" style={{ color: 'var(--good)', fontWeight: 700 }}>Als dit adres bekend is, staat er een e-mail klaar om een nieuw wachtwoord te kiezen.</p>}
      <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Inloggen' : 'E-mail sturen'}</button>
      <div className="row between" style={{ fontSize: 14 }}>
        {mode === 'login' ? <Link to="/wachtwoord">Wachtwoord vergeten</Link> : <Link to="/inloggen" state={{ next }}>Terug naar inloggen</Link>}
      </div>
      {mode === 'login' && <p className="hint">Nog geen account? Dat maak je aan via de uitnodigingslink die je van je teamleider of beheerder krijgt.</p>}
      {mode === 'login' && <div className="oefenlink"><span className="hint">Eerst rondkijken? Probeer alles uit met voorbeelddata, zonder account.</span><Link className="btn" to="/s/oefen"><GraduationCap size={16} />Oefenomgeving</Link></div>}
    </form>
  </div>;
}
