/*
 * Schrijfacties voor rollen: groepen, beheerders, teamleiders en uitnodigingen.
 * firestore.rules dwingt dezelfde regels af; de UI verbergt wat je niet mag.
 */
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { defaultSettings } from '../lib/model';
import { ALL_PERMS, INVITE_DAYS, NO_PERMS, normInvite, normPerms, type Admin, type Groep, type Invite, type InviteKind, type Member, type Perms, type Speltak } from '../lib/types';
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
export type InviteInput = { kind: InviteKind; email: string; gid?: string | null; groupName?: string; sid?: string | null; speltakName?: string; perms?: Perms; transfer?: boolean };
export async function createInvite(inp: InviteInput, me: Me): Promise<Invite> {
  const id = newToken();
  const role = inp.kind === 'teamleider' || inp.kind === 'leiding' ? inp.kind : null;
  const now = Date.now();
  const inv: Invite = {
    id, kind: inp.kind, email: inp.email.trim().toLowerCase(), gid: inp.gid || null, groupName: inp.groupName || '', sid: inp.sid || null, speltakName: inp.speltakName || '',
    role, perms: normPerms(inp.kind === 'leiding' ? inp.perms : inp.kind === 'teamleider' ? ALL_PERMS : NO_PERMS),
    invitedBy: me.uid, invitedByName: me.name, createdAt: now, expiresAt: now + INVITE_DAYS * 864e5, usedBy: null, transfer: !!inp.transfer,
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

/** Openstaande uitnodigingen per niveau ophalen (eenmalig). */
export async function listInvites(by: { all?: boolean; gid?: string; sid?: string }): Promise<Invite[]> {
  const c = collection(db, 'invites');
  const q = by.all ? c : by.gid ? query(c, where('gid', '==', by.gid)) : query(c, where('sid', '==', by.sid));
  const s = await getDocs(q);
  return s.docs.map(d => normInvite(d.id, d.data())).filter(i => !i.usedBy).sort((a, b) => b.createdAt - a.createdAt);
}

/** Uitnodiging accepteren: je krijgt de rol uit de uitnodiging. */
export async function acceptInvite(inv: Invite, me: Me) {
  const admin: Admin = { name: me.name, email: me.email.toLowerCase(), since: Date.now(), inviteId: inv.id };
  if (inv.kind === 'totaal') {
    await updateDoc(doc(db, 'beheer', 'totaal'), { ['people.' + me.uid]: admin, ids: arrayUnion(me.uid) });
  } else if (inv.kind === 'groep') {
    await updateDoc(doc(db, 'groepen', inv.gid!), { ['admins.' + me.uid]: admin, adminIds: arrayUnion(me.uid) });
  } else {
    const member: Member = { name: me.name, email: me.email.toLowerCase(), role: inv.kind, perms: normPerms(inv.perms), inviteId: inv.id, since: Date.now() };
    const ref = doc(db, 'speltakken', inv.sid!);
    const base = { ['members.' + me.uid]: member, memberIds: arrayUnion(me.uid) };
    if (inv.kind === 'teamleider') {
      // Nieuwe speltakken houden teamleiders bij in tlIds; oude (nog niet gekoppelde) niet. De genodigde kan dat niet vooraf zien.
      try { await updateDoc(ref, { ...base, tlIds: arrayUnion(me.uid) }); }
      catch (e: any) { if (e?.code !== 'permission-denied') throw e; await updateDoc(ref, base); }
    } else await updateDoc(ref, base);
    await setDoc(doc(db, 'users', me.uid), { speltakIds: arrayUnion(inv.sid) }, { merge: true });
  }
  await updateDoc(doc(db, 'invites', inv.id), { usedBy: me.uid });
}

/* ---------- Beheer (totaal) ---------- */
export const setRootPerson = (uid: string, p: Admin) => updateDoc(doc(db, 'beheer', 'totaal'), { ['people.' + uid]: p, ids: arrayUnion(uid) });
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
export async function saveAccount(uid: string, name: string, email: string) {
  const em = email.trim().toLowerCase(); if (!em) return;
  await setDoc(doc(db, 'accounts', em), { uid, name: name || em, email: em, updatedAt: Date.now() }, { merge: true });
}
/** Voor- en achternaam opslaan: in je profiel en in je account (zodat beheer het ziet). */
export async function saveProfile(uid: string, email: string, firstName: string, lastName: string) {
  const f = firstName.trim(), l = lastName.trim(), em = email.trim().toLowerCase();
  await setDoc(doc(db, 'users', uid), { firstName: f, lastName: l }, { merge: true });
  if (em) await setDoc(doc(db, 'accounts', em), { uid, email: em, firstName: f, lastName: l, updatedAt: Date.now() }, { merge: true });
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
export async function claimName(gid: string, uid: string, name: string) {
  const k = nameKey(name); if (!k) return;
  const owner = await nameOwner(gid, name);
  if (owner === uid) return;
  if (owner) throw new Error('name-taken');
  await setDoc(doc(db, 'groepen', gid, 'namen', k), { uid, name: name.trim() });
}
/** Naam vrijgeven als hij nog van uid is. */
export async function releaseName(gid: string, uid: string, name: string) {
  if (await nameOwner(gid, name) === uid) await deleteDoc(doc(db, 'groepen', gid, 'namen', nameKey(name)));
}
/** Namen van de groep aanvullen (beheerder): iedereen die al in een speltak zit, krijgt zijn naam vastgelegd. */
export async function syncNames(gid: string, people: Map<string, string>) {
  const s = await getDocs(collection(db, 'groepen', gid, 'namen'));
  const have = new Set(s.docs.map(d => d.id));
  const ops: Promise<unknown>[] = [];
  people.forEach((name, uid) => { const k = nameKey(name); if (k && !have.has(k)) { have.add(k); ops.push(setDoc(doc(db, 'groepen', gid, 'namen', k), { uid, name: name.trim() })); } });
  await Promise.all(ops.map(p => p.catch(() => {})));
}

/** Rechten van een leiding aanpassen (teamleider of beheerder van de groep). Bekijken mag altijd. */
export const setPerms = (sp: Speltak, uid: string, perms: Perms) => updateDoc(doc(db, 'speltakken', sp.id), { ['members.' + uid + '.perms']: normPerms(perms) });
