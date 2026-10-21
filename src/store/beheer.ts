/*
 * Schrijfacties voor rollen: groepen, beheerders, teamleiders en uitnodigingen.
 * firestore.rules dwingt dezelfde regels af; de UI verbergt wat je niet mag.
 */
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
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
export async function createGroep(name: string, me: Me) {
  const id = mkId() + mkId();
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
