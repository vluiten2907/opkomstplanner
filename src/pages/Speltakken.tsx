import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Plus, TentTree, LogOut } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { createSpeltak } from '../store/speltak';
import { defaultSettings, SPELTAKKEN, ACCENTS } from '../lib/model';
import { Field, TimePicker } from '../components/ui';
import { applyAccent } from '../components/Layout';

export default function SpeltakkenPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [group, setGroup] = useState(''); const [name, setName] = useState('Scouts'); const [day, setDay] = useState(6);
  const [start, setStart] = useState(14 * 60); const [end, setEnd] = useState(16 * 60 + 30); const [accent, setAccent] = useState('marine');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { applyAccent('marine', ''); document.title = 'Opkomstplanner'; }, []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'speltakken'), where('memberIds', 'array-contains', user.uid)), s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [user]);
  const create = async () => {
    if (!group.trim() || !name.trim()) { setErr('Vul de groepsnaam en de speltak in.'); return; }
    if (end <= start) { setErr('De eindtijd moet na de begintijd liggen.'); return; }
    setBusy(true); setErr('');
    try {
      const s = defaultSettings(); Object.assign(s, { defStart: start, defEnd: end, opkDay: day, accent });
      const id = await createSpeltak(user!.uid, user!.displayName || user!.email || 'Teamleider', group.trim(), name.trim(), s);
      localStorage.setItem('opk.sid', id); nav(`/s/${id}`);
    } catch (e: any) { setErr('Aanmaken mislukt: ' + (e?.message || '')); setBusy(false); }
  };
  const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  return <div className="auth-wrap" style={{ alignItems: 'start' }}>
    <div className="stack" style={{ width: 'min(760px, 100%)', gap: 18 }}>
      <div className="row between">
        <div className="brand flex items-center gap-2.5"><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>{user?.displayName || user?.email}</small></span></div>
        <button className="btn ghost sm" onClick={() => logout().then(() => nav('/inloggen'))}><LogOut size={14} />Uitloggen</button>
      </div>
      <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Mijn speltakken</h1>
      {list === null ? <p className="hint">Laden…</p> : list.length ? <div className="picklist">{list.map(s => <div key={s.id} className="pick"><div className="info"><b>{[s.groupName, s.name].filter(Boolean).join(' · ')}</b>
        <span className="hint">{s.members?.[user!.uid]?.role === 'teamleider' ? 'Teamleider' : 'Leiding'} · {s.memberIds?.length || 1} in het team</span></div>
        <button className="btn sm primary" onClick={() => { localStorage.setItem('opk.sid', s.id); nav(`/s/${s.id}`); }}>Openen</button></div>)}</div>
        : <div className="empty"><span>Je bent nog geen lid van een speltak. Maak er een aan als teamleider, of vraag je teamleider om een uitnodiging.</span></div>}
      {!creating ? <div><button className="btn" onClick={() => setCreating(true)}><Plus size={16} />Nieuwe speltak als teamleider</button></div>
        : <div className="card pad stack">
          <h2>Nieuwe speltak</h2>
          <div className="two">
            <Field label="Naam van de groep" htmlFor="n-group"><input id="n-group" value={group} onChange={e => setGroup(e.target.value)} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>
            <Field label="Speltak" htmlFor="n-name"><input id="n-name" list="speltaklist" value={name} onChange={e => setName(e.target.value)} /><datalist id="speltaklist">{SPELTAKKEN.map(x => <option key={x} value={x} />)}</datalist></Field>
            <Field label="Vaste opkomstdag" htmlFor="n-day"><select id="n-day" value={day} onChange={e => setDay(+e.target.value)}>{[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}</select></Field>
            <div className="two"><Field label="Begintijd"><TimePicker value={start} onChange={setStart} from={360} to={1430} /></Field><Field label="Eindtijd"><TimePicker value={end} onChange={setEnd} from={365} to={1435} /></Field></div>
          </div>
          <Field label="Kleur"><div className="accents">{Object.entries(ACCENTS).map(([k, a]) => <button key={k} type="button" className="acc" aria-pressed={accent === k} style={{ ['--c' as any]: a.l }} onClick={() => setAccent(k)}><i />{a.label}</button>)}</div></Field>
          {err && <p className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
          <div className="row"><button className="btn primary" disabled={busy} onClick={create}>Speltak aanmaken</button><button className="btn ghost" onClick={() => setCreating(false)}>Annuleren</button></div>
          <p className="hint">Jij wordt teamleider. Daarna nodig je leiding uit via Team & instellingen.</p>
        </div>}
    </div>
  </div>;
}
