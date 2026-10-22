import type { Settings } from './model';

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
