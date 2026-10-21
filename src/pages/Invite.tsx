import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TentTree } from 'lucide-react';
import { useAuth, authError } from '../store/auth';
import { acceptInvite, readInvite } from '../store/beheer';
import { Field } from '../components/ui';
import { auth } from '../lib/firebase';
import { inviteExpired, KIND_LABELS, PERM_LABELS, type Invite } from '../lib/types';

/** Uitnodiging openen. Een account aanmaken kan alleen hier, met het e-mailadres van de uitnodiging. */
export default function InvitePage() {
  const { token } = useParams();
  const { user, ready, login, register, logout } = useAuth();
  const nav = useNavigate();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { readInvite(token!).then(setInv).catch(() => setInv(null)); }, [token]);
  if (!ready || inv === undefined) return <div className="loading">Uitnodiging ophalen…</div>;
  const box = (body: React.ReactNode) => <div className="auth-wrap"><div className="card pad stack auth-card">
    <div className="brand flex items-center gap-2.5" style={{ paddingBottom: 0 }}><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>voor scoutinggroepen</small></span></div>
    {body}</div></div>;
  if (!inv) return box(<><h2>Uitnodiging niet gevonden</h2><p className="hint">De link klopt niet, is ingetrokken of al gebruikt.</p><Link className="btn" to="/">Naar de start</Link></>);

  const where = inv.kind === 'totaal' ? 'de hele Opkomstplanner' : inv.kind === 'groep' ? inv.groupName : [inv.groupName, inv.speltakName].filter(Boolean).join(' · ');
  const intro = <>
    <h2>{inv.invitedByName || 'Iemand'} nodigt je uit</h2>
    <p>Als <b>{KIND_LABELS[inv.kind]}</b> voor <b>{where}</b>.</p>
    {inv.kind === 'leiding' && <p className="hint">Rechten: {Object.entries(inv.perms).filter(([, v]) => v).map(([k]) => PERM_LABELS[k as keyof typeof PERM_LABELS]).join(', ') || 'alleen bekijken'}.</p>}
  </>;
  const used = !!inv.usedBy, expired = inviteExpired(inv);
  if (used || expired) return box(<>{intro}<p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{used ? 'Deze uitnodiging is al gebruikt.' : 'Deze uitnodiging is verlopen. Vraag om een nieuwe.'}</p><Link className="btn" to="/">Naar de start</Link></>);

  const accept = async (u: { uid: string; email: string | null; displayName: string | null }, nm?: string) => {
    await acceptInvite(inv, { uid: u.uid, name: nm || u.displayName || u.email || 'Leiding', email: u.email || '' });
    if (inv.sid) { localStorage.setItem('opk.sid', inv.sid); nav(`/s/${inv.sid}`, { replace: true }); }
    else nav('/beheer', { replace: true });
  };
  const joinErr = (e: any) => e?.code === 'permission-denied' ? 'Toetreden lukt niet: de uitnodiging is al gebruikt, ingetrokken of hoort bij een ander e-mailadres.' : authError(e);

  if (!user) {
    const submit = async (e: FormEvent) => {
      e.preventDefault(); setErr(''); setBusy(true);
      try {
        if (mode === 'register') { if (!name.trim()) throw { code: 'name' }; await register(name, inv.email, pw); }
        else await login(inv.email, pw);
        const u = auth.currentUser; if (!u) throw new Error('niet ingelogd');
        await accept(u, mode === 'register' ? name.trim() : undefined);
      } catch (e: any) { setErr(e?.code === 'name' ? 'Vul je naam in.' : joinErr(e)); setBusy(false); }
    };
    return box(<form className="stack" onSubmit={submit}>{intro}
      <Field label="E-mailadres"><input type="email" value={inv.email} readOnly aria-readonly="true" /></Field>
      {mode === 'register' && <Field label="Je naam" htmlFor="i-name"><input id="i-name" value={name} onChange={e => setName(e.target.value)} placeholder="Zoals de leiding je kent" autoComplete="name" /></Field>}
      <Field label={mode === 'register' ? 'Kies een wachtwoord' : 'Wachtwoord'} htmlFor="i-pw"><input id="i-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required /></Field>
      {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
      <button className="btn primary" disabled={busy}>{mode === 'register' ? 'Account aanmaken en toetreden' : 'Inloggen en toetreden'}</button>
      <div className="row between" style={{ fontSize: 14 }}>
        {mode === 'register' ? <button type="button" className="linkbtn" onClick={() => { setMode('login'); setErr(''); }}>Ik heb al een account</button>
          : <button type="button" className="linkbtn" onClick={() => { setMode('register'); setErr(''); }}>Nieuw account aanmaken</button>}
        <Link to="/wachtwoord">Wachtwoord vergeten</Link>
      </div>
    </form>);
  }

  const mine = (user.email || '').toLowerCase() === inv.email;
  const join = async () => { setBusy(true); setErr(''); try { await accept(user); } catch (e: any) { setErr(joinErr(e)); setBusy(false); } };
  return box(<>{intro}
    {!mine && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>Je bent ingelogd als {user.email}, maar de uitnodiging is voor {inv.email}.</p>}
    {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
    <div className="row">{mine ? <button className="btn primary" disabled={busy} onClick={join}>Toetreden</button>
      : <button className="btn primary" onClick={() => logout()}>Uitloggen en opnieuw</button>}<Link className="btn ghost" to="/">Niet nu</Link></div>
  </>);
}
