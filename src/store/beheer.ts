/*
 * Schrijfacties voor rollen: groepen, beheerders, teamleiders en uitnodigingen.
 * firestore.rules dwingt dezelfde regels af; de UI verbergt wat je niet mag.
 */
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { defaultSettings } from '../lib/model';
import { ALL_PERMS, INVITE_DAYS, NO_PERMS, inviteExpired, normInvite, normPerms, type Admin, type Groep, type Invite, type InviteKind, type Member, type PermKey, type Perms, type Speltak } from '../lib/types';
import { uid as mkId } from '../lib/time';

type Me = { uid: string; name: string; email: string };

/** Lange, willekeurige code: de uitnodigingslink is het geheim. */
export function newToken() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
export const inviteUrl = (id: string) => `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/uitnodiging/${id}`;
/** Laat de server (public/api/uitnodiging-mail.php op Strato) de uitnodiging mailen.
 *  'niet-ingesteld' als er (nog) geen mailserver is; dan valt de app terug op de eigen mail. */
export async function sendInviteMail(id: string): Promise<'ok' | 'niet-ingesteld' | string> {
  const u = auth.currentUser;
  if (!u) return 'Je bent niet ingelogd.';
  let r: Response;
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api/uitnodiging-mail.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify({ token: id }),
    });
  } catch { return 'niet-ingesteld'; }
  const data = await r.json().catch(() => null);
  if (!data || r.status === 503 || r.status === 404 && !data.fout) return 'niet-ingesteld';
  return r.ok && data.ok ? 'ok' : (data.fout || 'Versturen mislukt.');
}
export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/* ---------- uitnodigingen ---------- */
/** Vrije tekst in een uitnodiging (komt in de mail): hoogstens 60 tekens, zoals firestore.rules eist. */
const short = (s?: string) => (s || '').trim().slice(0, 60);
export type InviteInput = { kind: InviteKind; email: string; gid?: string | null; groupName?: string; sid?: string | null; speltakName?: string; perms?: Perms; transfer?: boolean };
export async function createInvite(inp: InviteInput, me: Me): Promise<Invite> {
  const id = newToken();
  const role = inp.kind === 'teamleider' || inp.kind === 'leiding' ? inp.kind : null;
  const now = Date.now();
  const inv: Invite = {
    id, kind: inp.kind, email: inp.email.trim().toLowerCase(), gid: inp.gid || null, groupName: short(inp.groupName), sid: inp.sid || null, speltakName: short(inp.speltakName),
    role, perms: normPerms(inp.kind === 'leiding' ? inp.perms : inp.kind === 'teamleider' ? ALL_PERMS : NO_PERMS),
    invitedBy: me.uid, invitedByName: short(me.name), createdAt: now, expiresAt: now + INVITE_DAYS * 864e5, usedBy: null, transfer: !!inp.transfer,
  };
  const { id: _id, ...data } = inv;
  await setDoc(doc(db, 'invites', id), data);
  return inv;
}
export async function readInvite(token: string): Promise<Invite | null> {
  const s = await getDoc(doc(db, 'invites', token));
  return s.exists() ? normInvite(s.id, s.data()) : null;
}
export const revokeInvite = (id: string) => deleteDoc(doc(db, 'invites', id));

const samePerms = (a: Perms, b: Perms) => (Object.keys(ALL_PERMS) as PermKey[]).every(k => !!a[k] === !!b[k]);
/**
 * Uitnodigen zonder dubbele links. Staat er in `open` al een geldige uitnodiging voor dit adres en deze plek, met dezelfde rol,
 * rechten en overdracht, dan is dat de uitnodiging (reused). Anders maakt `make` een nieuwe en gaan de oude voor dit adres en deze plek weg.
 */
export async function inviteOnce(inp: InviteInput, myUid: string, open: Invite[], make: () => Promise<Invite>): Promise<{ inv: Invite; reused: boolean }> {
  const email = inp.email.trim().toLowerCase(), sid = inp.sid || null, gid = inp.gid || null;
  const perms = normPerms(inp.kind === 'leiding' ? inp.perms : inp.kind === 'teamleider' ? ALL_PERMS : NO_PERMS);
  // zelfde plek: dezelfde speltak, of (zonder speltak) dezelfde soort beheer voor dezelfde groep
  const same = open.filter(i => !i.usedBy && i.email === email && i.sid === sid && (sid ? true : i.kind === inp.kind && i.gid === gid));
  // een overdracht hoort bij wie hem maakte: die van een ander hergebruik je niet
  const hit = same.find(i => !inviteExpired(i) && i.kind === inp.kind && i.transfer === !!inp.transfer && samePerms(i.perms, perms) && (!i.transfer || i.invitedBy === myUid));
  if (hit) return { inv: hit, reused: true };
  const inv = await make();
  await Promise.all(same.map(i => revokeInvite(i.id).catch(() => {})));
  return { inv, reused: false };
}
/** Verlopen uitnodiging vernieuwen: eerst een nieuwe met dezelfde rol, rechten en overdracht, daarna gaat de oude weg.
 *  `cur`: de huidige groep en namen (de speltak kan intussen onder een groep hangen of anders heten). */
export async function renewInvite(old: Invite, me: Me, cur?: { gid?: string | null; groupName?: string; speltakName?: string }) {
  const inv = await createInvite({ kind: old.kind, email: old.email, gid: cur && cur.gid !== undefined ? cur.gid : old.gid, groupName: cur?.groupName ?? old.groupName,
    sid: old.sid, speltakName: cur?.speltakName ?? old.speltakName, perms: old.perms, transfer: old.transfer }, me);
  await revokeInvite(old.id).catch(() => {});
  return inv;
}

/** Zit uid al op de plek van deze uitnodiging: lid van de speltak, beheerder van de groep of Beheer (totaal)?
 *  Wie er niet in zit, mag het document meestal niet lezen; dan is het antwoord nee. */
export async function alreadyJoined(inv: Invite, uid: string): Promise<boolean> {
  const has = async (ref: ReturnType<typeof doc>, field: string) => {
    try { const s = await getDoc(ref); return s.exists() && ((s.data() as any)[field] || []).includes(uid); } catch { return false; }
  };
  if (inv.kind === 'totaal') return has(doc(db, 'beheer', 'totaal'), 'ids');
  if (inv.kind === 'groep') return !!inv.gid && has(doc(db, 'groepen', inv.gid), 'adminIds');
  return !!inv.sid && has(doc(db, 'speltakken', inv.sid), 'memberIds');
}
/** Uitnodiging als gebruikt markeren zonder toe te treden, omdat je er al in zit (alleen de genodigde, met bevestigd e-mailadres). */
export const markInviteUsed = (id: string, uid: string) => updateDoc(doc(db, 'invites', id), { usedBy: uid });

/* Openstaande uitnodiging onthouden op dit apparaat: wie later via een andere weg inlogt, ziet hem op Mijn speltakken terug. */
const INV_KEY = 'opk.invite';
export const savedInvite = () => { try { return localStorage.getItem(INV_KEY); } catch { return null; } };
export const rememberInvite = (token: string) => { try { localStorage.setItem(INV_KEY, token); } catch { /* geen opslag */ } };
/** Vergeten, als het (nog) deze uitnodiging is. */
export const forgetInvite = (token: string | undefined) => { try { if (token && localStorage.getItem(INV_KEY) === token) localStorage.removeItem(INV_KEY); } catch { /* geen opslag */ } };

/** Openstaande uitnodigingen per niveau ophalen (eenmalig). */
/** Wie trad toe met een "Mijn rol overdragen"-uitnodiging van `by` in deze speltak? uid's, gecontroleerd aan de uitnodiging zelf. */
export async function transferJoiners(sid: string, by: string): Promise<string[]> {
  const s = await getDocs(query(collection(db, 'invites'), where('sid', '==', sid)));
  return s.docs.map(d => normInvite(d.id, d.data())).filter(i => i.transfer && i.invitedBy === by && !!i.usedBy).map(i => i.usedBy!);
}

/**
 * Uitnodiging accepteren: je krijgt de rol uit de uitnodiging. Toetreden en de uitnodiging als gebruikt markeren
 * gaan in één schrijfactie: lukt het een niet, dan het ander ook niet, en dezelfde link werkt daarna niet nog een keer.
 */
export async function acceptInvite(inv: Invite, me: Me) {
  const admin: Admin = { name: me.name, email: me.email.toLowerCase(), since: Date.now(), inviteId: inv.id };
  const join = (ref: ReturnType<typeof doc>, patch: Record<string, unknown>) => {
    const b = writeBatch(db);
    b.update(ref, patch);
    b.update(doc(db, 'invites', inv.id), { usedBy: me.uid });
    return b.commit();
  };
  if (inv.kind === 'totaal') {
    await join(doc(db, 'beheer', 'totaal'), { ['people.' + me.uid]: admin, ids: arrayUnion(me.uid) });
  } else if (inv.kind === 'groep') {
    await join(doc(db, 'groepen', inv.gid!), { ['admins.' + me.uid]: admin, adminIds: arrayUnion(me.uid) });
  } else {
    // Rol overdragen: je komt binnen als leiding met alle rechten; de teamleider draagt daarna zelf zijn rol aan je over.
    const member: Member = { name: me.name, email: me.email.toLowerCase(), role: inv.kind, perms: normPerms(inv.perms), inviteId: inv.id, since: Date.now() };
    const ref = doc(db, 'speltakken', inv.sid!);
    const base = { ['members.' + me.uid]: member, memberIds: arrayUnion(me.uid) };
    if (inv.kind === 'teamleider') {
      // Nieuwe speltakken houden teamleiders bij in tlIds; oude (nog niet gekoppelde) niet. De genodigde kan dat niet vooraf zien.
      try { await join(ref, { ...base, tlIds: arrayUnion(me.uid) }); }
      catch (e: any) { if (e?.code !== 'permission-denied') throw e; await join(ref, base); }
    } else await join(ref, base);
    await setDoc(doc(db, 'users', me.uid), { speltakIds: arrayUnion(inv.sid) }, { merge: true });
  }
}

/* ---------- Beheer (totaal) ---------- */
export async function removeRootPerson(uid: string, ids: string[]) {
  if (ids.filter(x => x !== uid).length === 0) throw new Error('last');
  await updateDoc(doc(db, 'beheer', 'totaal'), { ['people.' + uid]: deleteField(), ids: ids.filter(x => x !== uid) });
}

/* ---------- groepen ---------- */
export const newGroepId = () => mkId() + mkId();
export async function createGroep(name: string, me: Me, id = newGroepId()) {
  await setDoc(doc(db, 'groepen', id), { name: name.trim(), admins: {}, adminIds: [], createdAt: Date.now(), createdBy: me.uid });
  return id;
}
/** Naam van de groep wijzigen, ook in de speltakken eronder (die tonen hem bovenin). */
export async function renameGroep(g: Groep, name: string, speltakIds: string[]) {
  const b = writeBatch(db);
  b.update(doc(db, 'groepen', g.id), { name: name.trim() });
  speltakIds.forEach(sid => b.update(doc(db, 'speltakken', sid), { groupName: name.trim() }));
  await b.commit();
}
export const setGroupAdmin = (gid: string, uid: string, p: Admin) => updateDoc(doc(db, 'groepen', gid), { ['admins.' + uid]: p, adminIds: arrayUnion(uid) });
export async function removeGroupAdmin(g: Groep, uid: string, allowEmpty = false) {
  const ids = g.adminIds.filter(x => x !== uid);
  if (!ids.length && !allowEmpty) throw new Error('last');
  await updateDoc(doc(db, 'groepen', g.id), { ['admins.' + uid]: deleteField(), adminIds: ids });
}

/* ---------- speltakken onder een groep ---------- */
export async function createSpeltakInGroep(g: Groep, name: string, me: Me) {
  const id = mkId() + mkId();
  const { groupName: _g, speltak: _s, ...settings } = defaultSettings();
  await setDoc(doc(db, 'speltakken', id), { name: name.trim(), groupName: g.name, gid: g.id, createdAt: Date.now(), createdBy: me.uid, settings, members: {}, memberIds: [], tlIds: [] });
  return id;
}
/** Teamleiders volgens de oude manier (rol per lid). */
export const tlFromRoles = (sp: Pick<Speltak, 'members'>) => Object.entries(sp.members).filter(([, m]) => m.role === 'teamleider').map(([u]) => u);
/** Oude speltak aan een groep koppelen; legt meteen de teamleiders vast. */
export const linkSpeltak = (sp: Speltak, g: Groep) => updateDoc(doc(db, 'speltakken', sp.id), { gid: g.id, groupName: g.name, tlIds: sp.tlIds || tlFromRoles(sp) });
/** Zorg dat een speltak tlIds heeft (nodig voor teamleider-uitnodigingen). */
export async function ensureTlIds(sp: Speltak) { if (!sp.tlIds) await updateDoc(doc(db, 'speltakken', sp.id), { tlIds: tlFromRoles(sp) }); }

/** Iemand teamleider maken of weer leiding (beheerder van de groep). */
export async function setTeamleider(sp: Speltak, uid: string, on: boolean) {
  const m = sp.members[uid]; if (!m) return;
  const cur = sp.tlIds || tlFromRoles(sp);
  const next = on ? [...new Set([...cur, uid])] : cur.filter(x => x !== uid);
  await updateDoc(doc(db, 'speltakken', sp.id), { ['members.' + uid]: { ...m, role: on ? 'teamleider' : 'leiding', perms: on ? ALL_PERMS : normPerms(m.perms) }, tlIds: next });
}
/** Teamleiderschap overdragen aan een lid van het team: hij wordt teamleider, jij leiding. */
export async function transferTeamleider(sp: Speltak, from: string, to: string) {
  const a = sp.members[from], b = sp.members[to]; if (!a || !b) return;
  const cur = sp.tlIds || tlFromRoles(sp);
  const next = [...new Set([...cur.filter(x => x !== from), to])];
  await updateDoc(doc(db, 'speltakken', sp.id), {
    ['members.' + to]: { ...b, role: 'teamleider', perms: ALL_PERMS },
    ['members.' + from]: { ...a, role: 'leiding', perms: ALL_PERMS },
    tlIds: next,
  });
}
/** Als teamleider aftreden (je blijft leiding). */
export async function stepDownTeamleider(sp: Speltak, uid: string) {
  const m = sp.members[uid]; if (!m) return;
  const cur = sp.tlIds || tlFromRoles(sp);
  const next = cur.filter(x => x !== uid);
  if (!next.length) throw new Error('last');
  await updateDoc(doc(db, 'speltakken', sp.id), { ['members.' + uid]: { ...m, role: 'leiding', perms: ALL_PERMS }, tlIds: next });
}

/* ---------- bestaande accounts ---------- */
export type Person = { uid: string; name: string; email: string };
/** Eigen account vindbaar maken op e-mailadres (bij elke login). */
export async function saveAccount(uid: string, name: string, email: string, names?: { firstName: string; lastName: string }) {
  const em = email.trim().toLowerCase(); if (!em) return;
  const extra = names && (names.firstName || names.lastName) ? { firstName: names.firstName, lastName: names.lastName } : {};
  await setDoc(doc(db, 'accounts', em), { uid, name: name || em, email: em, ...extra, updatedAt: Date.now() }, { merge: true });
}
/** Voor- en achternaam opslaan: in je profiel en in je account (zodat beheer het ziet). */
export async function saveProfile(uid: string, email: string, firstName: string, lastName: string) {
  const f = firstName.trim(), l = lastName.trim(), em = email.trim().toLowerCase();
  await setDoc(doc(db, 'users', uid), { firstName: f, lastName: l }, { merge: true });
  // lukt pas na het bevestigen van je e-mailadres; daarna zet roles.tsx het alsnog goed
  if (em) await setDoc(doc(db, 'accounts', em), { uid, email: em, firstName: f, lastName: l, updatedAt: Date.now() }, { merge: true }).catch(() => {});
}
export type AccountInfo = { firstName: string; lastName: string };
/** Voor- en achternaam bij e-mailadressen ophalen (voor het leidingoverzicht). */
export async function readAccounts(emails: string[]): Promise<Record<string, AccountInfo>> {
  const out: Record<string, AccountInfo> = {};
  await Promise.all([...new Set(emails.filter(Boolean))].map(async em => {
    try { const s = await getDoc(doc(db, 'accounts', em)); if (s.exists()) { const d = s.data() as any; out[em] = { firstName: d.firstName || '', lastName: d.lastName || '' }; } } catch { /* niet erg */ }
  }));
  return out;
}
/** Account zoeken op e-mailadres; null als die persoon nog nooit heeft ingelogd. */
export async function findAccount(email: string): Promise<Person | null> {
  const em = email.trim().toLowerCase();
  const s = await getDoc(doc(db, 'accounts', em));
  if (!s.exists()) return null;
  const d = s.data() as any;
  return d.uid ? { uid: d.uid, name: d.name || em, email: em } : null;
}

/** Iemand met een account direct in het team zetten, zonder uitnodiging. */
export async function addMember(sp: Speltak, p: Person, role: 'teamleider' | 'leiding', perms: Perms) {
  if (sp.members[p.uid]) throw new Error('member');
  const member: Member = { name: p.name, email: p.email, role, perms: role === 'teamleider' ? ALL_PERMS : normPerms(perms), since: Date.now() };
  const patch: Record<string, unknown> = { ['members.' + p.uid]: member, memberIds: arrayUnion(p.uid) };
  if (role === 'teamleider') patch.tlIds = [...new Set([...(sp.tlIds || tlFromRoles(sp)), p.uid])];
  else if (!sp.tlIds) patch.tlIds = tlFromRoles(sp);
  await updateDoc(doc(db, 'speltakken', sp.id), patch);
}

/**
 * Iemand uit het team halen (beheerder van de groep). Is het de laatste teamleider,
 * dan moet er een opvolger zijn: een lid van het team of iemand met een account.
 */
export async function removeFromTeam(sp: Speltak, uid: string, successor?: Person | null) {
  const cur = sp.tlIds || tlFromRoles(sp);
  let tl = cur.filter(x => x !== uid);
  const patch: Record<string, unknown> = { ['members.' + uid]: deleteField() };
  let ids = sp.memberIds.filter(x => x !== uid);
  if (successor && successor.uid !== uid) {
    const old = sp.members[successor.uid];
    patch['members.' + successor.uid] = old ? { ...old, role: 'teamleider', perms: ALL_PERMS } : { name: successor.name, email: successor.email, role: 'teamleider', perms: ALL_PERMS, since: Date.now() };
    if (!ids.includes(successor.uid)) ids = [...ids, successor.uid];
    tl = [...new Set([...tl, successor.uid])];
  }
  if (cur.includes(uid) && !tl.length) throw new Error('last');
  patch.memberIds = ids; patch.tlIds = tl;
  await updateDoc(doc(db, 'speltakken', sp.id), patch);
}

/** Speltak met alle opkomsten, activiteiten, planning en open uitnodigingen weggooien. Niet terug te draaien. */
export async function deleteSpeltak(sp: Speltak) {
  for (const sub of ['opkomsten', 'activiteiten', 'planning']) {
    const s = await getDocs(collection(db, 'speltakken', sp.id, sub));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db);
      s.docs.slice(i, i + 400).forEach(d => b.delete(doc(db, 'speltakken', sp.id, sub, d.id)));
      await b.commit();
    }
  }
  try {
    const s = await getDocs(sp.gid ? query(collection(db, 'invites'), where('gid', '==', sp.gid), where('sid', '==', sp.id)) : query(collection(db, 'invites'), where('sid', '==', sp.id)));
    await Promise.all(s.docs.map(d => deleteDoc(doc(db, 'invites', d.id))));
  } catch { /* uitnodigingen opruimen is mooi meegenomen */ }
  if (sp.gid) try {
    const s = await getDocs(query(collection(db, 'groepen', sp.gid, 'gedeeld'), where('sid', '==', sp.id)));
    await Promise.all(s.docs.map(d => deleteDoc(doc(db, 'groepen', sp.gid!, 'gedeeld', d.id))));
  } catch { /* gedeelde opkomsten opruimen is mooi meegenomen */ }
  await deleteDoc(doc(db, 'speltakken', sp.id));
}

/* ---------- namen: uniek binnen een groep (zoals een gebruikersnaam) ---------- */
/** Sleutel voor een naam: hoofdletters en extra spaties tellen niet mee. */
export const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\//g, '_').replace(/^\.+$/, '_');
/** Wie heeft deze naam binnen de groep? uid, of null als hij vrij is. */
export async function nameOwner(gid: string, name: string): Promise<string | null> {
  const k = nameKey(name); if (!k) return null;
  const s = await getDoc(doc(db, 'groepen', gid, 'namen', k));
  return s.exists() ? ((s.data() as any).uid || null) : null;
}
/** Naam vastleggen voor uid binnen de groep. Gooit Error('name-taken') als iemand anders hem al heeft. */
export async function claimName(gid: string, uid: string, name: string, inviteId?: string) {
  const k = nameKey(name); if (!k) return;
  const owner = await nameOwner(gid, name);
  if (owner === uid) return;
  if (owner) throw new Error('name-taken');
  try { await setDoc(doc(db, 'groepen', gid, 'namen', k), { uid, name: name.trim(), ...(inviteId ? { inviteId } : {}) }); }
  catch (e: any) {
    // oudere firestore.rules kennen het veld inviteId nog niet
    if (inviteId && e?.code === 'permission-denied') await setDoc(doc(db, 'groepen', gid, 'namen', k), { uid, name: name.trim() });
    else throw e;
  }
}
/** Naam vrijgeven als hij nog van uid is. */
export async function releaseName(gid: string, uid: string, name: string) {
  if (await nameOwner(gid, name) === uid) await deleteDoc(doc(db, 'groepen', gid, 'namen', nameKey(name)));
}
/**
 * Namen van de groep bijhouden (beheerder). Eerst aanvullen: iedereen die al in een speltak zit, krijgt zijn naam vastgelegd.
 * Daarna, met `admins`, opruimen: namen van wie in geen enkele speltak van de groep meer zit en geen beheerder is, komen vrij.
 * Opruimen alleen met de volledige lijst speltakken van de server, nooit met een (mogelijk onvolledige) lijst uit de cache.
 */
export async function syncNames(gid: string, people: Map<string, string>, admins?: string[]) {
  const s = await getDocs(collection(db, 'groepen', gid, 'namen'));
  const have = new Set(s.docs.map(d => d.id));
  const ops: Promise<unknown>[] = [];
  people.forEach((name, uid) => { const k = nameKey(name); if (k && !have.has(k)) { have.add(k); ops.push(setDoc(doc(db, 'groepen', gid, 'namen', k), { uid, name: name.trim() })); } });
  await Promise.all(ops.map(p => p.catch(() => {})));
  if (!admins) return;
  const sps = await getDocs(query(collection(db, 'speltakken'), where('gid', '==', gid)));
  if (s.metadata?.fromCache || sps.metadata?.fromCache) return;
  const keep = new Set([...admins, ...people.keys()]);
  sps.docs.forEach(d => { const ids = (d.data() as any).memberIds; if (Array.isArray(ids)) ids.forEach((u: string) => keep.add(u)); });
  const gone = s.docs.filter(d => { const u = (d.data() as any).uid; return typeof u === 'string' && !keep.has(u); });
  await Promise.all(gone.map(d => deleteDoc(doc(db, 'groepen', gid, 'namen', d.id)).catch(() => {})));
}
/** Na het verlaten van een speltak: je eigen naam in de groep vrijgeven, als je in geen andere speltak van de groep zit en geen beheerder bent. */
export async function releaseOwnName(gid: string, uid: string, name: string, leftSid: string) {
  const s = await getDocs(query(collection(db, 'speltakken'), where('memberIds', 'array-contains', uid)));
  if (s.metadata?.fromCache || s.docs.some(d => d.id !== leftSid && (d.data() as any).gid === gid)) return;
  // de groep lezen mag alleen een beheerder: lukt het niet, dan ben je dat niet
  try { const g = await getDoc(doc(db, 'groepen', gid)); if (g.exists() && ((g.data() as any).adminIds || []).includes(uid)) return; } catch { /* geen beheerder */ }
  await releaseName(gid, uid, name);
}

/** Rechten van een leiding aanpassen (teamleider of beheerder van de groep). Bekijken mag altijd. */
export const setPerms = (sp: Speltak, uid: string, perms: Perms) => updateDoc(doc(db, 'speltakken', sp.id), { ['members.' + uid + '.perms']: normPerms(perms) });

/* ---------- hele groep verwijderen (Beheer totaal) ---------- */
/** Aantal opkomsten in deze speltakken (voor de bevestiging). */
export async function countOpkomsten(sps: Speltak[]) {
  const n = await Promise.all(sps.map(sp => getDocs(collection(db, 'speltakken', sp.id, 'opkomsten')).then(s => s.docs.length).catch(() => 0)));
  return n.reduce((a, b) => a + b, 0);
}
async function wipe(path: [string, ...string[]]) {
  const s = await getDocs(collection(db, ...path));
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = writeBatch(db);
    s.docs.slice(i, i + 400).forEach(d => b.delete(doc(db, ...path, d.id)));
    await b.commit();
  }
}
/**
 * Scoutinggroep met alles eronder weggooien: speltakken (met opkomsten, activiteiten, jaarplanning),
 * groepsbank, namen, groepsleden, open uitnodigingen en als laatste de groep zelf (zodat opnieuw proberen kan).
 * Inlogaccounts blijven bestaan: die kan de website niet wissen. Niet terug te draaien.
 */
export async function deleteGroep(g: Groep, sps: Speltak[]) {
  for (const sp of sps) await deleteSpeltak(sp);
  await wipe(['groepen', g.id, 'gedeeld']);
  await wipe(['groepen', g.id, 'namen']);
  // groepsleden opruimen kan pas met de nieuwe regels; zonder blijven er losse (onschuldige) regels achter
  try { await wipe(['groepen', g.id, 'leden']); } catch { /* oude regels */ }
  const s = await getDocs(query(collection(db, 'invites'), where('gid', '==', g.id)));
  await Promise.all(s.docs.map(d => deleteDoc(doc(db, 'invites', d.id))));
  await deleteDoc(doc(db, 'groepen', g.id));
}
