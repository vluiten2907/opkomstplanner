import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TentTree } from 'lucide-react';
import { useAuth, authError, AUTH_BAD_LOGIN, AUTH_WEAK_PW } from '../store/auth';
import { useRoles } from '../store/roles';
import { acceptInvite, alreadyJoined, claimName, forgetInvite, markInviteUsed, nameOwner, readInvite, rememberInvite, saveProfile } from '../store/beheer';
import { Field } from '../components/ui';
import VerifyNote from '../components/VerifyNote';
import { applyAccent } from '../components/Layout';
import { safeLogout } from '../store/saving';
import { auth } from '../lib/firebase';
import { lastSpeltak } from '../lib/lastSpeltak';
import { inviteExpired, inviteWhere, KIND_LABELS, PERM_LABELS, type Invite } from '../lib/types';

/** Uitnodiging openen. Een account aanmaken kan alleen hier, met het e-mailadres van de uitnodiging. */
export default function InvitePage() {
  const { token } = useParams();
  const { user, ready, verified, login, register, logout, sendVerify } = useAuth();
  const { recheck } = useRoles();
  const nav = useNavigate();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState(''); const [pw, setPw] = useState('');
  const [first, setFirst] = useState(''); const [last, setLast] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  // gebruikersnaam die bij het aanmaken is gekozen, voor het toetreden na het bevestigen van het e-mailadres
  const [chosen, setChosen] = useState('');
  // Naam al bezet in deze groep (bijv. een bestaand account uit een andere groep): dan kies je hier een naam voor deze groep.
  const [pick, setPick] = useState<{ taken: string; name: string } | null>(null);
  // Zit je er al in (bijv. direct toegevoegd door de beheerder)? Dan heb je de uitnodiging niet meer nodig.
  const [already, setAlready] = useState(false);
  // standaardkleur (marine), ook als je net uit een speltak met een ander accent komt
  useEffect(() => { applyAccent('marine'); }, []);
  useEffect(() => {
    readInvite(token!).then(i => {
      setInv(i);
      // Open uitnodiging onthouden op dit apparaat (ook als je later via een andere weg inlogt); een ongeldige vergeten.
      if (i && !i.usedBy && !inviteExpired(i)) rememberInvite(i.id); else forgetInvite(token);
    }).catch(() => setInv(null));
  }, [token]);
  /** Je zat er al in: uitnodiging als gebruikt markeren (lukt alleen met bevestigd e-mailadres) en de melding tonen. */
  const settleAlready = (i: Invite, uid: string, isVerified: boolean) => {
    setAlready(true); forgetInvite(i.id);
    if (isVerified) markInviteUsed(i.id, uid).catch(() => {});
  };
  const uid = user?.uid, myMail = (user?.email || '').toLowerCase();
  useEffect(() => {
    if (!inv || !uid || inv.usedBy || inviteExpired(inv) || myMail !== inv.email) return;
    let alive = true;
    alreadyJoined(inv, uid).then(yes => { if (alive && yes) settleAlready(inv, uid, verified); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv, uid, myMail, verified]);
  if (!ready || inv === undefined) return <div className="loading">Uitnodiging ophalen…</div>;
  const box = (body: React.ReactNode) => <div className="auth-wrap"><div className="card pad stack auth-card">
    <div className="brand flex items-center gap-2.5" style={{ paddingBottom: 0 }}><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>voor scoutinggroepen</small></span></div>
    {body}</div></div>;
  if (!inv) return box(<><h2>Uitnodiging niet gevonden</h2><p className="hint">De link klopt niet, is ingetrokken of al gebruikt.</p><Link className="btn" to="/">Naar de start</Link></>);

  const where = inviteWhere(inv, 'de hele Opkomstplanner');
  const intro = <>
    <h2>{inv.invitedByName || 'Iemand'} nodigt je uit</h2>
    <p>Als <b>{KIND_LABELS[inv.kind]}</b> voor <b>{where}</b>.</p>
    {inv.kind === 'leiding' && <p className="hint">Rechten: {Object.entries(inv.perms).filter(([, v]) => v).map(([k]) => PERM_LABELS[k as keyof typeof PERM_LABELS]).join(', ') || 'alleen bekijken'}.</p>}
    {inv.kind === 'leiding' && inv.transfer && <p className="hint">{inv.invitedByName || 'De teamleider'} wil de rol van teamleider aan je overdragen. Dat doet {inv.invitedByName || 'hij'} zodra je in het team zit.</p>}
  </>;
  const used = !!inv.usedBy, expired = inviteExpired(inv);
  // Al lid (zelf deze uitnodiging gebruikt, of er al in gezet): geen fout, maar de weg erheen.
  if (user && (already || inv.usedBy === user.uid)) {
    const open = () => {
      if (inv.sid) { lastSpeltak.set(inv.sid); nav(`/s/${inv.sid}`, { replace: true }); }
      else { if (inv.kind === 'totaal') recheck(); nav('/beheer', { replace: true }); }
    };
    const admin = inv.kind === 'totaal' || inv.kind === 'groep';
    return box(<>
      <h2>{admin ? 'Je bent al beheerder' : 'Je bent al lid'}</h2>
      <p>{inv.kind === 'totaal' ? <>Je bent al <b>Beheer (totaal)</b>.</> : admin ? <>Je beheert <b>{where}</b> al.</> : <>Je zit al in <b>{where}</b>.</>} Deze uitnodiging heb je niet meer nodig.</p>
      <div className="row"><button className="btn primary" onClick={open}>Openen</button></div>
    </>);
  }
  if (used && !user) return box(<>{intro}<p className="hint">Deze uitnodiging is al gebruikt. Heb je hem zelf gebruikt? Log dan in.</p><div className="row"><Link className="btn primary" to="/inloggen">Inloggen</Link></div></>);
  if (used || expired) return box(<>{intro}<p className="hint err">{used ? 'Deze uitnodiging is al gebruikt.' : 'Deze uitnodiging is verlopen. Vraag om een nieuwe.'}</p><Link className="btn" to="/">Naar de start</Link></>);

  const accept = async (u: { uid: string; email: string | null; displayName: string | null; emailVerified?: boolean }, nm?: string) => {
    // Al lid (bijv. intussen direct toegevoegd): niet toetreden (dat weigert Firestore), maar melden dat je er al in zit.
    if (await alreadyJoined(inv, u.uid)) { settleAlready(inv, u.uid, u.emailVerified !== false); return; }
    // Namen zijn uniek binnen een groep (zoals een gebruikersnaam).
    if (inv.gid) await claimName(inv.gid, u.uid, nm || u.displayName || '', inv.id);
    await acceptInvite(inv, { uid: u.uid, name: nm || u.displayName || u.email || 'Leiding', email: u.email || '' });
    forgetInvite(inv.id);
    if (inv.sid) { lastSpeltak.set(inv.sid); nav(`/s/${inv.sid}`, { replace: true }); }
    else {
      // Beheer (totaal) lezen werd vóór het toetreden geweigerd; opnieuw ophalen, anders zie je "geen beheerder" tot herladen
      if (inv.kind === 'totaal') recheck();
      nav('/beheer', { replace: true });
    }
  };
  const taken = `Deze naam is al in gebruik binnen ${inv.groupName || 'de groep'}. Namen zijn uniek binnen een groep; kies een andere, bijvoorbeeld met je speltak erbij.`;
  const joinErr = (e: any) => e?.code === 'name-taken' ? taken : e?.message === 'name-taken' ? '' : e?.code === 'permission-denied' ? 'Toetreden lukt niet: de uitnodiging is al gebruikt, ingetrokken of hoort bij een ander e-mailadres.' : authError(e);
  /** Toetreden mislukt; bij een bezette naam verschijnt het veld om een naam voor deze groep te kiezen. */
  const failJoin = (e: any, tried: string) => {
    if (e?.message === 'name-taken') setPick(p => ({ taken: tried || p?.taken || '', name: p?.name || '' }));
    setErr(joinErr(e));
  };

  // foutmelding: wordt voorgelezen (role=alert) en hoort bij het veld waar het om gaat
  const errLine = err && <p className="hint err" id="i-err" role="alert">{err}</p>;
  const bad = (on: boolean) => on && err ? { 'aria-invalid': true, 'aria-describedby': 'i-err' } as const : {};
  const nameErr = err === taken || err === 'Vul je gebruikersnaam in.', fullErr = err === 'Vul je voor- en achternaam in.';
  const pwErr = err === AUTH_BAD_LOGIN || err === AUTH_WEAK_PW;

  if (!user) {
    const submit = async (e: FormEvent) => {
      e.preventDefault(); setErr(''); setBusy(true);
      try {
        if (mode === 'register') {
          if (!name.trim()) throw { code: 'name' };
          if (!first.trim() || !last.trim()) throw { code: 'fullname' };
          if (inv.gid && await nameOwner(inv.gid, name).catch(() => null)) throw { code: 'name-taken' };
          setChosen(name.trim());
          await register(name, inv.email, pw);
        }
        else await login(inv.email, pw);
        const u = auth.currentUser; if (!u) throw new Error('niet ingelogd');
        // Nieuw account: eerst het e-mailadres bevestigen; daarna treed je toe vanaf het scherm hieronder.
        if (mode === 'register') { await saveProfile(u.uid, inv.email, first, last).catch(() => {}); setBusy(false); return; }
        // Nog niet bevestigd (bijv. een account van vóór de bevestigingsmail, dat er nooit een kreeg): nu een mail sturen.
        // Lukt dat niet (te veel mails), dan kan het later met de knop; inloggen gaat gewoon door.
        if (!u.emailVerified) { await sendVerify().catch(() => {}); setBusy(false); return; }
        await accept(u);
      } catch (e: any) {
        if (e?.code === 'name') setErr('Vul je gebruikersnaam in.');
        else if (e?.code === 'fullname') setErr('Vul je voor- en achternaam in.');
        else failJoin(e, auth.currentUser?.displayName || '');
        setBusy(false);
      }
    };
    return box(<form className="stack" onSubmit={submit}>{intro}
      <Field label="E-mailadres"><input type="email" value={inv.email} readOnly aria-readonly="true" /></Field>
      {mode === 'register' && <div className="two">
        <Field label="Voornaam" htmlFor="i-first"><input id="i-first" value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" {...bad(fullErr && !first.trim())} /></Field>
        <Field label="Achternaam" htmlFor="i-last"><input id="i-last" value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" {...bad(fullErr && !last.trim())} /></Field>
      </div>}
      {mode === 'register' && <Field label="Gebruikersnaam" htmlFor="i-name" hint={`Je naam is je gebruikersnaam binnen ${inv.groupName || 'de groep'}: hij mag er maar één keer voorkomen.`}><input id="i-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Zoals de leiding je kent, bijv. Akela" autoComplete="name" {...bad(nameErr)} /></Field>}
      <Field label={mode === 'register' ? 'Kies een wachtwoord' : 'Wachtwoord'} htmlFor="i-pw"><input id="i-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required {...bad(pwErr)} /></Field>
      {errLine}
      <button className="btn primary" disabled={busy}>{mode === 'register' ? 'Account aanmaken en toetreden' : 'Inloggen en toetreden'}</button>
      <div className="row between" style={{ fontSize: 14 }}>
        {mode === 'register' ? <button type="button" className="linkbtn" onClick={() => { setMode('login'); setErr(''); }}>Ik heb al een account</button>
          : <button type="button" className="linkbtn" onClick={() => { setMode('register'); setErr(''); }}>Nieuw account aanmaken</button>}
        <Link to="/wachtwoord">Wachtwoord vergeten</Link>
      </div>
    </form>);
  }

  const mine = (user.email || '').toLowerCase() === inv.email;
  const join = async () => {
    const u = auth.currentUser || user;
    const nm = pick ? pick.name.trim() : chosen || undefined;
    if (pick && !nm) { setErr(`Kies een naam voor ${inv.groupName || 'de groep'}.`); return; }
    setBusy(true); setErr('');
    try { await accept(u, nm); } catch (e: any) { failJoin(e, nm || u.displayName || ''); setBusy(false); }
  };
  const group = inv.groupName || 'de groep';
  const pickField = pick && <Field label={`Kies een naam voor ${group}`} htmlFor="i-pick" hint={`${pick.taken ? `${pick.taken} is al in gebruik binnen ${group}` : `Deze naam is al in gebruik binnen ${group}`}. Namen zijn uniek binnen een groep; kies er een, bijvoorbeeld met je speltak erbij.`}>
    <input id="i-pick" value={pick.name} maxLength={40} onChange={e => setPick({ ...pick, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') join(); }} placeholder="bijv. Akela Welpen" autoComplete="off" {...bad(true)} /></Field>;
  if (mine && !verified) return box(<>{intro}
    <VerifyNote box onVerified={join} />
    {errLine}
    <div className="row"><button className="btn ghost sm" onClick={() => safeLogout(logout)}>Uitloggen</button></div>
  </>);
  return box(<>{intro}
    {!mine && <p className="hint err">Je bent ingelogd als {user.email}, maar de uitnodiging is voor {inv.email}.</p>}
    {mine && pickField}
    {errLine}
    <div className="row">{mine ? <button className="btn primary" disabled={busy} onClick={join}>Toetreden</button>
      : <button className="btn primary" onClick={() => safeLogout(logout)}>Uitloggen en opnieuw</button>}<Link className="btn ghost" to="/">Niet nu</Link></div>
  </>);
}
