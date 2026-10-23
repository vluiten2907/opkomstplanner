import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ShieldCheck, UserRound, GraduationCap, Mail } from 'lucide-react';
import { db } from '../lib/firebase';
import { lastSpeltak } from '../lib/lastSpeltak';
import VerifyNote from '../components/VerifyNote';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { forgetInvite, readInvite, savedInvite } from '../store/beheer';
import { inviteExpired, inviteWhere, isTeamleider, KIND_LABELS, normSpeltak, type Invite, type Speltak } from '../lib/types';
import PageHead from '../components/PageHead';

export default function SpeltakkenPage() {
  const { user } = useAuth();
  const { isAdmin, isRoot } = useRoles();
  const nav = useNavigate();
  const [list, setList] = useState<Speltak[] | null>(null);
  // Zonder verbinding meldt Firestore eerst een lege lijst uit de cache: dat is niet "nog geen lid". Wachten op de server.
  const [noConn, setNoConn] = useState(false);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'speltakken'), where('memberIds', 'array-contains', user.uid)), { includeMetadataChanges: true }, s => {
      if (s.metadata?.fromCache && s.empty) { setNoConn(true); return; }
      setNoConn(false); setList(s.docs.map(d => normSpeltak(d.id, d.data())));
    }, () => setList([]));
  }, [user]);
  // Uitnodiging die op dit apparaat is geopend maar nog niet gebruikt (bijv. na het bevestigen via een andere weg ingelogd)
  const [pending, setPending] = useState<Invite | null>(null);
  useEffect(() => {
    const t = savedInvite(); if (!t || !user) return;
    let alive = true;
    readInvite(t).then(i => {
      if (!alive) return;
      if (!i || i.usedBy || inviteExpired(i)) { forgetInvite(t); return; }
      // alleen voor wie hij bedoeld is (op een gedeeld apparaat kan iemand anders ingelogd zijn)
      if (i.email === (user.email || '').toLowerCase()) setPending(i);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
  const invite = pending && !(pending.sid && list?.some(s => s.id === pending.sid)) ? pending : null;
  return <main className="auth-wrap" style={{ alignItems: 'start' }}>
    <div className="stack" style={{ width: 'min(760px, 100%)', gap: 18 }}>
      <PageHead title="Opkomstplanner"><Link className="btn ghost sm" to="/account"><UserRound size={14} />Account</Link></PageHead>
      <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Mijn speltakken</h1>
      <VerifyNote />
      {invite && <div className="banknote invitenote"><span><Mail size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Je hebt een uitnodiging als {KIND_LABELS[invite.kind]} voor <b>{inviteWhere(invite, 'de hele Opkomstplanner')}</b>.</span><div className="row"><Link className="btn sm primary" to={`/uitnodiging/${invite.id}`}>Toetreden</Link></div></div>}
      {isAdmin && <div className="banknote"><span><ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Je bent {isRoot ? 'Beheer (totaal)' : 'beheerder van een groep'}.</span><div className="row"><Link className="btn sm primary" to="/beheer">Naar beheer</Link></div></div>}
      {list === null ? noConn ? <div className="empty" role="status"><span>Geen verbinding. Je speltakken verschijnen zodra er weer verbinding is.</span></div> : <p className="hint">Laden…</p> : list.length ? <div className="picklist">{list.map(s => <div key={s.id} className="pick"><div className="info"><b>{[s.groupName, s.name].filter(Boolean).join(' · ')}</b>
        <span className="hint">{isTeamleider(s, user!.uid) ? 'Teamleider' : 'Leiding'} · {s.memberIds.length || 1} in het team</span></div>
        <button className="btn sm primary" onClick={() => { lastSpeltak.set(s.id); nav(`/s/${s.id}`); }}>Openen</button></div>)}</div>
        : <div className="empty"><span>{isAdmin ? 'Je bent zelf geen lid van een speltak. Via Beheer zie je de speltakken van je groep.' : invite ? 'Je bent nog geen lid van een speltak.' : 'Je bent nog geen lid van een speltak. Heb je een uitnodiging gekregen? Open de link uit die mail nog een keer om toe te treden.'}</span></div>}
      <div className="pick"><div className="info"><b>Oefenomgeving</b><span className="hint">Een voorbeeldspeltak om alles uit te proberen. Je echte speltakken veranderen niet.</span></div>
        <Link className="btn sm" to="/s/oefen"><GraduationCap size={14} />Oefenen</Link></div>
    </div>
  </main>;
}
