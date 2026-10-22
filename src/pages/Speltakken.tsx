import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { TentTree, LogOut, ShieldCheck, UserRound, GraduationCap } from 'lucide-react';
import { db } from '../lib/firebase';
import VerifyNote from '../components/VerifyNote';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { isTeamleider } from '../lib/types';
import { applyAccent } from '../components/Layout';

export default function SpeltakkenPage() {
  const { user, logout } = useAuth();
  const { isAdmin, isRoot } = useRoles();
  const nav = useNavigate();
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { applyAccent('marine', ''); document.title = 'Opkomstplanner'; }, []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'speltakken'), where('memberIds', 'array-contains', user.uid)), s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [user]);
  return <div className="auth-wrap" style={{ alignItems: 'start' }}>
    <div className="stack" style={{ width: 'min(760px, 100%)', gap: 18 }}>
      <div className="row between page-head">
        <div className="brand flex items-center gap-2.5"><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>{user?.displayName || user?.email}</small></span></div>
        <div className="row" style={{ gap: 6 }}><Link className="btn ghost sm" to="/account"><UserRound size={14} />Account</Link><button className="btn ghost sm" onClick={() => logout().then(() => nav('/inloggen'))}><LogOut size={14} />Uitloggen</button></div>
      </div>
      <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Mijn speltakken</h1>
      <VerifyNote />
      {isAdmin && <div className="banknote"><span><ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Je bent {isRoot ? 'Beheer (totaal)' : 'beheerder van een groep'}.</span><div className="row"><Link className="btn sm primary" to="/beheer">Naar beheer</Link></div></div>}
      {list === null ? <p className="hint">Laden…</p> : list.length ? <div className="picklist">{list.map(s => <div key={s.id} className="pick"><div className="info"><b>{[s.groupName, s.name].filter(Boolean).join(' · ')}</b>
        <span className="hint">{isTeamleider({ tlIds: Array.isArray(s.tlIds) ? s.tlIds : null, members: s.members || {} }, user!.uid) ? 'Teamleider' : 'Leiding'} · {s.memberIds?.length || 1} in het team</span></div>
        <button className="btn sm primary" onClick={() => { localStorage.setItem('opk.sid', s.id); nav(`/s/${s.id}`); }}>Openen</button></div>)}</div>
        : <div className="empty"><span>{isAdmin ? 'Je bent zelf geen lid van een speltak. Via Beheer zie je de speltakken van je groep.' : 'Je bent nog geen lid van een speltak. Vraag je teamleider om een uitnodigingslink.'}</span></div>}
      <div className="pick"><div className="info"><b>Oefenomgeving</b><span className="hint">Een voorbeeldspeltak om alles uit te proberen. Je echte speltakken veranderen niet.</span></div>
        <Link className="btn sm" to="/s/oefen"><GraduationCap size={14} />Oefenen</Link></div>
    </div>
  </div>;
}
