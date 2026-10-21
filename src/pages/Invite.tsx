import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { acceptInvite, readInvite } from '../store/speltak';
import type { Invite } from '../lib/types';
import { PERM_LABELS } from '../lib/types';

export default function InvitePage() {
  const { token } = useParams();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!ready || !user) return; readInvite(token!).then(setInv).catch(() => setInv(null)); }, [token, ready, user]);
  if (!ready) return <div className="loading">Even geduld…</div>;
  const next = `/uitnodiging/${token}`;
  if (!user) return <div className="auth-wrap"><div className="card pad stack auth-card">
    <h2>Uitnodiging voor de Opkomstplanner</h2>
    <p className="hint">Log in of maak een account aan met het e-mailadres waarop je bent uitgenodigd.</p>
    <div className="row"><Link className="btn primary" to="/registreren" state={{ next }}>Account aanmaken</Link><Link className="btn" to="/inloggen" state={{ next }}>Inloggen</Link></div>
  </div></div>;
  if (inv === undefined) return <div className="loading">Uitnodiging ophalen…</div>;
  if (!inv) return <div className="auth-wrap"><div className="card pad stack auth-card"><h2>Uitnodiging niet gevonden</h2><p className="hint">De link klopt niet of is al gebruikt.</p><Link className="btn" to="/">Naar mijn speltakken</Link></div></div>;
  const mine = (user.email || '').toLowerCase() === inv.email;
  const accept = async () => {
    setBusy(true); setErr('');
    try { await acceptInvite(inv, user.uid, user.displayName || user.email || 'Leiding', user.email || ''); localStorage.setItem('opk.sid', inv.sid); nav(`/s/${inv.sid}`, { replace: true }); }
    catch (e: any) { setErr(e?.code === 'permission-denied' ? 'Deze uitnodiging is al gebruikt of hoort bij een ander e-mailadres.' : 'Toetreden mislukt. Probeer het opnieuw.'); setBusy(false); }
  };
  return <div className="auth-wrap"><div className="card pad stack auth-card">
    <h2>{inv.invitedByName || 'Een teamleider'} nodigt je uit</h2>
    <p>Voor <b>{[inv.groupName, inv.speltakName].filter(Boolean).join(' · ')}</b> als {inv.role === 'teamleider' ? 'teamleider' : 'leiding'}.</p>
    {inv.role !== 'teamleider' && <p className="hint">Rechten: {Object.entries(inv.perms).filter(([, v]) => v).map(([k]) => PERM_LABELS[k as keyof typeof PERM_LABELS]).join(', ') || 'alleen bekijken'}.</p>}
    {inv.usedBy && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>Deze uitnodiging is al gebruikt.</p>}
    {!mine && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>Je bent ingelogd als {user.email}, maar de uitnodiging is voor {inv.email}. Log in met dat adres.</p>}
    {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
    <div className="row"><button className="btn primary" disabled={!mine || !!inv.usedBy || busy} onClick={accept}>Toetreden</button><Link className="btn ghost" to="/">Niet nu</Link></div>
  </div></div>;
}
