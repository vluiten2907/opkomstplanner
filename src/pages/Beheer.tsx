import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Plus, ShieldCheck, Users, UserPlus, ExternalLink, Link2, ChevronRight, Trash2, UserRound } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { toast } from '../store/toast';
import PageHead from '../components/PageHead';
import { ConfirmBtn, Field } from '../components/ui';
import { InviteLink, InviteList, useOpenInvites, type InviteScope } from '../components/Invites';
import { addMember, setPerms, claimName, releaseName, syncNames, createGroep, newGroepId, createInvite, createSpeltakInGroep, deleteSpeltak, deleteGroep, countOpkomsten, ensureTlIds, findAccount, readAccounts, removeFromTeam, type AccountInfo, transferTeamleider, type Person, isEmail, linkSpeltak, removeGroupAdmin, removeRootPerson, renameGroep, setGroupAdmin, setTeamleider } from '../store/beheer';
import { DEFAULT_LEIDING_PERMS, PERM_LABELS, normPerms, normSpeltak, isTeamleider, type Admin, type Member, type PermKey, type Groep, type Invite, type Speltak } from '../lib/types';
import { plural } from '../lib/time';

const err = (e: any, fallback: string) => toast(e?.message === 'last' ? 'Er moet minstens één beheerder overblijven.' : e?.message === 'name-taken' ? 'Er is al iemand met deze naam in de groep. Namen zijn uniek binnen een groep.' : e?.code === 'permission-denied' ? 'Dat mag je niet (of de nieuwe regels staan nog niet in Firebase).' : fallback);

/** Open of dicht, onthouden in deze browser (standaard dicht). */
function useStoredToggle(key: string) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const toggle = () => setOn(o => { try { localStorage.setItem(key, o ? '0' : '1'); } catch { /* geen opslag */ } return !o; });
  return [on, toggle] as const;
}

/** Speltakken die je als beheerder mag zien: alles (totaal) of per groep. */
function useSpeltakken(isRoot: boolean, gids: string[]) {
  const key = isRoot ? '*' : gids.join(',');
  const [map, setMap] = useState<Record<string, Speltak[]>>({});
  useEffect(() => {
    setMap({});
    const c = collection(db, 'speltakken');
    const qs = isRoot ? [['*', c] as const] : gids.map(g => [g, query(c, where('gid', '==', g))] as const);
    const stops = qs.map(([k, q]) => onSnapshot(q, s => setMap(m => ({ ...m, [k]: s.docs.map(d => normSpeltak(d.id, d.data())) })), () => setMap(m => ({ ...m, [k]: [] }))));
    return () => stops.forEach(f => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => Object.values(map).flat().sort((a, b) => a.name.localeCompare(b.name, 'nl')), [map]);
}

export default function BeheerPage() {
  const { user } = useAuth();
  const R = useRoles();
  const gids = R.groups.map(g => g.id);
  const sps = useSpeltakken(R.isRoot, gids);
  const scopes: InviteScope[] = R.isRoot ? [{ all: true }] : gids.map(gid => ({ gid }));
  const invites = useOpenInvites(R.ready ? scopes : []);
  const [gone, setGone] = useState<Gone | null>(null);
  const me = { uid: user!.uid, name: user?.displayName || user?.email || '', email: user?.email || '' };

  const head = <PageHead title="Opkomstplanner · Beheer"><Link className="btn ghost sm" to="/speltakken"><Users size={14} />Mijn speltakken</Link><Link className="btn ghost sm" to="/account"><UserRound size={14} />Account</Link></PageHead>;
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
    {gone && <GoneCard gone={gone} onClose={() => setGone(null)} />}
    {R.groups.map(g => <GroupCard key={g.id} g={g} sps={sps.filter(s => s.gid === g.id)} me={me} canAll={R.isRoot} allSps={sps} groups={R.groups} onGone={setGone} />)}
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
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const make = async () => {
    if (!name.trim()) { toast('Vul de naam van de groep in.'); return; }
    setBusy(true);
    try {
      const gid = newGroepId();
      try { localStorage.setItem('opk.groep.open.' + gid, '1'); } catch { /* geen opslag */ }
      await createGroep(name, me, gid);
      toast('Groep aangemaakt. Maak nu een speltak en nodig de teamleider uit.');
      setName(''); setOpen(false);
    } catch (e) { err(e, 'Aanmaken mislukt.'); }
    setBusy(false);
  };
  return <div className="stack" style={{ gap: 10 }}>
    {!open ? <div><button className="btn" onClick={() => setOpen(true)}><Plus size={16} />Nieuwe Scouting-groep</button></div>
      : <section className="card pad stack">
        <h2>Nieuwe Scouting-groep</h2>
        <Field label="Naam van de groep" htmlFor="ng-name" hint="Daarna maak je de speltakken en nodig je de teamleiders uit. Een beheerder van de groep kies je uit de leiding."><input id="ng-name" value={name} onChange={e => setName(e.target.value)} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>
        <div className="row"><button className="btn primary" disabled={busy} onClick={make}>Groep aanmaken</button><button className="btn ghost" onClick={() => setOpen(false)}>Annuleren</button></div>
      </section>}
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
function GroupCard({ g, sps, me, canAll, allSps, groups, onGone }: { g: Groep; sps: Speltak[]; me: Me; canAll: boolean; allSps: Speltak[]; groups: Groep[]; onGone: (x: Gone) => void }) {
  const [name, setName] = useState(g.name); useEffect(() => setName(g.name), [g.name]);
  const [newSp, setNewSp] = useState(''); const [pick, setPick] = useState('');
  // Standaard ingeklapt; per groep onthouden in deze browser.
  const [open, toggle] = useStoredToggle('opk.groep.open.' + g.id);
  const mine = g.adminIds.includes(me.uid);
  // Beheerder van de groep kan alleen iemand worden die al leiding is in een speltak van deze groep.
  const cands = new Map<string, Admin & { tl: boolean }>();
  sps.forEach(sp => Object.entries(sp.members).forEach(([u, m]) => {
    if (g.adminIds.includes(u)) return;
    const tl = isTeamleider(sp, u) || !!cands.get(u)?.tl;
    cands.set(u, { name: m.name, email: m.email, since: 0, tl });
  }));
  const candList = [...cands.entries()].sort((a, b) => Number(b[0] === me.uid) - Number(a[0] === me.uid) || Number(b[1].tl) - Number(a[1].tl) || a[1].name.localeCompare(b[1].name, 'nl'));
  const appoint = () => { const c = cands.get(pick); if (!c) return;
    setGroupAdmin(g.id, pick, { name: c.name, email: c.email, since: Date.now() }).then(() => { toast(`${pick === me.uid ? 'Je bent' : c.name + ' is'} nu beheerder van ${g.name}`); setPick(''); }).catch(e => err(e, 'Aanstellen mislukt.')); };
  const admins = Object.entries(g.admins).filter(([u]) => g.adminIds.includes(u));
  // Iedereen met een account die we in deze groep kennen: jijzelf, beheerders en leiding van alle speltakken.
  const pool = useMemo(() => {
    const m = new Map<string, Person>([[me.uid, { uid: me.uid, name: me.name, email: me.email }]]);
    Object.entries(g.admins).forEach(([u, a]) => { if (g.adminIds.includes(u)) m.set(u, { uid: u, name: a.name, email: a.email }); });
    sps.forEach(sp => Object.entries(sp.members).forEach(([u, x]) => m.set(u, { uid: u, name: x.name, email: x.email })));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }, [g, sps, me.uid, me.name, me.email]);
  const names = useFullNames(sps);
  // Namen zijn uniek binnen de groep: wie al in een speltak zit, krijgt zijn naam vastgelegd.
  const namesKey = sps.map(sp => Object.entries(sp.members).map(([u, x]) => u + ':' + x.name).sort().join(',')).join('|');
  useEffect(() => {
    const people = new Map<string, string>();
    sps.forEach(sp => Object.entries(sp.members).forEach(([u, x]) => { if (x.name && !people.has(u)) people.set(u, x.name); }));
    if (people.size) syncNames(g.id, people).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, namesKey]);
  const saveName = () => { if (name.trim() && name.trim() !== g.name) renameGroep(g, name, sps.map(s => s.id)).then(() => toast('Naam opgeslagen')).catch(e => err(e, 'Opslaan mislukt.')); };
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
    {candList.length > 0 ? <div className="row"><select value={pick} onChange={e => setPick(e.target.value)} aria-label="Bestaande persoon kiezen" style={{ flex: '1 1 220px' }}>
        <option value="">Kies iemand uit de leiding…</option>
        {candList.map(([u, c]) => <option key={u} value={u}>{u === me.uid ? `Mijzelf (${c.name})` : `${c.name}${c.tl ? ' · teamleider' : ''}`}</option>)}
      </select><button className="btn" disabled={!pick} onClick={appoint}><ShieldCheck size={16} />Beheerder maken</button></div>
      : <p className="hint">{sps.length ? 'Een beheerder kies je uit de leiding van deze groep. Er is nog niemand anders om te kiezen.' : 'Een beheerder kies je uit de leiding van deze groep. Maak eerst een speltak en zet er leiding in.'}</p>}

    <h3>Speltakken</h3>
    <div className="team">{sps.map(sp => <SpeltakRow key={sp.id} sp={sp} g={g} me={me} pool={pool} all={sps} names={names} />)}{!sps.length && <p className="hint">Nog geen speltakken.</p>}</div>
    <div className="row"><input className="inp" value={newSp} onChange={e => setNewSp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSp(); }} placeholder="Naam nieuwe speltak, bijv. Welpen" list="speltaklist-b" style={{ flex: '1 1 220px' }} />
      <datalist id="speltaklist-b">{['Bevers', 'Welpen', 'Scouts', 'Explorers', 'Roverscouts', 'Stam'].map(x => <option key={x} value={x} />)}</datalist>
      <button className="btn" onClick={addSp}><Plus size={16} />Speltak aanmaken</button></div>
    {canAll && <DeleteGroup g={g} sps={sps} me={me} allSps={allSps} groups={groups} onGone={onGone} />}
    </>}
  </section>;
}

/* ---------- hele groep verwijderen (alleen Beheer totaal) ---------- */
type Gone = { name: string; people: Person[] };
function DeleteGroup({ g, sps, me, allSps, groups, onGone }: { g: Groep; sps: Speltak[]; me: Me; allSps: Speltak[]; groups: Groep[]; onGone: (x: Gone) => void }) {
  const { root } = useRoles();
  const [show, setShow] = useState(false); const [del, setDel] = useState(''); const [busy, setBusy] = useState(false);
  const [opk, setOpk] = useState<number | null>(null);
  const word = g.name || 'verwijderen';
  // Iedereen in deze groep: leiding van alle speltakken en de beheerders.
  const people = new Map<string, Person>();
  Object.entries(g.admins).forEach(([u, a]) => { if (g.adminIds.includes(u)) people.set(u, { uid: u, name: a.name, email: a.email }); });
  sps.forEach(sp => Object.entries(sp.members).forEach(([u, m]) => people.set(u, { uid: u, name: m.name, email: m.email })));
  useEffect(() => { if (show && opk === null) countOpkomsten(sps).then(setOpk).catch(() => setOpk(0)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  const remove = async () => {
    setBusy(true);
    // Wie hoort hierna nergens meer bij? (geen andere groep, speltak of Beheer totaal)
    const elsewhere = (u: string) => u === me.uid || !!root?.ids.includes(u)
      || groups.some(x => x.id !== g.id && x.adminIds.includes(u))
      || allSps.some(sp => sp.gid !== g.id && sp.memberIds.includes(u));
    const left = [...people.values()].filter(p => !elsewhere(p.uid)).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    try {
      await deleteGroep(g, sps);
      sps.forEach(sp => { if (localStorage.getItem('opk.sid') === sp.id) localStorage.removeItem('opk.sid'); });
      try { localStorage.removeItem('opk.groep.open.' + g.id); } catch { /* geen opslag */ }
      toast(`${g.name || 'De groep'} is verwijderd`);
      onGone({ name: g.name || 'De groep', people: left });
    } catch (e) { err(e, 'Verwijderen mislukt. Probeer het opnieuw; wat al weg is, blijft weg.'); setBusy(false); }
  };
  if (!show) return <div className="row"><button className="btn sm ghost danger" onClick={() => setShow(true)}><Trash2 size={14} />Groep verwijderen</button></div>;
  return <div className="dangerzone"><b>Groep verwijderen</b>
    <span className="hint">Weg gaan: {plural(sps.length, 'speltak', 'speltakken')} met {opk === null ? '…' : plural(opk, 'opkomst', 'opkomsten')}, activiteiten en jaarplanning, de groepsbank, de namen, de openstaande uitnodigingen en de beheerders. {people.size > 0 && `${plural(people.size, 'persoon verliest', 'personen verliezen')} de toegang tot ${g.name || 'deze groep'}; hun inlogaccount blijft bestaan. `}Dit kan niet ongedaan worden.</span>
    <div className="row"><input className="inp" value={del} onChange={e => setDel(e.target.value)} placeholder={`Typ ${word} om te bevestigen`} aria-label="Groepsnaam ter bevestiging" style={{ flex: '1 1 200px' }} />
      <button className="btn danger" disabled={busy || del.trim().toLowerCase() !== word.toLowerCase()} onClick={remove}><Trash2 size={16} />{busy ? 'Bezig…' : 'Groep definitief verwijderen'}</button>
      <button className="btn ghost" disabled={busy} onClick={() => { setShow(false); setDel(''); }}>Annuleren</button></div>
  </div>;
}
/** Na het verwijderen: wie hoort nergens meer bij (hun inlogaccount kan alleen in de Firebase-console weg). */
function GoneCard({ gone, onClose }: { gone: Gone; onClose: () => void }) {
  return <section className="card pad stack gonecard">
    <div className="row between"><h2>{gone.name} is verwijderd</h2><button className="btn sm ghost" onClick={onClose}>Sluiten</button></div>
    {gone.people.length ? <>
      <p className="hint">Deze mensen horen nu nergens meer bij. Ze kunnen nog inloggen, maar zien niets. Wil je hun account helemaal weg, verwijder het dan in de Firebase-console bij Authentication → Users.</p>
      <ul className="gone-list">{gone.people.map(p => <li key={p.uid}><b>{p.name}</b>{p.email ? ` · ${p.email}` : ''}</li>)}</ul>
    </> : <p className="hint">Iedereen uit deze groep hoort nog bij een andere groep of speltak.</p>}
  </section>;
}

/** Naam vrijgeven als iemand na het verwijderen in geen enkele speltak van de groep meer zit. */
function releaseIfGone(g: Groep, all: Speltak[], exceptSid: string, uid: string, name: string) {
  if (g.adminIds.includes(uid) || all.some(s => s.id !== exceptSid && s.memberIds.includes(uid))) return;
  releaseName(g.id, uid, name).catch(() => {});
}

/** Iemand kiezen die al een account heeft: uit de bekende mensen van de groep, of op e-mailadres. */
function PersonPicker({ pool, exclude, label, button, onPick, children }: { pool: Person[]; exclude: string[]; label: string; button: string; onPick: (p: Person) => Promise<unknown>; children?: ReactNode }) {
  const [sel, setSel] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const list = pool.filter(p => !exclude.includes(p.uid));
  const go = async () => {
    let p = list.find(x => x.uid === sel) || null;
    if (!p) {
      if (!isEmail(email)) { toast('Kies iemand of vul een e-mailadres in.'); return; }
      setBusy(true);
      p = await findAccount(email).catch(() => null);
      setBusy(false);
      if (!p) { toast('Geen account gevonden met dit e-mailadres. Stuur een uitnodiging, of laat die persoon eerst één keer opnieuw inloggen.'); return; }
      if (exclude.includes(p.uid)) { toast('Deze persoon zit al in het team.'); return; }
    }
    setBusy(true);
    try { await onPick(p); setSel(''); setEmail(''); } finally { setBusy(false); }
  };
  return <div className="row">
    {list.length > 0 && <select value={sel} onChange={e => setSel(e.target.value)} aria-label={label} style={{ flex: '1 1 200px' }}>
      <option value="">{email ? 'Iemand uit de groep kiezen…' : 'Kies iemand uit de groep…'}</option>
      {list.map(p => <option key={p.uid} value={p.uid}>{p.name}{p.email ? ` · ${p.email}` : ''}</option>)}
    </select>}
    {!sel && <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} placeholder={list.length ? 'of e-mailadres van een account' : 'e-mailadres van een account'} aria-label="E-mailadres van een account" style={{ flex: '1 1 200px' }} />}
    {children}
    <button className="btn" disabled={busy} onClick={go}><UserPlus size={16} />{button}</button>
  </div>;
}

function SpeltakRow({ sp, g, me, pool, all, names }: { sp: Speltak; g: Groep; me: Me; pool: Person[]; all: Speltak[]; names: Record<string, AccountInfo> }) {
  // Standaard ingeklapt; per speltak onthouden in deze browser.
  const [open, toggle] = useStoredToggle('opk.speltak.open.' + sp.id);
  const members = Object.entries(sp.members).sort((a, b) => Number(isTeamleider(sp, b[0])) - Number(isTeamleider(sp, a[0])) || a[1].name.localeCompare(b[1].name, 'nl'));
  const [email, setEmail] = useState(''); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'leiding' | 'teamleider'>('leiding');
  const [addRole, setAddRole] = useState<'leiding' | 'teamleider'>('leiding');
  const [del, setDel] = useState(''); const [deleting, setDeleting] = useState(false);
  const word = sp.name || 'verwijderen';
  const tl = teamleiders(sp);
  const send = async () => {
    if (!isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    if (Object.values(sp.members).some(m => m.email === email.trim().toLowerCase())) { toast('Deze persoon zit al in het team.'); return; }
    setBusy(true);
    const k = tl ? kind : 'teamleider';
    try { if (k === 'teamleider') await ensureTlIds(sp); setInv(await createInvite({ kind: k, email, gid: g.id, groupName: g.name, sid: sp.id, speltakName: sp.name, perms: DEFAULT_LEIDING_PERMS }, me)); setEmail(''); } catch (e) { err(e, 'Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  const add = (p: Person) => { const role = tl ? addRole : 'teamleider';
    return claimName(g.id, p.uid, p.name).then(() => addMember(sp, p, role, DEFAULT_LEIDING_PERMS)).then(() => toast(`${p.name} is toegevoegd als ${role}`)).catch(e => err(e, e?.message === 'member' ? 'Deze persoon zit al in het team.' : 'Toevoegen mislukt.')); };
  const remove = async () => {
    setDeleting(true);
    try { await deleteSpeltak(sp); Object.entries(sp.members).forEach(([u, m]) => releaseIfGone(g, all, sp.id, u, m.name)); if (localStorage.getItem('opk.sid') === sp.id) localStorage.removeItem('opk.sid'); toast(`${word} is verwijderd`); }
    catch (e) { err(e, 'Verwijderen mislukt.'); setDeleting(false); }
  };
  return <div className={'member spcard' + (open ? ' open' : '')}>
    <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="sp-head" aria-expanded={open} onClick={toggle}>
        <ChevronRight size={16} className="gc-chev" />
        <span style={{ minWidth: 0 }}><b>{sp.name || 'Speltak'}</b><span className="hint" style={{ display: 'block' }}>{tl ? `Teamleider: ${tl}` : <span className="err">Nog geen teamleider</span>} · {plural(sp.memberIds.length, 'lid', 'leden')}</span></span>
      </button>
      <Link className="btn sm" to={`/s/${sp.id}`} onClick={() => localStorage.setItem('opk.sid', sp.id)}><ExternalLink size={14} />Openen</Link>
    </div>
    {open && <div className="stack" style={{ gap: 8, paddingTop: 10 }}>
      <b>Leiding</b>
      <div className="stack leiding" style={{ gap: 6 }}>
        {members.map(([uid, m]) => <LeidingRow key={uid} sp={sp} g={g} me={me} uid={uid} m={m} all={all} full={fullName(names[(m.email || '').toLowerCase()])} />)}
        {!members.length && <p className="hint">Nog niemand in deze speltak.</p>}
      </div>
      <b>Iemand met een account toevoegen</b>
      <PersonPicker pool={pool} exclude={sp.memberIds} label="Persoon kiezen voor de speltak" button="Toevoegen" onPick={add}>
        {tl ? <select value={addRole} onChange={e => setAddRole(e.target.value as 'leiding' | 'teamleider')} aria-label="Toevoegen als"><option value="leiding">als leiding</option><option value="teamleider">als teamleider</option></select> : null}
      </PersonPicker>
      {!tl && <p className="hint">Er is nog geen teamleider: wie je nu toevoegt of uitnodigt, wordt teamleider.</p>}
      <b>Of uitnodigen met een link</b>
      <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={tl ? 'e-mailadres nieuw lid' : 'e-mailadres teamleider'} style={{ flex: '1 1 220px' }} />
        {tl && <select value={kind} onChange={e => setKind(e.target.value as 'leiding' | 'teamleider')} aria-label="Uitnodigen als"><option value="leiding">Leiding</option><option value="teamleider">Teamleider</option></select>}
        <button className="btn" disabled={busy} onClick={send}><Link2 size={16} />{tl ? 'Uitnodigen' : 'Teamleider uitnodigen'}</button></div>
      {tl && <p className="hint">Nieuwe leiding krijgt de rechten jaarplanning, opkomsten en banken; aanpassen kan hierboven bij de leiding. Bekijken mag iedereen in de speltak altijd.</p>}
      {inv && <InviteLink inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
      <div className="dangerzone"><b>Speltak verwijderen</b>
        <span className="hint">Alle opkomsten, activiteiten en de jaarplanning van {sp.name || 'deze speltak'} worden gewist en het team verliest de toegang. Dit kan niet ongedaan worden.</span>
        <div className="row"><input className="inp" value={del} onChange={e => setDel(e.target.value)} placeholder={`Typ ${word} om te bevestigen`} aria-label="Naam ter bevestiging" style={{ flex: '1 1 200px' }} />
          <button className="btn danger" disabled={deleting || del.trim().toLowerCase() !== word.toLowerCase()} onClick={remove}><Trash2 size={16} />Definitief verwijderen</button></div>
      </div>
    </div>}
  </div>;
}

/** Voor- en achternaam uit de accounts (op e-mailadres) van iedereen in deze speltakken. */
function useFullNames(sps: Speltak[]) {
  const emails = [...new Set(sps.flatMap(sp => Object.values(sp.members).map(m => (m.email || '').toLowerCase())).filter(Boolean))].sort();
  const [names, setNames] = useState<Record<string, AccountInfo>>({});
  useEffect(() => { readAccounts(emails).then(setNames).catch(() => {}); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.join(',')]);
  return names;
}

const fullName = (a?: AccountInfo) => a ? [a.firstName, a.lastName].filter(Boolean).join(' ') : '';

function LeidingRow({ sp, g, me, uid, m, all, full }: { sp: Speltak; g: Groep; me: Me; uid: string; m: Member; all: Speltak[]; full: string }) {
  const isTl = isTeamleider(sp, uid);
  const last = isTl && Object.keys(sp.members).filter(u => isTeamleider(sp, u)).length < 2;
  const [mode, setMode] = useState<null | 'off' | 'remove'>(null);
  const [next, setNext] = useState('');
  const others = Object.entries(sp.members).filter(([u]) => u !== uid).sort((a, b) => a[1].name.localeCompare(b[1].name, 'nl'));
  const where = sp.name || 'deze speltak';
  const tlOff = () => last ? setMode('off') : setTeamleider(sp, uid, false).then(() => toast(`${m.name} is nu leiding`)).catch(e => err(e, 'Aanpassen mislukt.'));
  const confirmNext = async () => {
    const to = sp.members[next]; if (!to) { toast('Kies wie de nieuwe teamleider wordt.'); return; }
    try {
      if (mode === 'off') await transferTeamleider(sp, uid, next);
      else { await removeFromTeam(sp, uid, { uid: next, name: to.name, email: to.email }); releaseIfGone(g, all, sp.id, uid, m.name); }
      toast(mode === 'off' ? `${to.name} is nu teamleider` : `${to.name} is nu teamleider; ${m.name} is uit ${where} gehaald`);
      setMode(null); setNext('');
    } catch (e) { err(e, 'Aanpassen mislukt.'); }
  };
  return <div className="subrow stack" style={{ gap: 6 }}>
    <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
      <div style={{ minWidth: 0, flex: '1 1 180px' }}><b>{m.name}{uid === me.uid ? ' (jij)' : ''}</b>{full && <span className="hint"> · {full}</span>}
        <div className="hint ell">{m.email ? <a href={`mailto:${m.email}`}>{m.email}</a> : 'e-mailadres onbekend'} · {isTl ? 'Teamleider' : 'Leiding'}</div></div>
      <div className="row" style={{ gap: 4 }}>
        <label className="toggle-inline"><input type="checkbox" checked={isTl} onChange={e => e.target.checked
          ? setTeamleider(sp, uid, true).then(() => toast(`${m.name} is teamleider`)).catch(er => err(er, 'Aanpassen mislukt.'))
          : tlOff()} />Teamleider</label>
        <label className="toggle-inline"><input type="checkbox" checked={g.adminIds.includes(uid)} onChange={e => (e.target.checked
          ? setGroupAdmin(g.id, uid, { name: m.name, email: m.email, since: Date.now() }).then(() => toast(`${m.name} is nu beheerder van ${g.name}`))
          : removeGroupAdmin(g, uid).then(() => toast(`${m.name} is geen beheerder meer`))).catch(er => err(er, 'Aanpassen mislukt.'))} />Beheerder</label>
        {last ? <button className="btn sm ghost danger" onClick={() => setMode('remove')}>Verwijderen</button>
          : <ConfirmBtn className="btn sm ghost danger" label="Verwijderen" confirm="Zeker?" onConfirm={() => removeFromTeam(sp, uid).then(() => releaseIfGone(g, all, sp.id, uid, m.name)).then(() => toast(`${m.name} is uit ${where} gehaald`)).catch(e => err(e, 'Verwijderen mislukt.'))} />}
      </div>
    </div>
    {!isTl && <div className="row perms-inline" style={{ gap: '4px 10px' }}><span className="hint">Mag aanpassen:</span>
      {(Object.keys(PERM_LABELS) as PermKey[]).map(k => <label key={k} className="toggle-inline"><input type="checkbox" checked={!!m.perms?.[k]} onChange={e => setPerms(sp, uid, { ...normPerms(m.perms), [k]: e.target.checked }).catch(er => err(er, 'Aanpassen mislukt.'))} />{PERM_LABELS[k]}</label>)}
    </div>}
    {mode && <div className="banknote stack" style={{ gap: 8 }}>
      <span>{m.name} is de enige teamleider van {where}. {mode === 'off' ? `Kies wie het overneemt; ${m.name} blijft leiding.` : `Kies eerst wie het overneemt; daarna wordt ${m.name} uit het team gehaald.`}</span>
      {others.length ? <div className="row">
        <select value={next} onChange={e => setNext(e.target.value)} aria-label="Nieuwe teamleider" style={{ flex: '1 1 200px' }}>
          <option value="">Nieuwe teamleider kiezen…</option>
          {others.map(([u, o]) => <option key={u} value={u}>{o.name}</option>)}
        </select>
        <button className="btn sm" disabled={!next} onClick={confirmNext}>{mode === 'off' ? 'Overdragen' : 'Overdragen en verwijderen'}</button>
        <button className="btn sm ghost" onClick={() => { setMode(null); setNext(''); }}>Annuleren</button>
      </div> : <div className="row"><span className="hint" style={{ flex: '1 1 200px' }}>Er is nog geen andere leiding in {where}. Voeg eerst iemand toe bij Speltakken → Team.</span><button className="btn sm ghost" onClick={() => setMode(null)}>Sluiten</button></div>}
    </div>}
  </div>;
}
