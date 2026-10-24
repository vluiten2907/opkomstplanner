import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Plus, ShieldCheck, Users, UserPlus, ExternalLink, Link2, ChevronRight, Trash2, UserRound } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { toast } from '../store/toast';
import PageHead from '../components/PageHead';
import { BusyButton, ConfirmBtn, Field, announce } from '../components/ui';
import { InviteLink, InviteList, useOpenInvites, type InviteScope } from '../components/Invites';
import { addMember, setPerms, claimName, releaseName, syncNames, createGroep, newGroepId, createInvite, inviteOnce, renewInvite, revokeInvite, createSpeltakInGroep, deleteSpeltak, deleteGroep, countOpkomsten, ensureTlIds, findAccount, readAccounts, removeFromTeam, type AccountInfo, transferTeamleider, type Person, isEmail, linkSpeltak, removeGroupAdmin, removeRootPerson, renameGroep, setGroupAdmin, setTeamleider, type Me } from '../store/beheer';
import { DEFAULT_LEIDING_PERMS, PERM_LABELS, normPerms, normSpeltak, isTeamleider, type Admin, type Member, type PermKey, type Groep, type Invite, type Speltak } from '../lib/types';
import { SPELTAKKEN } from '../lib/model';
import { plural } from '../lib/time';
import { lastSpeltak } from '../lib/lastSpeltak';

// Alleen Beheer (totaal) plakt de regels in Firebase: alleen die krijgt bij een weigering de tip dat ze er misschien nog niet staan.
const showErr = (e: any, fallback: string, rulesHint: boolean) => toast(e?.message === 'last' ? 'Er moet minstens één beheerder overblijven.' : e?.message === 'name-taken' ? 'Er is al iemand met deze naam in de groep. Namen zijn uniek binnen een groep.' : e?.code === 'permission-denied' ? 'Dat mag je niet.' + (rulesHint ? ' Of de nieuwe regels staan nog niet in Firebase.' : '') : fallback);
/** Foutmelding tonen, met de tip over de regels als je Beheer (totaal) bent. */
function useErr() {
  const { isRoot } = useRoles();
  return (e: any, fallback: string) => showErr(e, fallback, isRoot);
}
const reusedNote = (email: string) => toast(`Er stond al een uitnodiging voor ${email}. Dit is dezelfde link.`);

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
  // per zoekvraag: is de lijst echt binnen? (tot dan is hij leeg; bij een fout blijft hij dat)
  const [ok, setOk] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setMap({}); setOk({});
    const c = collection(db, 'speltakken');
    const qs = isRoot ? [['*', c] as const] : gids.map(g => [g, query(c, where('gid', '==', g))] as const);
    const stops = qs.map(([k, q]) => onSnapshot(q, s => { setMap(m => ({ ...m, [k]: s.docs.map(d => normSpeltak(d.id, d.data())) })); setOk(o => o[k] ? o : { ...o, [k]: true }); },
      () => { setMap(m => ({ ...m, [k]: [] })); setOk(o => ({ ...o, [k]: false })); }));
    return () => stops.forEach(f => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const list = useMemo(() => Object.values(map).flat().sort((a, b) => a.name.localeCompare(b.name, 'nl')), [map]);
  /** Zijn de speltakken van deze groep geladen? */
  const loaded = (gid: string) => !!ok[isRoot ? '*' : gid];
  return { list, loaded };
}

export default function BeheerPage() {
  const { user } = useAuth();
  const R = useRoles();
  const gids = R.groups.map(g => g.id);
  const { list: sps, loaded } = useSpeltakken(R.isRoot, gids);
  const scopes: InviteScope[] = R.isRoot ? [{ all: true }] : gids.map(gid => ({ gid }));
  const invites = useOpenInvites(R.ready ? scopes : []);
  const [gone, setGone] = useState<Gone | null>(null);
  const [renewed, setRenewed] = useState<Invite | null>(null);
  const me = { uid: user!.uid, name: user?.displayName || user?.email || '', email: user?.email || '' };

  const head = <PageHead title="Opkomstplanner · Beheer"><Link className="btn ghost sm" to="/speltakken"><Users size={14} /><span className="lbl-long">Mijn speltakken</span><span className="lbl-short">Speltakken</span></Link><Link className="btn ghost sm" to="/account"><UserRound size={14} />Account</Link></PageHead>;
  const wrap = (body: React.ReactNode) => <main className="auth-wrap" style={{ alignItems: 'start' }}><div className="stack beheer" style={{ width: 'min(960px, 100%)', gap: 18 }}>{head}{body}</div></main>;
  if (!R.ready) return wrap(<p className="hint">Laden…</p>);
  if (!R.isAdmin) return wrap(<div className="empty"><span>Je bent geen beheerder. Deze pagina is voor Beheer (totaal) en beheerders van een groep.</span><Link className="btn" to="/speltakken">Mijn speltakken</Link></div>);

  const unlinked = sps.filter(s => !s.gid);
  // Vernieuwen met de huidige groep en namen; Beheer (totaal) alleen door Beheer (totaal), een overdracht alleen door wie hem maakte.
  const renew = {
    can: (i: Invite) => (i.kind !== 'totaal' || R.isRoot) && (!i.transfer || i.invitedBy === me.uid),
    run: (i: Invite) => {
      const sp = i.sid ? sps.find(x => x.id === i.sid) : null;
      const gid = sp ? sp.gid : i.gid, g = R.groups.find(x => x.id === gid);
      return renewInvite(i, me, { gid, groupName: g?.name ?? sp?.groupName ?? i.groupName, speltakName: sp?.name ?? i.speltakName });
    },
    onDone: setRenewed,
  };
  return wrap(<>
    <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Beheer</h1>
    <p className="hint" style={{ marginTop: -8 }}><ShieldCheck size={15} style={{ verticalAlign: -3, marginRight: 4 }} />{R.isRoot ? 'Je bent Beheer (totaal): je ziet alle groepen en speltakken.' : `Je beheert ${R.ownGroups.map(g => g.name).join(', ')}.`}</p>
    {R.isRoot && <RootCard me={me} invites={invites} />}
    {R.isRoot && <NewGroup me={me} groups={R.groups} />}
    {R.isRoot && unlinked.length > 0 && <Unlinked list={unlinked} groups={R.groups} me={me} />}
    {gone && <GoneCard gone={gone} onClose={() => setGone(null)} />}
    {R.groups.map(g => <GroupCard key={g.id} g={g} sps={sps.filter(s => s.gid === g.id)} loaded={loaded(g.id)} invites={invites} me={me} canAll={R.isRoot} allSps={sps} groups={R.groups} onGone={setGone} />)}
    {!R.groups.length && R.isRoot && <div className="empty"><span>Nog geen groepen. Maak hierboven een groep aan en nodig de beheerder uit.</span></div>}
    <section className="card pad stack">
      <div className="row between"><h2>Openstaande uitnodigingen</h2><span className="hint">{plural(invites.length, 'uitnodiging', 'uitnodigingen')}</span></div>
      {renewed && <InviteLink key={renewed.id} inv={renewed} fromName={me.name} onClose={() => setRenewed(null)} />}
      <InviteList invites={invites} renew={renew} />
    </section>
  </>);
}

/* ---------- Beheer (totaal) ---------- */
function RootCard({ me, invites }: { me: Me; invites: Invite[] }) {
  const err = useErr();
  const { root } = useRoles();
  const [email, setEmail] = useState(''); const [transfer, setTransfer] = useState(false); const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  if (!root) return null;
  const people = Object.entries(root.people);
  const send = async () => {
    if (!isEmail(email)) { toast('Vul een geldig e-mailadres in.'); return; }
    // al Beheer (totaal), jijzelf ook: geen uitnodiging die blijft openstaan
    const em = email.trim().toLowerCase();
    if (em === me.email.toLowerCase() || people.some(([, p]) => (p.email || '').toLowerCase() === em)) {
      toast('Deze persoon is al Beheer (totaal).' + (transfer ? ' Wil je stoppen, tik dan bij jezelf op Aftreden.' : ''), undefined, transfer ? 7000 : undefined); return;
    }
    setBusy(true);
    try {
      const inp = { kind: 'totaal' as const, email, transfer };
      const r = await inviteOnce(inp, me.uid, invites, () => createInvite(inp, me));
      setInv(r.inv); setEmail(''); if (r.reused) reusedNote(r.inv.email); else announce(`Uitnodiging gemaakt voor ${em}. De link staat hieronder.`);
    } catch (e) { err(e, 'Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  return <section className="card pad stack">
    <div className="row between"><h2>Beheer (totaal)</h2><span className="hint">{plural(people.length, 'persoon', 'personen')}</span></div>
    <PeopleList people={people} me={me.uid} canRemove={true} onRemove={uid => removeRootPerson(uid, root.ids).then(() => toast(uid === me.uid ? 'Je bent afgetreden' : 'Verwijderd')).catch(e => err(e, 'Aanpassen mislukt.'))} />
    <div className="invite stack">
      <h3><UserPlus size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Mede-beheerder (totaal) uitnodigen of je rol overdragen</h3>
      <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e-mailadres" aria-label="E-mailadres" style={{ flex: '1 1 220px' }} />
        <label className="toggle-inline"><input type="checkbox" checked={transfer} onChange={e => setTransfer(e.target.checked)} />Ik draag mijn rol over</label>
        <BusyButton className="btn primary" busy={busy} onClick={send}><Link2 size={16} />Uitnodigingslink maken</BusyButton></div>
      {transfer && <p className="hint">Je blijft beheerder tot de ander de uitnodiging accepteert. Daarna tik je hierboven bij jezelf op Aftreden.</p>}
      {inv && <InviteLink key={inv.id} inv={inv} fromName={me.name} onClose={() => setInv(null)} />}
    </div>
  </section>;
}

function PeopleList({ people, me, canRemove, onRemove }: { people: [string, Admin][]; me: string; canRemove: boolean | ((uid: string) => boolean); onRemove: (uid: string) => void }) {
  const last = people.length < 2;
  return <div className="team">{people.map(([uid, p]) => {
    const mine = uid === me;
    const can = !last && (typeof canRemove === 'function' ? canRemove(uid) : canRemove);
    return <div key={uid} className="member"><div className="row between" style={{ flexWrap: 'nowrap' }}>
      <div style={{ minWidth: 0 }}><b>{p.name || p.email || 'Naamloos'}{mine ? ' (jij)' : ''}</b><div className="hint ell">{p.email}</div></div>
      {can && <ConfirmBtn className="btn sm ghost danger" label={mine ? 'Aftreden' : 'Verwijderen'} confirm={mine ? 'Zeker? Aftreden' : 'Zeker?'} onConfirm={() => onRemove(uid)} />}
      {last && mine && <span className="hint" title="Draag je rol eerst over">laatste beheerder</span>}
    </div></div>;
  })}{!people.length && <p className="hint">Nog geen beheerder.</p>}</div>;
}

/** Een andere groep met dezelfde naam (hoofdletters tellen niet). Een beheerder van een groep ziet alleen zijn eigen groepen. */
const sameGroupName = (groups: Groep[], name: string, except?: string) =>
  groups.find(g => g.id !== except && g.name.trim().toLowerCase() === name.trim().toLowerCase());

/* ---------- nieuwe groep ---------- */
function NewGroup({ me, groups }: { me: Me; groups: Groep[] }) {
  const err = useErr();
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const make = async () => {
    if (!name.trim()) { toast('Vul de naam van de groep in.'); return; }
    const dup = sameGroupName(groups, name);
    if (dup) { toast(`Er is al een groep ${dup.name}.`); return; }
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
        <Field label="Naam van de groep" htmlFor="ng-name" hint="Daarna maak je de speltakken en nodig je de teamleiders uit. Een beheerder van de groep kies je uit de leiding."><input id="ng-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>
        <div className="row"><BusyButton className="btn primary" busy={busy} onClick={make}>Groep aanmaken</BusyButton><button className="btn ghost" onClick={() => setOpen(false)}>Annuleren</button></div>
      </section>}
  </div>;
}

/* ---------- oude speltakken koppelen ---------- */
function Unlinked({ list, groups, me }: { list: Speltak[]; groups: Groep[]; me: Me }) {
  const err = useErr();
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
    <div className="row"><BusyButton className="btn primary" busy={busy} onClick={auto}>Groepen maken op groepsnaam en alles koppelen</BusyButton></div>
    <div className="picklist">{list.map(sp => <div key={sp.id} className="pick"><div className="info"><b>{[sp.groupName || 'Zonder groepsnaam', sp.name].join(' · ')}</b>
      <span className="hint">{teamleiders(sp) || 'geen teamleider'} · {plural(sp.memberIds.length, 'lid', 'leden')}</span></div>
      {groups.length > 0 && <div className="row" style={{ gap: 6 }}><select className="inp" value={pick[sp.id] || ''} onChange={e => setPick(p => ({ ...p, [sp.id]: e.target.value }))} aria-label="Groep kiezen" style={{ width: 'auto', flex: '1 1 160px' }}><option value="">Kies groep…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button className="btn sm" disabled={!pick[sp.id]} onClick={() => { const g = groups.find(x => x.id === pick[sp.id]); if (g) linkSpeltak(sp, g).then(() => toast('Gekoppeld')).catch(e => err(e, 'Koppelen mislukt.')); }}>Koppelen</button></div>}
    </div>)}</div>
  </section>;
}

const teamleiders = (sp: Speltak) => Object.entries(sp.members).filter(([u]) => isTeamleider(sp, u)).map(([, m]) => m.name).join(', ');

/* ---------- een groep ---------- */
function GroupCard({ g, sps, loaded, invites, me, canAll, allSps, groups, onGone }: { g: Groep; sps: Speltak[]; loaded: boolean; invites: Invite[]; me: Me; canAll: boolean; allSps: Speltak[]; groups: Groep[]; onGone: (x: Gone) => void }) {
  const err = useErr();
  const [name, setName] = useState(g.name); useEffect(() => setName(g.name), [g.name]);
  const [newSp, setNewSp] = useState(''); const [pick, setPick] = useState('');
  // speltak aanmaken loopt: geen tweede (bijv. dubbelklik op een trage verbinding)
  const [adding, setAdding] = useState(false); const addingRef = useRef(false);
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
  // Namen zijn uniek binnen de groep: wie al in een speltak zit, krijgt zijn naam vastgelegd; wie nergens meer in de groep zit
  // (bijv. uit het team gehaald via Team) en geen beheerder is, krijgt zijn naam weer vrij. Pas als de speltakken echt binnen zijn.
  const namesKey = sps.map(sp => Object.entries(sp.members).map(([u, x]) => u + ':' + x.name).sort().join(',')).join('|');
  const adminKey = g.adminIds.join(',');
  useEffect(() => {
    if (!loaded) return;
    const people = new Map<string, string>();
    sps.forEach(sp => Object.entries(sp.members).forEach(([u, x]) => { if (x.name && !people.has(u)) people.set(u, x.name); }));
    syncNames(g.id, people, g.adminIds).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, namesKey, adminKey, loaded]);
  // leeg of dezelfde naam als een andere groep: de opgeslagen naam terug, met uitleg (niet stil een leeg veld laten staan)
  const saveName = () => {
    const nm = name.trim();
    if (!nm) { setName(g.name); if (g.name.trim()) toast('Vul de naam van de groep in.'); return; }
    if (nm === g.name) return;
    const dup = sameGroupName(groups, nm, g.id);
    if (dup) { setName(g.name); toast(`Er is al een groep ${dup.name}.`); return; }
    renameGroep(g, name, sps.map(s => s.id)).then(() => toast('Naam opgeslagen')).catch(e => err(e, 'Opslaan mislukt.'));
  };
  const addSp = async () => {
    if (addingRef.current) return;
    const nm = newSp.trim();
    if (!nm) { toast('Vul de naam van de speltak in.'); return; }
    const dup = sps.find(s => s.name.trim().toLowerCase() === nm.toLowerCase());
    if (dup) { toast(`Er is al een speltak ${dup.name} in ${g.name || 'deze groep'}. Kies een andere naam.`); return; }
    // veld meteen leeg; mislukt het, dan komt de naam terug
    addingRef.current = true; setAdding(true); setNewSp('');
    try { await createSpeltakInGroep(g, nm, me); toast('Speltak aangemaakt; nodig nu de teamleider uit.'); }
    catch (e) { setNewSp(cur => cur || nm); err(e, 'Aanmaken mislukt.'); }
    addingRef.current = false; setAdding(false);
  };
  return <section className={'card pad stack groupcard' + (open ? ' open' : '')}>
    <button type="button" className="gc-head" aria-expanded={open} onClick={toggle}>
      <ChevronRight size={18} className="gc-chev" />
      <b className="ell">{g.name || 'Groep zonder naam'}</b>
      <span className="hint">{plural(sps.length, 'speltak', 'speltakken')}{mine ? ' · jij bent beheerder' : ''}</span>
    </button>
    {open && <>
    <Field label="Naam van de groep" htmlFor={'g-' + g.id}><input id={'g-' + g.id} value={name} maxLength={60} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></Field>

    <h3>Beheerders</h3>
    <PeopleList people={admins} me={me.uid} canRemove={uid => canAll || mine || uid === me.uid}
      onRemove={uid => removeGroupAdmin(g, uid).then(() => toast(uid === me.uid ? 'Je bent afgetreden' : 'Verwijderd')).catch(e => err(e, 'Aanpassen mislukt.'))} />
    {candList.length > 0 ? <div className="row"><select className="inp" value={pick} onChange={e => setPick(e.target.value)} aria-label="Bestaande persoon kiezen" style={{ flex: '1 1 220px' }}>
        <option value="">Kies iemand uit de leiding…</option>
        {candList.map(([u, c]) => <option key={u} value={u}>{u === me.uid ? `Mijzelf (${c.name})` : `${c.name}${c.tl ? ' · teamleider' : ''}`}</option>)}
      </select><button className="btn" disabled={!pick} onClick={appoint}><ShieldCheck size={16} />Beheerder maken</button></div>
      : <p className="hint">{sps.length ? 'Een beheerder kies je uit de leiding van deze groep. Er is nog niemand anders om te kiezen.' : 'Een beheerder kies je uit de leiding van deze groep. Maak eerst een speltak en zet er leiding in.'}</p>}

    <h3>Speltakken</h3>
    <div className="team">{sps.map(sp => <SpeltakRow key={sp.id} sp={sp} g={g} me={me} pool={pool} all={sps} names={names} open={invites.filter(i => i.sid === sp.id)} />)}{!sps.length && <p className="hint">Nog geen speltakken.</p>}</div>
    <div className="row"><input className="inp" value={newSp} maxLength={60} onChange={e => setNewSp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSp(); }} placeholder="Naam nieuwe speltak, bijv. Welpen" aria-label="Naam nieuwe speltak" list="speltaklist-b" style={{ flex: '1 1 220px' }} />
      <datalist id="speltaklist-b">{SPELTAKKEN.map(x => <option key={x} value={x} />)}</datalist>
      <button className="btn" disabled={adding} onClick={addSp}><Plus size={16} />{adding ? 'Aanmaken…' : 'Speltak aanmaken'}</button></div>
    {canAll && <DeleteGroup g={g} sps={sps} me={me} allSps={allSps} groups={groups} onGone={onGone} />}
    </>}
  </section>;
}

/* ---------- hele groep verwijderen (alleen Beheer totaal) ---------- */
type Gone = { name: string; people: Person[] };
function DeleteGroup({ g, sps, me, allSps, groups, onGone }: { g: Groep; sps: Speltak[]; me: Me; allSps: Speltak[]; groups: Groep[]; onGone: (x: Gone) => void }) {
  const err = useErr();
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
      sps.forEach(sp => lastSpeltak.clearIf(sp.id));
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

/** Iemand kiezen: uit de bekende mensen van de groep, of op e-mailadres. Heeft dat e-mailadres (nog) geen account, dan volgt
 *  `onNoAccount` (een uitnodiging maken; true = gelukt, het veld gaat leeg).
 *  Is de naam van die persoon al van iemand anders in de groep (onPick gooit 'name-taken'), dan kies je hier een andere naam.
 *  onPick geeft false als toevoegen mislukte: het e-mailadres en de keuze blijven dan staan. */
function PersonPicker({ pool, exclude, label, emailLabel, button, groupName, onPick, onNoAccount, children }: { pool: Person[]; exclude: string[]; label: string; emailLabel: string; button: string; groupName: string;
  onPick: (p: Person) => Promise<unknown>; onNoAccount: (email: string) => Promise<boolean>; children?: ReactNode }) {
  const [sel, setSel] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<{ p: Person; tried: string; name: string } | null>(null);
  // Enter in het veld kan sneller dan de knop uitgaat: nooit twee keer tegelijk (anders twee uitnodigingen voor dezelfde persoon)
  const busyRef = useRef(false);
  const list = pool.filter(p => !exclude.includes(p.uid));
  const go = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      let p = list.find(x => x.uid === sel) || null;
      if (!p) {
        if (!isEmail(email)) { toast(list.length ? 'Kies iemand of vul een e-mailadres in.' : 'Vul een geldig e-mailadres in.'); return; }
        setBusy(true);
        // opzoeken mislukt (bijv. geen verbinding): niet zomaar een uitnodiging maken
        const found = await findAccount(email).then(x => x, () => undefined);
        if (found === undefined) { toast('Opzoeken lukt nu niet. Controleer de verbinding en probeer het opnieuw.'); return; }
        // nog geen (bevestigd) account: meteen een uitnodiging; wie al een account heeft maar nog niet bevestigde, logt met de link in
        if (!found) { if (await onNoAccount(email)) setEmail(''); return; }
        p = found;
        if (exclude.includes(p.uid)) { toast('Deze persoon zit al in het team.'); return; }
        // al bekend in de groep (bijv. als Akela Welpen): die naam, niet de accountnaam
        const known = pool.find(x => x.uid === p!.uid);
        if (known?.name) p = { ...p, name: known.name };
      }
      // zelfde persoon als bij de bezette naam: met de nieuw gekozen naam
      const pickName = taken && taken.p.uid === p.uid;
      if (pickName && !taken.name.trim()) { toast(`Kies een naam voor ${groupName}.`); return; }
      const person = pickName ? { ...p, name: taken.name.trim() } : p;
      setBusy(true);
      try { if (await onPick(person) !== false) { setSel(''); setEmail(''); setTaken(null); } }
      catch (e: any) {
        if (e?.message !== 'name-taken') throw e;
        setTaken({ p, tried: person.name, name: pickName ? taken.name : '' });
        toast(`${person.name} is al in gebruik binnen ${groupName}. Kies een andere naam voor deze groep.`);
      }
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <div className="stack" style={{ gap: 8 }}>
    <div className="row">
      {list.length > 0 && <select className="inp" value={sel} onChange={e => { setSel(e.target.value); setTaken(null); }} aria-label={label} style={{ flex: '1 1 200px' }}>
        <option value="">{email ? 'Iemand uit de groep kiezen…' : 'Kies iemand uit de groep…'}</option>
        {list.map(p => <option key={p.uid} value={p.uid}>{p.name}{p.email ? ` · ${p.email}` : ''}</option>)}
      </select>}
      {!sel && <input className="inp" type="email" value={email} onChange={e => { setEmail(e.target.value); setTaken(null); }} onKeyDown={e => { if (e.key === 'Enter') go(); }} placeholder={list.length ? 'of e-mailadres' : 'e-mailadres'} aria-label={emailLabel} autoComplete="off" style={{ flex: '1 1 200px' }} />}
      {children}
      <BusyButton className="btn" busy={busy} onClick={go}><UserPlus size={16} />{button}</BusyButton>
    </div>
    {taken && <Field label={`Naam in ${groupName}`} htmlFor={'pp-name-' + taken.p.uid} hint={`${taken.tried} is al in gebruik binnen ${groupName}. Namen zijn uniek binnen een groep; kies een naam waaronder ${taken.p.email || 'deze persoon'} hier bekend is.`}>
      <input id={'pp-name-' + taken.p.uid} value={taken.name} maxLength={40} onChange={e => setTaken({ ...taken, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') go(); }} placeholder="bijv. Akela Welpen" autoComplete="off" />
    </Field>}
  </div>;
}

function SpeltakRow({ sp, g, me, pool, all, names, open: openInv }: { sp: Speltak; g: Groep; me: Me; pool: Person[]; all: Speltak[]; names: Record<string, AccountInfo>; open: Invite[] }) {
  const err = useErr();
  // Standaard ingeklapt; per speltak onthouden in deze browser.
  const [open, toggle] = useStoredToggle('opk.speltak.open.' + sp.id);
  const members = Object.entries(sp.members).sort((a, b) => Number(isTeamleider(sp, b[0])) - Number(isTeamleider(sp, a[0])) || a[1].name.localeCompare(b[1].name, 'nl'));
  const [inv, setInv] = useState<Invite | null>(null), [invLead, setInvLead] = useState('');
  const [role, setRole] = useState<'leiding' | 'teamleider'>('leiding');
  const [showDel, setShowDel] = useState(false); const [del, setDel] = useState(''); const [deleting, setDeleting] = useState(false);
  const word = sp.name || 'verwijderen';
  const tl = teamleiders(sp);
  // Toevoegen met een e-mailadres zonder account: meteen een uitnodiging (met de gekozen rol); de link staat dan hieronder
  const invite = async (email: string) => {
    if (Object.values(sp.members).some(m => (m.email || '').toLowerCase() === email.trim().toLowerCase())) { toast('Deze persoon zit al in het team.'); return false; }
    const k = tl ? role : 'teamleider';
    try {
      if (k === 'teamleider') await ensureTlIds(sp);
      const inp = { kind: k, email, gid: g.id, groupName: g.name, sid: sp.id, speltakName: sp.name, perms: DEFAULT_LEIDING_PERMS };
      const r = await inviteOnce(inp, me.uid, openInv, () => createInvite(inp, me));
      const lead = `Nog geen account met ${r.inv.email}: ${r.reused ? 'er stond al een uitnodiging, dit is dezelfde link.' : 'uitnodiging gemaakt.'}`;
      setInv(r.inv); setInvLead(lead); if (r.reused) reusedNote(r.inv.email); else announce(lead + ' De link staat hieronder.');
      return true;
    } catch (e) { err(e, 'Uitnodiging maken mislukt.'); return false; }
  };
  const add = async (p: Person) => {
    const as = tl ? role : 'teamleider';
    try {
      await claimName(g.id, p.uid, p.name); await addMember(sp, p, as, DEFAULT_LEIDING_PERMS); toast(`${p.name} is toegevoegd als ${as}`);
      // een openstaande uitnodiging voor deze persoon en deze speltak is nu overbodig (opruimen mag mislukken)
      const em = (p.email || '').toLowerCase();
      if (em) openInv.filter(i => i.email === em).forEach(i => { revokeInvite(i.id).catch(() => {}); if (inv?.id === i.id) setInv(null); });
    }
    catch (e: any) {
      // naam bezet: de keuze laat dan een veld zien voor een andere naam
      if (e?.message === 'name-taken') throw e;
      err(e, e?.message === 'member' ? 'Deze persoon zit al in het team.' : 'Toevoegen mislukt.');
      // mislukt: het ingevulde e-mailadres blijft staan (zie PersonPicker)
      return false;
    }
  };
  const remove = async () => {
    setDeleting(true);
    try { await deleteSpeltak(sp); Object.entries(sp.members).forEach(([u, m]) => releaseIfGone(g, all, sp.id, u, m.name)); lastSpeltak.clearIf(sp.id); toast(`${word} is verwijderd`); }
    catch (e) { err(e, 'Verwijderen mislukt.'); setDeleting(false); }
  };
  return <div className={'member spcard' + (open ? ' open' : '')}>
    <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="sp-head" aria-expanded={open} onClick={toggle}>
        <ChevronRight size={16} className="gc-chev" />
        <span style={{ minWidth: 0 }}><b>{sp.name || 'Speltak'}</b><span className="hint" style={{ display: 'block' }}>{tl ? `Teamleider: ${tl}` : <span className="err">Nog geen teamleider</span>} · {plural(sp.memberIds.length, 'lid', 'leden')}</span></span>
      </button>
      <Link className="btn sm" to={`/s/${sp.id}`} onClick={() => lastSpeltak.set(sp.id)}><ExternalLink size={14} />Openen</Link>
    </div>
    {open && <div className="stack" style={{ gap: 8, paddingTop: 10 }}>
      <b>Leiding</b>
      <div className="stack leiding" style={{ gap: 6 }}>
        {members.map(([uid, m]) => <LeidingRow key={uid} sp={sp} g={g} me={me} uid={uid} m={m} all={all} full={fullName(names[(m.email || '').toLowerCase()])} />)}
        {!members.length && <p className="hint">Nog niemand in deze speltak.</p>}
      </div>
      {/* één formulier: iemand uit de groep of een e-mailadres. Met een account komt die persoon er meteen bij, anders volgt een uitnodiging */}
      <b>{tl ? 'Iemand toevoegen' : 'Teamleider toevoegen'}</b>
      <PersonPicker pool={pool} exclude={sp.memberIds} label="Persoon kiezen voor de speltak" emailLabel={tl ? 'E-mailadres nieuw lid' : 'E-mailadres teamleider'} button="Toevoegen" groupName={g.name || 'de groep'} onPick={add} onNoAccount={invite}>
        {tl ? <select className="inp" value={role} onChange={e => setRole(e.target.value as 'leiding' | 'teamleider')} aria-label="Rol" style={{ width: 'auto', flex: 'none' }}><option value="leiding">Leiding</option><option value="teamleider">Teamleider</option></select> : null}
      </PersonPicker>
      <p className="hint">{tl ? 'Heeft iemand nog geen account, dan maakt Toevoegen een uitnodigingslink. Nieuwe leiding krijgt de rechten jaarplanning, opkomsten en banken; aanpassen kan hierboven bij de leiding. Bekijken mag iedereen in de speltak altijd.'
        : 'Er is nog geen teamleider: wie je nu toevoegt of uitnodigt, wordt teamleider. Heeft die persoon nog geen account, dan maakt Toevoegen een uitnodigingslink.'}</p>
      {inv && <InviteLink key={inv.id} inv={inv} fromName={me.name} lead={invLead} onClose={() => setInv(null)} />}
      {!showDel ? <div className="row"><button className="btn sm ghost danger" onClick={() => setShowDel(true)}><Trash2 size={14} />Speltak verwijderen</button></div>
        : <div className="dangerzone"><b>Speltak verwijderen</b>
        <span className="hint">Alle opkomsten, activiteiten en de jaarplanning van {sp.name || 'deze speltak'} worden gewist en het team verliest de toegang. Dit kan niet ongedaan worden.</span>
        <div className="row"><input className="inp" value={del} onChange={e => setDel(e.target.value)} placeholder={`Typ ${word} om te bevestigen`} aria-label="Naam ter bevestiging" style={{ flex: '1 1 200px' }} autoFocus />
          <button className="btn danger" disabled={deleting || del.trim().toLowerCase() !== word.toLowerCase()} onClick={remove}><Trash2 size={16} />Definitief verwijderen</button>
          <button className="btn ghost" disabled={deleting} onClick={() => { setShowDel(false); setDel(''); }}>Annuleren</button></div>
      </div>}
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
  const err = useErr();
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
      <div style={{ minWidth: 0, flex: '1 1 180px' }}><b>{m.name || 'Naamloos'}{uid === me.uid ? ' (jij)' : ''}</b>{full && <span className="hint"> · {full}</span>}
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
        <select className="inp" value={next} onChange={e => setNext(e.target.value)} aria-label="Nieuwe teamleider" style={{ flex: '1 1 200px' }}>
          <option value="">Nieuwe teamleider kiezen…</option>
          {others.map(([u, o]) => <option key={u} value={u}>{o.name}</option>)}
        </select>
        <button className="btn sm" disabled={!next} onClick={confirmNext}>{mode === 'off' ? 'Overdragen' : 'Overdragen en verwijderen'}</button>
        <button className="btn sm ghost" onClick={() => { setMode(null); setNext(''); }}>Annuleren</button>
      </div> : <div className="row"><span className="hint" style={{ flex: '1 1 200px' }}>Er is nog geen andere leiding in {where}. Voeg hieronder eerst iemand toe.</span><button className="btn sm ghost" onClick={() => setMode(null)}>Sluiten</button></div>}
    </div>}
  </div>;
}
