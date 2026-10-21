import type { Settings } from './model';

export type PermKey = 'plan' | 'build' | 'bank' | 'settings';
export type Perms = Record<PermKey, boolean>;
export type Role = 'teamleider' | 'leiding';
export type Member = { name: string; email: string; role: Role; perms: Perms; inviteId?: string; since: number };
export type Speltak = {
  id: string; name: string; groupName: string; createdAt: number; createdBy: string;
  settings: Settings; members: Record<string, Member>; memberIds: string[];
};
export type Invite = {
  id: string; sid: string; speltakName: string; groupName: string; email: string; role: Role; perms: Perms;
  invitedBy: string; invitedByName: string; createdAt: number; usedBy: string | null;
};
export const PERM_LABELS: Record<PermKey, string> = { plan: 'Jaarplanning', build: 'Opkomsten', bank: 'Banken', settings: 'Instellingen' };
export const PERM_HELP: Record<PermKey, string> = {
  plan: 'Onderwerpen, planners, afwezigheid en brieven in de jaarplanning aanpassen en opkomsten koppelen.',
  build: 'Opkomsten en kampen bouwen, bewerken en leiding indelen.',
  bank: 'Activiteitenbank en opkomstenbank bewerken.',
  settings: 'Instellingen van de speltak aanpassen (niet het team).',
};
export const ALL_PERMS: Perms = { plan: true, build: true, bank: true, settings: true };
export const NO_PERMS: Perms = { plan: false, build: false, bank: false, settings: false };
export const DEFAULT_LEIDING_PERMS: Perms = { plan: true, build: true, bank: true, settings: false };
export function normPerms(p: any): Perms { return { plan: !!p?.plan, build: !!p?.build, bank: !!p?.bank, settings: !!p?.settings }; }
