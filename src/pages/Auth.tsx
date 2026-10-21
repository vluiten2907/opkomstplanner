import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { TentTree } from 'lucide-react';
import { useAuth, authError } from '../store/auth';
import { Field } from '../components/ui';

export default function AuthPage({ mode }: { mode: 'login' | 'register' | 'reset' }) {
  const { login, register, reset, user, ready } = useAuth();
  const loc = useLocation();
  const next = (loc.state as any)?.next || '/';
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  // Na inloggen/registreren zet de auth-store de gebruiker; dan sturen we hier door.
  if (ready && user && mode !== 'reset') return <Navigate to={next} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, pw);
      else if (mode === 'register') { if (!name.trim()) throw { code: 'name' }; await register(name, email, pw); }
      else { await reset(email); setDone(true); }
    } catch (e: any) { setErr(e?.code === 'name' ? 'Vul je naam in.' : authError(e)); }
    setBusy(false);
  };
  return <div className="auth-wrap">
    <form className="card pad stack auth-card" onSubmit={submit}>
      <div className="brand flex items-center gap-2.5" style={{ paddingBottom: 0 }}><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>voor scoutinggroepen</small></span></div>
      <h2>{mode === 'login' ? 'Inloggen' : mode === 'register' ? 'Account aanmaken' : 'Wachtwoord vergeten'}</h2>
      {mode === 'register' && <Field label="Je naam" htmlFor="a-name"><input id="a-name" value={name} onChange={e => setName(e.target.value)} placeholder="Zoals de leiding je kent" autoComplete="name" /></Field>}
      <Field label="E-mailadres" htmlFor="a-email"><input id="a-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
      {mode !== 'reset' && <Field label="Wachtwoord" htmlFor="a-pw"><input id="a-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /></Field>}
      {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
      {done && <p className="hint" style={{ color: 'var(--good)', fontWeight: 700 }}>Als dit adres bekend is, staat er een e-mail klaar om een nieuw wachtwoord te kiezen.</p>}
      <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Inloggen' : mode === 'register' ? 'Account aanmaken' : 'E-mail sturen'}</button>
      <div className="row between" style={{ fontSize: 14 }}>
        {mode === 'login' ? <><Link to="/registreren" state={{ next }}>Nieuw account</Link><Link to="/wachtwoord">Wachtwoord vergeten</Link></>
          : <Link to="/inloggen" state={{ next }}>Al een account? Inloggen</Link>}
      </div>
    </form>
  </div>;
}
