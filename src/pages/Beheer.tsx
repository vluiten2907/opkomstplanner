import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { TentTree, LogOut, Plus, ShieldCheck, Users, UserPlus, ExternalLink, Link2, ChevronRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { toast } from '../store/toast';
import { applyAccent } from '../components/Layout';
import { ConfirmBtn, Field } from '../components/ui';
import { InviteLink, InviteList, useOpenInvites, type InviteScope } from '../components/Invites';
import { createGroep, createInvite, createSpeltakInGroep, ensureTlIds, isEmail, linkSpeltak, removeGroupAdmin, removeRootPerson, renameGroep, setGroupAdmin, setTeamleider } from '../store/beheer';
import { DEFAULT_LEIDING_PERMS, isTeamleider, type Admin, type Groep, type Invite, type Speltak } from '../lib/types';
import { normSettings } from '../lib/model';
import { plural } from '../lib/time';

const normSp = (id: string, d: any): Speltak => ({ id, name: d.name || '', groupName: d.groupName || '', createdAt: d.createdAt || 0, createdBy: d.createdBy || '',
  settings: normSettings(d.settings), members: d.members || {}, memberIds: d.memberIds || [], gid: d.gid || null, tlIds: Array.isArray(d.tlIds) ? d.tlIds : null });
const err = (e: any, fallback: string) => toast(e?.message === 'last' ? 'Er moet minstens één beheerder overblijven.' : e?.code === 'permission-denied' ? 'Dat mag je niet (of de nieuwe regels staan nog niet in Firebase).' : fallback);

/** Speltakken die je als beheerder mag zien: alles (totaal) of per groep. */
function useSpeltakken(isRoot: boolean, gids: string[]) {
  const key = isRoot ? '*' : gids.join(',');
  const [map, setMap] = useState<Record<string, Speltak[]>>({});
  useEffect(() => {
    setMap({});
    const c = collection(db, 'speltakken');
    const qs = isRoot ? [['*', c] as const] : gids.map(g => [g, query(c, where('gid', '==', g))] as const);
    const stops = qs.map(([k, q]) => onSnapshot(q, s => setMap(m => ({ ...m, [k]: s.docs.map(d => normSp(d.id, d.data())) })), () => setMap(m => ({ ...m, [k]: [] }))));
    return () => stops.forEach(f => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => Object.values(map).flat().sort((a, b) => a.name.localeCompare(b.name, 'nl')), [map]);
}

export default function BeheerPage() {
  const { user, logout } = useAuth();
  const R = useRoles();
  const nav = useNavigate();
  useEffect(() => { applyAccent('marine', ''); document.title = 'Opkomstplanner · Beheer'; }, []);
  const gids = R.groups.map(g => g.id);
  const sps = useSpeltakken(R.isRoot, gids);
  const scopes: InviteScope[] = R.isRoot ? [{ all: true }] : gids.map(gid => ({ gid }));
  const invites = useOpenInvites(R.ready ? scopes : []);
  const me = { uid: user!.uid, name: user?.displayName || user?.email || '', email: user?.email || '' };

  const head = <div className="row between page-head">
    <div className="brand flex items-center gap-2.5"><TentTree size={26} strokeWidth={1.9} /><span className="brand-txt"><span>Opkomstplanner</span><small>{me.name}</small></span></div>
    <div className="row" style={{ gap: 6 }}><Link className="btn ghost sm" to="/speltakken"><Users size={14} />Mijn speltakken</Link><button className="btn ghost sm" onClick={() => logout().then(() => nav('/inloggen'))}><LogOut size={14} />Uitloggen</button></div>
  </div>;
  const wrap = (body: React.ReactNode) => <div className="auth-wrap" style={{ alignItems: 'start' }}><div className="stack beheer" style={{ width: 'min(960px, 100%)', gap: 18 }}>{head}{body}</div></div>;
  if (!R.ready) return wrap(<p className="hint">Laden…</p>);
  if (!R.isAdmin) return wrap(<div className="empty"><span>Je bent geen beheerder. Deze pagina is voor Beheer (totaal) en beheerders van een groep.</span><Link className="btn" to="/speltakken">Mijn speltakken</Link></div>);

  const unlinked = sps.filter(s => !s.gid);
  return wrap(<>
    <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Beheer</h1>
    <p className="hint" style={{ marginTop: -8 }}><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 4 }} />{R.isRoot ? 'Je bent Beheer (totaal): je ziet alle groepen en speltakken.' : `Je beheert ${R.ownGroups.map(g => g.name).join(', ')}.`}</p>
    {R.isRoot && <RootCard me={me} />}
    {R.isRoot && <NewGroup me={me} />}
    {R.isRoot && unlinked.length > 0 && <Unlinked list={unlinked} groups={R.groups} me={me} />}
    {R.groups.map(g => <GroupCard key={g.id} g={g} sps={sps.filter(s => s.gid === g.id)} me={me} canAll={R.isRoot} />)}
    {!R.groups.length && R.isRoot && <div className="empty"><span>Nog geen groepen. Maak hierboven een groep aan en nodig de beheerder uit.</span></div>}
    <section className="card pad stack">
      <div className="row between"><h2>Openstaande uitnodigingen</h2><span className="hint">{plural(invites.length, 'uitnodiging', 'uitnodigingen')}</span></div>
      <InviteList invites={invites} />
    </section>
  </>);
}

type Me = { uid: string; name: string; email: string };

/* ---------- Beheer (totaal) ---------- */
function RootCard({ me }: { me: Me }) {
  const { root } = useRoles();
  const [email, setEmail] = useState(''); const [transfer, setTransfer] = useState(false); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  if (!root) return null;
  const people = Object.entries(root.people);
  const send = async () => {
    if (!isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    setBusy(true);
    try { setInv(await createInvite({ kind: 'totaal', email, transfer }, me)); setEmail(''); } catch (e) { err(e, 'Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  return <section className="card pad stack">
    <div className="row between"><h2>Beheer (totaal)</h2><span className="hint">{plural(people.length, 'persoon', 'personen')}</span></div>
    <PeopleList people={people} me={me.uid} canRemove={true} onRemove={uid => removeRootPerson(uid, root.ids).then(() => toast(uid === me.uid ? 'Je bent afgetreden' : 'Verwijderd')).catch(e => err(e, 'Aanpassen mislukt.'))} />
    <div className="invite stack">
      <h3><UserPlus size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Mede-beheerder (totaal) uitnodigen of je rol overdragen</h3>
      <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres" style={{ flex: '1 1 220px' }} />
        <label className="toggle-inline"><input type="checkbox" checked={transfer} onChange={e => setTransfer(e.target.checked)} />Ik draag mijn rol over</label>
        <button className="btn primary" disabled={busy} onClick={send}><Link2 size={16} />Uitnodigingslink maken</button></div>
      {transfer && <p className="hint">Je blijft beheerder tot de ander de uitnodiging accepteert. Daarna tik je hierboven bij jezelf op Aftreden.</p>}
      {inv && <InviteLink inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
    </div>
  </section>;
}

function PeopleList({ people, me, canRemove, onRemove }: { people: [string, Admin][]; me: string; canRemove: boolean | ((uid: string) => boolean); onRemove: (uid: string) => void }) {
  const last = people.length < 2;
  return <div className="team">{people.map(([uid, p]) => {
    const mine = uid === me;
    const can = !last && (typeof canRemove === 'function' ? canRemove(uid) : canRemove);
    return <div key={uid} className="member"><div className="row between" style={{ flexWrap: 'nowrap' }}>
      <div style={{ minWidth: 0 }}><b>{p.name || p.email}{mine ? ' (jij)' : ''}</b><div className="hint ell">{p.email}</div></div>
      {can && <ConfirmBtn className="btn sm ghost danger" label={mine ? 'Aftreden' : 'Verwijderen'} confirm={mine ? 'Zeker? Aftreden' : 'Zeker?'} onConfirm={() => onRemove(uid)} />}
      {last && mine && <span className="hint" title="Draag je rol eerst over">laatste beheerder</span>}
    </div></div>;
  })}{!people.length && <p className="hint">Nog geen beheerder.</p>}</div>;
}

/* ---------- nieuwe groep ---------- */
function NewGroup({ me }: { me: Me }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  const make = async () => {
    if (!name.trim()) { toast('Vul de naam van de groep in.'); return; }
    if (email.trim() && !isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    setBusy(true);
    try {
      const gid = await createGroep(name, me);
      if (email.trim()) setInv(await createInvite({ kind: 'groep', email, gid, groupName: name.trim() }, me));
      else toast('Groep aangemaakt');
      setName(''); setEmail(''); setOpen(false);
    } catch (e) { err(e, 'Aanmaken mislukt.'); }
    setBusy(false);
  };
  return <div className="stack" style={{ gap: 10 }}>
    {!open ? <div><button className="btn" onClick={() => setOpen(true)}><Plus size={16} />Nieuwe Scouting-groep</button></div>
      : <section className="card pad stack">
        <h2>Nieuwe Scouting-groep</h2>
        <div className="two">
          <Field label="Naam van de groep" htmlFor="ng-name"><input id="ng-name" value={name} onChange={e => setName(e.target.value)} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>
          <Field label="E-mail van de beheerder" htmlFor="ng-email" hint="Krijgt een uitnodiging als Beheer (groep). Mag leeg blijven."><input id="ng-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres" /></Field>
        </div>
        <div className="row"><button className="btn primary" disabled={busy} onClick={make}>Groep aanmaken</button><button className="btn ghost" onClick={() => setOpen(false)}>Annuleren</button></div>
      </section>}
    {inv && <InviteLink inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
  </div>;
}

/* ---------- oude speltakken koppelen ---------- */
function Unlinked({ list, groups, me }: { list: Speltak[]; groups: Groep[]; me: Me }) {
  const [pick, setPick] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const norm = (s: string) => s.trim().toLowerCase();
  const auto = async () => {
    setBusy(true);
    try {
      const made = new Map(groups.map(g => [norm(g.name), g] as const));
      for (const sp of list) {
        const nm = sp.groupName.trim() || 'Groep zonder naam';
        let g = made.get(norm(nm));
        if (!g) { const id = await createGroep(nm, me); g = { id, name: nm, admins: {}, adminIds: [], createdAt: Date.now(), createdBy: me.uid }; made.set(norm(nm), g); }
        await linkSpeltak(sp, g);
      }
      toast(`${plural(list.length, 'speltak', 'speltakken')} gekoppeld`);
    } catch (e) { err(e, 'Koppelen mislukt.'); }
    setBusy(false);
  };
  return <section className="card pad stack">
    <div className="row between"><h2>Nog niet gekoppeld</h2><span className="hint">{plural(list.length, 'speltak', 'speltakken')}</span></div>
    <p className="hint">Deze speltakken bestonden al voor de groepen er waren. Koppel ze aan een groep; teamleiders en leiding houden hun rol.</p>
    <div className="row"><button className="btn primary" disabled={busy} onClick={auto}>Groepen maken op groepsnaam en alles koppelen</button></div>
    <div className="picklist">{list.map(sp => <div key={sp.id} className="pick"><div className="info"><b>{[sp.groupName || 'Zonder groepsnaam', sp.name].join(' · ')}</b>
      <span className="hint">{teamleiders(sp) || 'geen teamleider'} · {plural(sp.memberIds.length, 'lid', 'leden')}</span></div>
      {groups.length > 0 && <div className="row" style={{ gap: 6 }}><select value={pick[sp.id] || ''} onChange={e => setPick(p => ({ ...p, [sp.id]: e.target.value }))} aria-label="Groep kiezen"><option value="">Kies groep…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button className="btn sm" disabled={!pick[sp.id]} onClick={() => { const g = groups.find(x => x.id === pick[sp.id]); if (g) linkSpeltak(sp, g).then(() => toast('Gekoppeld')).catch(e => err(e, 'Koppelen mislukt.')); }}>Koppelen</button></div>}
    </div>)}</div>
  </section>;
}

const teamleiders = (sp: Speltak) => Object.entries(sp.members).filter(([u]) => isTeamleider(sp, u)).map(([, m]) => m.name).join(', ');

/* ---------- een groep ---------- */
function GroupCard({ g, sps, me, canAll }: { g: Groep; sps: Speltak[]; me: Me; canAll: boolean }) {
  const [name, setName] = useState(g.name); useEffect(() => setName(g.name), [g.name]);
  const [email, setEmail] = useState(''); const [transfer, setTransfer] = useState(false); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  const [newSp, setNewSp] = useState(''); const [pick, setPick] = useState('');
  // Standaard ingeklapt; per groep onthouden in deze browser.
  const openKey = 'opk.groep.open.' + g.id;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(openKey) === '1'; } catch { return false; } });
  const toggle = () => setOpen(o => { try { localStorage.setItem(openKey, o ? '0' : '1'); } catch { /* geen opslag */ } return !o; });
  const mine = g.adminIds.includes(me.uid);
  // Bestaande mensen die beheerder kunnen worden: teamleiders en leiding van de speltakken in deze groep, en (Beheer totaal) jijzelf.
  const cands = new Map<string, Admin & { tl: boolean }>();
  if (canAll && !mine) cands.set(me.uid, { name: me.name, email: me.email, since: 0, tl: false });
  sps.forEach(sp => Object.entries(sp.members).forEach(([u, m]) => {
    if (g.adminIds.includes(u)) return;
    const tl = isTeamleider(sp, u) || !!cands.get(u)?.tl;
    cands.set(u, { name: m.name, email: m.email, since: 0, tl });
  }));
  const candList = [...cands.entries()].sort((a, b) => Number(b[0] === me.uid) - Number(a[0] === me.uid) || Number(b[1].tl) - Number(a[1].tl) || a[1].name.localeCompare(b[1].name, 'nl'));
  const appoint = () => { const c = cands.get(pick); if (!c) return;
    setGroupAdmin(g.id, pick, { name: c.name, email: c.email, since: Date.now() }).then(() => { toast(`${pick === me.uid ? 'Je bent' : c.name + ' is'} nu beheerder van ${g.name}`); setPick(''); }).catch(e => err(e, 'Aanstellen mislukt.')); };
  const admins = Object.entries(g.admins).filter(([u]) => g.adminIds.includes(u));
  const saveName = () => { if (name.trim() && name.trim() !== g.name) renameGroep(g, name, sps.map(s => s.id)).then(() => toast('Naam opgeslagen')).catch(e => err(e, 'Opslaan mislukt.')); };
  const send = async () => {
    if (!isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    if (admins.some(([, a]) => a.email === email.trim().toLowerCase())) { toast('Deze persoon is al beheerder.'); return; }
    setBusy(true);
    try { setInv(await createInvite({ kind: 'groep', email, gid: g.id, groupName: g.name, transfer: transfer && mine }, me)); setEmail(''); } catch (e) { err(e, 'Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  const addSp = async () => {
    if (!newSp.trim()) { toast('Vul de naam van de speltak in.'); return; }
    try { await createSpeltakInGroep(g, newSp, me); setNewSp(''); toast('Speltak aangemaakt; nodig nu de teamleider uit.'); } catch (e) { err(e, 'Aanmaken mislukt.'); }
  };
  return <section className={'card pad stack groupcard' + (open ? ' open' : '')}>
    <button type="button" className="gc-head" aria-expanded={open} onClick={toggle}>
      <ChevronRight size={18} className="gc-chev" />
      <b className="ell">{g.name || 'Groep zonder naam'}</b>
      <span className="hint">{plural(sps.length, 'speltak', 'speltakken')}{mine ? ' · jij bent beheerder' : ''}</span>
    </button>
    {open && <>
    <Field label="Naam van de groep" htmlFor={'g-' + g.id}><input id={'g-' + g.id} value={name} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></Field>

    <h3>Beheerders</h3>
    <PeopleList people={admins} me={me.uid} canRemove={uid => canAll || mine || uid === me.uid}
      onRemove={uid => removeGroupAdmin(g, uid).then(() => toast(uid === me.uid ? 'Je bent afgetreden' : 'Verwijderd')).catch(e => err(e, 'Aanpassen mislukt.'))} />
    <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres beheerder" style={{ flex: '1 1 220px' }} />
      {mine && <label className="toggle-inline"><input type="checkbox" checked={transfer} onChange={e => setTransfer(e.target.checked)} />Ik draag mijn rol over</label>}
      <button className="btn" disabled={busy} onClick={send}><UserPlus size={16} />{admins.length ? 'Mede-beheerder uitnodigen' : 'Beheerder uitnodigen'}</button></div>
    {transfer && mine && <p className="hint">Je blijft beheerder tot de ander de uitnodiging accepteert. Daarna tik je bij jezelf op Aftreden.</p>}
    {inv && <InviteLink inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
    {candList.length > 0 && <div className="row"><select value={pick} onChange={e => setPick(e.target.value)} aria-label="Bestaande persoon kiezen" style={{ flex: '1 1 220px' }}>
        <option value="">Of kies iemand die al een account heeft…</option>
        {candList.map(([u, c]) => <option key={u} value={u}>{u === me.uid ? `Mijzelf (${c.name})` : `${c.name}${c.tl ? ' · teamleider' : ''}`}</option>)}
      </select><button className="btn" disabled={!pick} onClick={appoint}><ShieldCheck size={16} />Beheerder maken</button></div>}

    <h3>Speltakken</h3>
    <div className="team">{sps.map(sp => <SpeltakRow key={sp.id} sp={sp} g={g} me={me} />)}{!sps.length && <p className="hint">Nog geen speltakken.</p>}</div>
    <div className="row"><input className="inp" value={newSp} onChange={e => setNewSp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSp(); }} placeholder="Naam nieuwe speltak, bijv. Welpen" list="speltaklist-b" style={{ flex: '1 1 220px' }} />
      <datalist id="speltaklist-b">{['Bevers', 'Welpen', 'Scouts', 'Explorers', 'Roverscouts', 'Stam'].map(x => <option key={x} value={x} />)}</datalist>
      <button className="btn" onClick={addSp}><Plus size={16} />Speltak aanmaken</button></div>
    </>}
  </section>;
}

function SpeltakRow({ sp, g, me }: { sp: Speltak; g: Groep; me: Me }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(''); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'leiding' | 'teamleider'>('leiding');
  const members = Object.entries(sp.members).sort((a, b) => Number(isTeamleider(sp, b[0])) - Number(isTeamleider(sp, a[0])) || a[1].name.localeCompare(b[1].name, 'nl'));
  const tl = teamleiders(sp);
  const send = async () => {
    if (!isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    if (members.some(([, m]) => m.email === email.trim().toLowerCase())) { toast('Deze persoon zit al in het team; maak hem hieronder teamleider.'); return; }
    setBusy(true);
    const k = tl ? kind : 'teamleider';
    try { if (k === 'teamleider') await ensureTlIds(sp); setInv(await createInvite({ kind: k, email, gid: g.id, groupName: g.name, sid: sp.id, speltakName: sp.name, perms: DEFAULT_LEIDING_PERMS }, me)); setEmail(''); } catch (e) { err(e, 'Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  return <div className="member">
    <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div style={{ minWidth: 0, flex: '1 1 200px' }}><b>{sp.name || 'Speltak'}</b><div className="hint">{tl ? `Teamleider: ${tl}` : <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Nog geen teamleider</span>} · {plural(sp.memberIds.length, 'lid', 'leden')}</div></div>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <button className="btn sm ghost" onClick={() => setOpen(o => !o)}>{open ? 'Sluiten' : 'Team'}</button>
        <Link className="btn sm" to={`/s/${sp.id}`} onClick={() => localStorage.setItem('opk.sid', sp.id)}><ExternalLink size={14} />Openen</Link>
      </div>
    </div>
    {open && <div className="stack" style={{ gap: 8, paddingTop: 10 }}>
      {members.map(([uid, m]) => { const isTl = isTeamleider(sp, uid); const lastTl = isTl && (sp.tlIds || []).length < 2 && tl.split(', ').length < 2; return <div key={uid} className="row between subrow" style={{ flexWrap: 'wrap', gap: 6 }}>
        <div style={{ minWidth: 0 }}><b>{m.name}{uid === me.uid ? ' (jij)' : ''}</b><div className="hint ell">{m.email}{m.email ? ' · ' : ''}{isTl ? 'Teamleider' : 'Leiding'}</div></div>
        <div className="row" style={{ gap: 4 }}>
          {isTl ? !lastTl && <button className="btn sm ghost" onClick={() => setTeamleider(sp, uid, false).catch(e => err(e, 'Aanpassen mislukt.'))}>Maak leiding</button>
            : <button className="btn sm ghost" onClick={() => setTeamleider(sp, uid, true).then(() => toast(`${m.name} is teamleider`)).catch(e => err(e, 'Aanpassen mislukt.'))}>Maak teamleider</button>}
          <label className="toggle-inline"><input type="checkbox" checked={g.adminIds.includes(uid)} onChange={e => (e.target.checked
            ? setGroupAdmin(g.id, uid, { name: m.name, email: m.email, since: Date.now() }).then(() => toast(`${m.name} is nu beheerder van ${g.name}`))
            : removeGroupAdmin(g, uid).then(() => toast(`${m.name} is geen beheerder meer`))).catch(er => err(er, 'Aanpassen mislukt.'))} />Beheerder</label>
        </div>
      </div>; })}
      {!members.length && <p className="hint">Nog niemand in het team.</p>}
      {tl ? <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres nieuw lid" style={{ flex: '1 1 220px' }} />
        <select value={kind} onChange={e => setKind(e.target.value as 'leiding' | 'teamleider')} aria-label="Uitnodigen als"><option value="leiding">Leiding</option><option value="teamleider">Teamleider</option></select>
        <button className="btn" disabled={busy} onClick={send}><UserPlus size={16} />Uitnodigen</button></div>
      : <><p className="hint">Nodig eerst de teamleider uit. Daarna kunnen jij en de teamleider leiding uitnodigen.</p>
        <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres teamleider" style={{ flex: '1 1 220px' }} />
        <button className="btn" disabled={busy} onClick={send}><UserPlus size={16} />Teamleider uitnodigen</button></div></>}
      {kind === 'leiding' && tl && <p className="hint">Leiding krijgt standaard de rechten jaarplanning, opkomsten en banken. Aanpassen kan in de speltak bij Instellingen → Team.</p>}
      {inv && <InviteLink inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
    </div>}
  </div>;
}
