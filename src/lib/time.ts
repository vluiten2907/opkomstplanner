// Tijd en datum: 24-uurs, dd-mm-jjjj, weken van maandag t/m zondag.
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtT = (m: number) => pad2(Math.floor((((m % 1440) + 1440) % 1440) / 60)) + ':' + pad2(((m % 60) + 60) % 60);
export const fmtDur = (d: number) => d < 60 ? d + ' min' : Math.floor(d / 60) + ' u' + (d % 60 ? ' ' + (d % 60) + ' min' : '');
export const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
export const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const toISO = (d: Date) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const fromISO = (s: string) => new Date(s + 'T12:00:00');
export const todayISO = () => toISO(new Date());
export const addDays = (iso: string, n: number) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const dayDiff = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5);
export const fmtNL = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
export const wd2 = (iso: string) => DAYS[fromISO(iso).getDay()].slice(0, 2);
/** Vaste Nederlandse afkortingen (maart = mrt, niet 'maa'). */
export const MON3 = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const mon3 = (iso: string) => MON3[fromISO(iso).getMonth()];
export const fmtShort = (iso: string) => `${wd2(iso)} ${fromISO(iso).getDate()} ${mon3(iso)}`;
export const fmtLong = (iso: string) => { const d = fromISO(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const cap = (x: string) => x ? x[0].toUpperCase() + x.slice(1) : x;
export function fmtRange(d: string, end?: string | null, long?: boolean) {
  if (!end || end === d) return long ? fmtLong(d) : fmtShort(d);
  const a = fromISO(d), b = fromISO(end), sameM = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (long) return `${DAYS[a.getDay()]} ${a.getDate()}${sameM ? '' : ' ' + MONTHS[a.getMonth()]} t/m ${DAYS[b.getDay()]} ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${wd2(d)} ${a.getDate()}${sameM ? '' : ' ' + mon3(d)} – ${wd2(end)} ${b.getDate()} ${mon3(end)}`;
}
/**
 * Datum zoals je hem typt: dd-mm-jjjj (ook met . / of spatie, jaartal 2 of 4 cijfers), of alleen cijfers
 * (een iPhone geeft bij een cijferveld geen streepje): ddmmjjjj, ddmmjj.
 * Zonder jaartal (7-11, 07-11, 7/11 of 0711) = de eerstvolgende keer vanaf `today`.
 */
export function parseNL(s: string, today = todayISO()): string | null {
  const t = (s || '').trim();
  // jaartal: 2 of 4 cijfers (een tikfout als 202 geeft anders een rij in het jaar 202), of helemaal geen
  const m = /^(\d{1,2})[-./ ](\d{1,2})(?:[-./ ](\d{2}|\d{4}))?$/.exec(t) || /^(\d{2})(\d{2})(\d{2}|\d{4})?$/.exec(t);
  if (!m) return null;
  const day = +m[1], mon = +m[2];
  const at = (y: number) => { const d = new Date(y, mon - 1, day, 12); return d.getMonth() === mon - 1 && d.getDate() === day ? toISO(d) : null; };
  if (!m[3]) {
    // zonder jaartal: dit jaar, of volgend jaar als de datum al voorbij is
    const y0 = +today.slice(0, 4), a = at(y0);
    return a && a >= today ? a : at(y0 + 1);
  }
  let y = +m[3]; if (m[3].length === 2) y += 2000;
  if (y < 2000 || y > 2100) return null;
  return at(y);
}
/**
 * Een getypte datum netjes als dd-mm-jjjj zetten (bij wegklikken); klopt hij niet, dan blijft hij staan zoals hij is.
 * `ref`: zonder jaartal de eerstvolgende keer vanaf deze datum (bijv. "tot en met" vanaf de begindatum), anders vanaf vandaag.
 */
export const tidyNL = (s: string, ref?: string | null) => { const iso = s.trim() ? parseNL(s, ref || undefined) : null; return iso ? fmtNL(iso) : s; };
/**
 * Datum en "tot en met" (dd-mm-jjjj) als ISO, of de foutmelding. Leeg "tot en met" = één dag (endIso '').
 * "Tot en met" zonder jaartal is de eerstvolgende keer vanaf de datum (niet vanaf vandaag: dan werd het een periode van ruim een jaar).
 */
export function parseRange(date: string, end: string, today = todayISO()): { iso: string; endIso: string } | { error: string } {
  const iso = parseNL(date, today), endIso = end.trim() ? parseNL(end, iso || today) : '';
  if (!iso) return { error: 'Typ de datum als dd-mm-jjjj.' };
  if (endIso === null) return { error: 'Typ "tot en met" als dd-mm-jjjj, of laat het leeg.' };
  if (endIso && endIso < iso) return { error: '"Tot en met" moet na de datum liggen.' };
  return { iso, endIso };
}
export function isoWeek(iso: string) {
  const d = fromISO(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}
export const splitNames = (s: unknown): string[] => Array.isArray(s) ? s.map(x => String(x).trim()).filter(Boolean) : String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
export const splitLines = (s: unknown): string[] => String(s || '').split(/\n+/).map(x => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
export const plural = (n: number, one: string, more: string) => n + ' ' + (n === 1 ? one : more);
/** Initialen voor het rondje bij een naam: alleen letters en cijfers (geen haakjes, aanhalingstekens of emoji), hooguit twee. "Beheer (demo)" → BD. */
export const initials = (n: string) => ((String(n || '').match(/[\p{L}\p{N}]+/gu) || ['?']).map(w => [...w][0]).join('').slice(0, 2)).toUpperCase();
export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
export const num = (v: unknown, d: number) => (v === null || v === undefined || v === '' || !Number.isFinite(+(v as any))) ? d : +(v as any);
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
