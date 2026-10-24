import { normSettings, type Settings } from './model';

export type PermKey = 'plan' | 'build' | 'bank' | 'settings';
export type Perms = Record<PermKey, boolean>;
export type Role = 'teamleider' | 'leiding';
export type Member = { name: string; email: string; role: Role; perms: Perms; inviteId?: string; since: number };
export type Speltak = {
  id: string; name: string; groupName: string; createdAt: number; createdBy: string;
  settings: Settings; members: Record<string, Member>; memberIds: string[];
  /** Groep (Scouting-vereniging) waar de speltak onder valt; leeg bij oude speltakken die nog niet gekoppeld zijn. */
  gid: string | null;
  /** Wie teamleider is; ontbreekt bij oude speltakken (dan telt `members[uid].role`). */
  tlIds: string[] | null;
};
const txt = (v: unknown) => typeof v === 'string' ? v : '';
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Leden en beheerders altijd in dezelfde vorm: naam en e-mail als tekst, rechten als vier ja/nee.
 * Een lid zonder naam (of met een getal of object als naam, bijv. via de API toegevoegd) laat zo nooit Team of Beheer vallen.
 * Iets wat geen object is valt weg (schrijven gaat altijd per lid, via members.uid, dus dat raakt niets).
 */
export function normMembers(m: unknown): Record<string, Member> {
  const out: Record<string, Member> = {};
  if (isObj(m)) Object.entries(m).forEach(([u, x]) => {
    if (!isObj(x)) return;
    out[u] = { ...x, name: txt(x.name), email: txt(x.email), role: x.role === 'teamleider' ? 'teamleider' : 'leiding', perms: normPerms(x.perms), since: typeof x.since === 'number' ? x.since : 0 };
    if (typeof x.inviteId !== 'string') delete out[u].inviteId;
  });
  return out;
}
export function normAdmins(m: unknown): Record<string, Admin> {
  const out: Record<string, Admin> = {};
  if (isObj(m)) Object.entries(m).forEach(([u, x]) => {
    if (!isObj(x)) return;
    out[u] = { name: txt(x.name), email: txt(x.email), since: typeof x.since === 'number' ? x.since : 0, ...(typeof x.inviteId === 'string' ? { inviteId: x.inviteId } : {}) };
  });
  return out;
}
/** Speltak uit Firestore; de naam en groepsnaam staan ook in de instellingen (voor pdf en kop). */
export function normSpeltak(id: string, d: any): Speltak {
  return { id, name: txt(d.name), groupName: txt(d.groupName), createdAt: d.createdAt || 0, createdBy: d.createdBy || '',
    settings: normSettings({ ...d.settings, groupName: txt(d.groupName), speltak: txt(d.name) }), members: normMembers(d.members), memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
    gid: d.gid || null, tlIds: Array.isArray(d.tlIds) ? d.tlIds : null };
}
/** Beheerder van een groep of van het geheel. */
export type Admin = { name: string; email: string; since: number; inviteId?: string };
/** Een Scouting-vereniging met eigen beheerders. */
export type Groep = { id: string; name: string; admins: Record<string, Admin>; adminIds: string[]; createdAt: number; createdBy: string };
/** Beheer (totaal): het hoogste niveau. */
export type Root = { ids: string[]; people: Record<string, Admin> };
/** Soort uitnodiging = de rol die je krijgt. */
export type InviteKind = 'totaal' | 'groep' | 'teamleider' | 'leiding';
export type Invite = {
  id: string; kind: InviteKind; email: string;
  gid: string | null; groupName: string; sid: string | null; speltakName: string;
  role: Role | null; perms: Perms;
  invitedBy: string; invitedByName: string; createdAt: number; expiresAt: number; usedBy: string | null;
  /** De uitnodiger wil zijn eigen rol overdragen: na acceptatie draagt hij zijn rol over aan de genodigde. */
  transfer: boolean;
};
export const KIND_LABELS: Record<InviteKind, string> = { totaal: 'Beheer (totaal)', groep: 'Beheer (groep)', teamleider: 'Teamleider', leiding: 'Leiding' };
export const INVITE_DAYS = 30;
/** Het hoofdaccount; alleen dit account mag Beheer (totaal) de eerste keer aanmaken (ook vastgelegd in firestore.rules). */
export const ROOT_EMAIL = 'vluiten2907@gmail.com';
export function normInvite(id: string, d: any): Invite {
  const kind: InviteKind = d.kind || d.role || 'leiding';
  return { id, kind, email: d.email || '', gid: d.gid || null, groupName: d.groupName || '', sid: d.sid || null, speltakName: d.speltakName || '',
    role: d.role || (kind === 'teamleider' || kind === 'leiding' ? kind : null), perms: normPerms(d.perms),
    invitedBy: d.invitedBy || '', invitedByName: d.invitedByName || '', createdAt: d.createdAt || 0,
    expiresAt: d.expiresAt || (d.createdAt || 0) + INVITE_DAYS * 864e5 * 100, usedBy: d.usedBy || null, transfer: !!d.transfer };
}
export const inviteExpired = (i: Invite) => i.expiresAt < Date.now();
/** Waarvoor de uitnodiging is: de hele planner, een groep, of groep · speltak. */
export const inviteWhere = (i: Invite, whole: string) => i.kind === 'totaal' ? whole : i.kind === 'groep' ? i.groupName : [i.groupName, i.speltakName].filter(Boolean).join(' · ');
/** Is deze persoon teamleider van de speltak? (nieuw: tlIds, oud: rol in members) */
export function isTeamleider(sp: Pick<Speltak, 'tlIds' | 'members'> | null | undefined, uid: string | undefined | null): boolean {
  if (!sp || !uid || !sp.members[uid]) return false;
  return sp.tlIds ? sp.tlIds.includes(uid) : sp.members[uid].role === 'teamleider';
}
export const PERM_LABELS: Record<PermKey, string> = { plan: 'Jaarplanning', build: 'Opkomsten', bank: 'Banken', settings: 'Instellingen' };
export const PERM_HELP: Record<PermKey, string> = {
  plan: 'Onderwerpen, planners, afwezigheid en brieven in de jaarplanning aanpassen. Samen met Opkomsten of Banken ook opkomsten koppelen.',
  build: 'Opkomsten en kampen bouwen, bewerken en leiding indelen.',
  bank: 'Activiteitenbank en opkomstenbank bewerken.',
  settings: 'Instellingen van de speltak aanpassen (niet het team).',
};
export const ALL_PERMS: Perms = { plan: true, build: true, bank: true, settings: true };
export const NO_PERMS: Perms = { plan: false, build: false, bank: false, settings: false };
export const DEFAULT_LEIDING_PERMS: Perms = { plan: true, build: true, bank: true, settings: false };
export function normPerms(p: any): Perms { return { plan: !!p?.plan, build: !!p?.build, bank: !!p?.bank, settings: !!p?.settings }; }
