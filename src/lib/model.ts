import { addDays, clone, fmtDur, fmtT, fromISO, num, splitNames, todayISO, toISO, uid, DAYS, cap, mon3 } from './time';

/* ---------- Types ---------- */
export type Cat = { id: string; label: string; color: string };
export type Block = {
  id: string; libId: string | null; title: string; start: number; dur: number; cat: string; minLeaders: number;
  location: string; short: string; desc: string; prep: string; materials: string; names: string[]; pdfPage: boolean;
};
export type Day = { id: string; label: string; start: number; end: number; blocks: Block[] };
export type Opk = {
  id: string; state: 'draft' | 'bank' | 'planned'; srcId: string | null; kind: 'opkomst' | 'kamp'; cats: string[]; lead: string;
  title: string; short: string; group: string; location: string; start: number; end: number; prep: number; post: number;
  days: Day[]; blocks: Block[]; createdAt: number; updatedAt: number;
  /** Bank-opkomst gedeeld met de groep (standaard aan). */
  shared: boolean;
  /** Gekopieerd uit de groepsbank: id van de gedeelde opkomst. */
  fromShared: string | null;
};
export type Lib = { id: string; title: string; dur: number; cat: string; minLeaders: number; location: string; short: string; desc: string; prep: string; materials: string; updatedAt: number };
export type Letter = { needed: boolean; due: string; sent: boolean };
export type Plan = {
  id: string; slot: string | null; date: string; endDate: string; type: 'opkomst' | 'kamp' | 'geen'; topic: string;
  start: number | null; end: number | null; planners: string[]; absent: string[]; letter: Letter; opkId: string | null; note: string; updatedAt: number;
};
export type Settings = {
  categories: Cat[]; leaders: string[]; locations: string[]; defStart: number; defEnd: number; opkDay: number;
  seasonStartMonth: number; seasonEndMonth: number; letterDays: number; letterNotice: number;
  groupName: string; speltak: string; logo: string; logoW: number; logoH: number; accent: string;
  prepMin: number; postMin: number; fixedOn: boolean; fixedOpen: number; fixedClose: number; fixedRanja: number;
};

/* ---------- Vaste gegevens ---------- */
export const SWATCHES = ['#3B6A9C', '#2D7A4F', '#D9792B', '#8A5A2B', '#94477F', '#B5462F', '#4F6B2D', '#5B4FA8', '#1F7A80', '#6B7F99', '#C0466E', '#B87A12', '#7E837A'];
export const DEFAULT_CATS: Cat[] = [
  { id: 'spel', label: 'Spel', color: '#2D7A4F' },
  { id: 'ust', label: 'Uitdagende Scoutingtechnieken', color: '#8A5A2B' },
  { id: 'expressie', label: 'Expressie', color: '#94477F' },
  { id: 'sportspel', label: 'Sport & Spel', color: '#B5462F' },
  { id: 'buitenleven', label: 'Buitenleven', color: '#4F6B2D' },
  { id: 'identiteit', label: 'Identiteit', color: '#5B4FA8' },
  { id: 'internationaal', label: 'Internationaal', color: '#1F7A80' },
  { id: 'samenleving', label: 'Samenleving', color: '#6B7F99' },
  { id: 'veilig', label: 'Veilig & Gezond', color: '#C0466E' },
];
export const FIXED_CATS = [
  { id: '__open', label: 'Vast blok: openen', color: '#3B6A9C', title: 'Openen' },
  { id: '__ranja', label: 'Vast blok: ranja drinken', color: '#D9792B', title: 'Ranja drinken' },
  { id: '__close', label: 'Vast blok: sluiten', color: '#3B6A9C', title: 'Sluiten' },
];
export const OPK_EXTRA: Cat[] = [{ id: 'insigne', label: 'Insigneopkomst', color: '#B87A12' }];
export const SPELTAKKEN = ['Bevers', 'Welpen', 'Scouts', 'Explorers', 'Roverscouts', 'Stam', 'Kabouters', 'Gidsen', 'Groepsbreed'];
export const PREP_OPTS = [0, 15, 30, 45, 60];
export const prepLabel = (m: number) => m ? m + ' min' : 'Geen';
export const ACCENTS: Record<string, { label: string; l: string; ls: string; d: string; ds: string; rgb: number[]; pop: string; popD: string }> = {
  marine: { label: 'Marine', l: '#1E3A5F', ls: '#DEE6F0', d: '#7FA6D4', ds: '#1C2A3D', rgb: [30, 58, 95], pop: '#D98B3A', popD: '#E39A4E' },
  groen: { label: 'Groen', l: '#1F5C41', ls: '#E1EEE6', d: '#6BC497', ds: '#1D3428', rgb: [31, 92, 65], pop: '#F2C14E', popD: '#E3B04B' },
  blauw: { label: 'Blauw', l: '#2B5C9E', ls: '#DCE6F3', d: '#82AAE2', ds: '#1F2D42', rgb: [43, 92, 158], pop: '#F2B544', popD: '#E3A94B' },
  rood: { label: 'Rood', l: '#A83A2E', ls: '#F3DEDA', d: '#E68C80', ds: '#3D2421', rgb: [168, 58, 46], pop: '#F0C86A', popD: '#E0B65A' },
  paars: { label: 'Paars', l: '#5E4596', ls: '#E6E0F2', d: '#B4A1E2', ds: '#2E2640', rgb: [94, 69, 150], pop: '#F1B86B', popD: '#E2A95E' },
  oranje: { label: 'Oranje', l: '#A65A10', ls: '#F4E4D2', d: '#E6A75C', ds: '#3D2D1C', rgb: [166, 90, 16], pop: '#7FC2B5', popD: '#8ED1C4' },
  grijs: { label: 'Grijs', l: '#3B4248', ls: '#E2E5E8', d: '#C3CAD0', ds: '#2A2F33', rgb: [59, 66, 72], pop: '#F2C14E', popD: '#E3B04B' },
};
export const LIB_FIELDS = ['title', 'dur', 'cat', 'minLeaders', 'location', 'short', 'desc', 'prep', 'materials'] as const;

export function defaultSettings(): Settings {
  return { categories: clone(DEFAULT_CATS), leaders: [], locations: [], defStart: 14 * 60, defEnd: 16 * 60 + 30, opkDay: 6,
    seasonStartMonth: 9, seasonEndMonth: 7, letterDays: 14, letterNotice: 14, groupName: '', speltak: '', logo: '', logoW: 0, logoH: 0,
    accent: 'marine', prepMin: 30, postMin: 30, fixedOn: true, fixedOpen: 5, fixedClose: 5, fixedRanja: 15 };
}
export function normSettings(s: any): Settings {
  const d = defaultSettings();
  if (!s) return d;
  const out: Settings = { ...d, ...s };
  out.categories = Array.isArray(s.categories) && s.categories.length ? s.categories.map((c: any) => ({ id: c.id, label: c.label || 'Categorie', color: c.color || SWATCHES[0] })) : d.categories;
  out.leaders = splitNames(s.leaders); out.locations = Array.isArray(s.locations) ? s.locations.filter(Boolean) : [];
  (['defStart', 'defEnd', 'opkDay', 'seasonStartMonth', 'seasonEndMonth', 'letterDays', 'letterNotice', 'logoW', 'logoH', 'prepMin', 'postMin', 'fixedOpen', 'fixedClose', 'fixedRanja'] as const)
    .forEach(k => { (out as any)[k] = num(s[k], (d as any)[k]); });
  out.fixedOn = s.fixedOn !== false;
  if (!ACCENTS[out.accent]) out.accent = 'marine';
  return out;
}

/* ---------- Normalisatie ---------- */
export const isFixed = (b: Pick<Block, 'cat'> | null | undefined) => !!b && typeof b.cat === 'string' && b.cat.startsWith('__');
export function normBlock(b: any): Block {
  return { id: b.id || uid(), libId: b.libId || null, title: b.title || '', start: num(b.start, 0), dur: Math.max(5, num(b.dur, 15)), cat: b.cat || '',
    minLeaders: num(b.minLeaders, 0), location: b.location || '', short: b.short || '', desc: b.desc || '', prep: b.prep || '',
    materials: b.materials || '', names: splitNames(b.names), pdfPage: b.pdfPage !== false };
}
export function normDay(d: any, i = 0): Day {
  const n: Day = { id: d.id || uid(), label: d.label || 'Dag ' + (i + 1), start: num(d.start, 480), end: num(d.end, 1380), blocks: (d.blocks || []).map(normBlock) };
  if (n.end <= n.start) n.end = n.start + 60;
  return n;
}
export const isKamp = (o: Opk | null | undefined) => !!o && o.kind === 'kamp';
/** Planning door: de planners uit de jaarplanning plus een eindverantwoordelijke uit oudere opkomsten (dat veld bestaat niet meer apart). */
export function plannersOf(e: Plan | null | undefined, o?: Opk | null): string[] {
  const out = e ? [...e.planners] : [];
  if (o && o.state !== 'bank' && o.lead && !out.includes(o.lead)) out.push(o.lead);
  return out;
}
export const allBlocks = (o: Opk) => isKamp(o) ? o.days.flatMap(d => d.blocks) : o.blocks;
/** Aanwezige leiding: het team min afwezigen, plus namen die met de hand bij een onderdeel (of als eindverantwoordelijke) zijn gezet. */
export function presentNames(leaders: string[], absent: string[], o?: Opk | null): string[] {
  const out = leaders.filter(n => !absent.includes(n));
  if (o && o.state !== 'bank') [...allBlocks(o).flatMap(b => b.names), o.lead].forEach(n => { if (n && !absent.includes(n) && !out.includes(n)) out.push(n); });
  return out;
}
export function syncKamp(o: Opk) { if (!isKamp(o) || !o.days.length) return; o.start = o.days[0].start; o.end = o.days[o.days.length - 1].end; }
export function normOpk(o: any, s?: Settings): Opk {
  const n: Opk = { id: o.id || uid(), state: ['draft', 'bank', 'planned'].includes(o.state) ? o.state : 'draft', srcId: o.srcId || null,
    kind: o.kind === 'kamp' ? 'kamp' : 'opkomst', cats: Array.isArray(o.cats) ? o.cats.filter((x: any) => typeof x === 'string') : [], lead: typeof o.lead === 'string' ? o.lead : '',
    title: o.title || '', short: o.short || '', group: o.group || '', location: o.location || '',
    start: num(o.start, 840), end: num(o.end, 990), prep: num(o.prep, s ? s.prepMin : 0), post: num(o.post, s ? s.postMin : 0),
    days: [], blocks: (o.blocks || []).map(normBlock), createdAt: o.createdAt || Date.now(), updatedAt: o.updatedAt || Date.now(),
    shared: o.shared !== false, fromShared: typeof o.fromShared === 'string' ? o.fromShared : null };
  if (n.end <= n.start) n.end = n.start + 60;
  if (n.kind === 'kamp') {
    n.prep = 0; n.post = 0; n.blocks = [];
    n.days = (o.days || []).map(normDay);
    if (!n.days.length) n.days = [normDay({ label: 'Zaterdag', start: 480, end: 1380 }, 0)];
    syncKamp(n);
  }
  return n;
}
export function normLib(l: any): Lib {
  return { id: l.id || uid(), title: l.title || '', dur: Math.max(5, num(l.dur, 15)), cat: l.cat || '', minLeaders: Math.max(1, num(l.minLeaders, 1)),
    location: l.location || '', short: l.short || '', desc: l.desc || '', prep: l.prep || '', materials: l.materials || '', updatedAt: l.updatedAt || Date.now() };
}
export function newEntry(slot: string | null, date?: string): Plan {
  return { id: uid(), slot, date: date || slot || todayISO(), endDate: '', type: 'opkomst', topic: '', start: null, end: null,
    planners: [], absent: [], letter: { needed: false, due: '', sent: false }, opkId: null, note: '', updatedAt: Date.now() };
}
export function normPlan(p: any): Plan {
  const L = p.letter || {};
  return { id: p.id || uid(), slot: p.slot || null, date: p.date || p.slot || todayISO(), endDate: p.endDate || '',
    type: ['opkomst', 'kamp', 'geen'].includes(p.type) ? p.type : 'opkomst', topic: p.topic || '',
    start: p.start == null ? null : num(p.start, 0), end: p.end == null ? null : num(p.end, 0),
    planners: splitNames(p.planners), absent: splitNames(p.absent), letter: { needed: !!L.needed, due: L.due || '', sent: !!L.sent },
    opkId: p.opkId || null, note: p.note || '', updatedAt: p.updatedAt || Date.now() };
}

/* ---------- Bouwen ---------- */
export function fixedBlocks(s: Settings, start: number, end: number): Block[] {
  if (!s.fixedOn) return [];
  const len = end - start, out: Block[] = [];
  const mk = (cat: string, st: number, dur: number) => { const f = FIXED_CATS.find(x => x.id === cat)!; return normBlock({ title: f.title, cat, start: st, dur, minLeaders: 0, pdfPage: false }); };
  const o = Math.min(s.fixedOpen, len), c = Math.min(s.fixedClose, Math.max(0, len - o));
  if (o) out.push(mk('__open', start, o));
  if (c) out.push(mk('__close', end - c, c));
  const r = s.fixedRanja, room = len - o - c;
  if (r && room >= r + 10) out.push(mk('__ranja', start + Math.round((len / 2 - r / 2) / 5) * 5, r));
  return out;
}
export function newOpk(s: Settings): Opk {
  return { id: uid(), state: 'draft', srcId: null, kind: 'opkomst', cats: [], lead: '', title: '', short: '', group: s.speltak || '', location: '',
    start: s.defStart, end: s.defEnd, prep: s.prepMin, post: s.postMin, days: [], blocks: fixedBlocks(s, s.defStart, s.defEnd), createdAt: Date.now(), updatedAt: Date.now(), shared: true, fromShared: null };
}
export function kampDaysFor(n: number, firstISO: string | null, st?: number | null, en?: number | null): Day[] {
  const out: Day[] = [];
  for (let i = 0; i < n; i++) {
    const lbl = firstISO ? cap(DAYS[fromISO(addDays(firstISO, i)).getDay()]) : ['Vrijdag', 'Zaterdag', 'Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag'][i % 7];
    const first = i === 0, last = i === n - 1;
    out.push(normDay({ label: lbl, start: first ? (st != null ? st : (n > 1 ? 19 * 60 : 9 * 60)) : 8 * 60, end: last ? (en != null && en > (first ? (st || 0) : 480) ? en : (n > 1 ? 15 * 60 : 17 * 60)) : 23 * 60 }, i));
  }
  return out;
}
export function newKamp(s: Settings, n = 3, firstISO: string | null = null, st?: number | null, en?: number | null): Opk {
  const o = newOpk(s); o.kind = 'kamp'; o.prep = 0; o.post = 0; o.blocks = [];
  o.days = kampDaysFor(n, firstISO, st, en); syncKamp(o); return o;
}
export function blockFromLib(l: Lib, start: number): Block {
  const b = normBlock({}); LIB_FIELDS.forEach(k => { (b as any)[k] = (l as any)[k]; }); b.libId = l.id; b.start = start; return b;
}
export function copyOpk(src: Opk): Opk {
  const o = normOpk(clone(src)); o.id = uid(); allBlocks(o).forEach(b => b.id = uid()); o.days.forEach(d => d.id = uid()); o.createdAt = Date.now(); return o;
}
export function setOpkTime(o: Opk, which: 'start' | 'end', v: number): string | null {
  const os = o.start, oe = o.end; let msg: string | null = null;
  if (which === 'start') { o.start = v; if (o.end <= v) { o.end = v + 60; msg = 'Eindtijd verschoven naar ' + fmtT(o.end); } }
  else { if (v <= o.start) return 'De eindtijd moet na de begintijd liggen.'; o.end = v; }
  o.blocks.forEach(b => {
    if (b.cat === '__open' && b.start === os) b.start = o.start;
    if (b.cat === '__close' && b.start + b.dur === oe) b.start = o.end - b.dur;
    if (b.cat === '__ranja') { const mid = Math.round(((os + oe) / 2 - b.dur / 2) / 5) * 5; if (b.start === mid) b.start = Math.round(((o.start + o.end) / 2 - b.dur / 2) / 5) * 5; }
  });
  return msg === 'De eindtijd moet na de begintijd liggen.' ? msg : msg;
}
export const minNeed = (o: Opk) => allBlocks(o).filter(b => !isFixed(b)).reduce((m, b) => Math.max(m, b.minLeaders || 0), 0);
export const catOf = (s: Settings, id: string): Cat => s.categories.find(c => c.id === id) || (FIXED_CATS.find(c => c.id === id) as Cat) || { id: '', label: 'Zonder categorie', color: '#7E837A' };
export const opkCatList = (s: Settings) => [...s.categories, ...OPK_EXTRA.filter(x => !s.categories.some(c => c.id === x.id))];
export const opkCatOf = (s: Settings, id: string) => opkCatList(s).find(c => c.id === id);
/** Namen in een bank zijn uniek: hoofdletters en spaties aan begin/eind tellen niet mee. */
export const sameName = (a: string, b: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
export const nameTaken = (list: { id: string; title: string }[], title: string, exceptId?: string | null) => !!(title || '').trim() && list.some(x => x.id !== exceptId && sameName(x.title, title));
export function freeName(list: { id: string; title: string }[], base: string) {
  const b = (base || '').trim().replace(/ \(kopie( \d+)?\)$/, '') || 'Naamloos';
  let n = b + ' (kopie)', i = 2; while (nameTaken(list, n)) n = `${b} (kopie ${i++})`; return n;
}
export const byTitle = (a: { title: string }, b: { title: string }) => (a.title || '').localeCompare(b.title || '', 'nl');

/* ---------- Analyse ---------- */
export type Issue = { lvl: 'warn' | 'info'; at: number; id?: string; text: string };
export type Analysis = { total: number; planned: number; free: number; issues: Issue[]; warn: number; per: Record<string, any[]>; clashes: Set<string>; peak: number; present: string[] };
export function analyzeOne(o: { start: number; end: number; blocks: Block[]; prep?: number; post?: number }, present: string[], leaders: string[], nn: boolean): Analysis {
  const total = o.end - o.start, lo = o.start - (o.prep || 0), hi = o.end + (o.post || 0);
  const bl = [...o.blocks].sort((a, b) => a.start - b.start || a.dur - b.dur);
  const issues: Issue[] = [], clashes = new Set<string>(), covered = new Set<number>();
  bl.forEach(b => { for (let m = b.start; m < b.start + b.dur; m += 5) if (m >= o.start && m < o.end) covered.add(m); });
  const planned = covered.size * 5;
  let run: number | null = null;
  for (let m = o.start; m <= o.end; m += 5) {
    const free = m < o.end && !covered.has(m);
    if (free && run == null) run = m;
    if (!free && run != null) { issues.push({ lvl: 'info', at: run, text: `Niet ingepland: ${fmtT(run)}–${fmtT(m)} (${fmtDur(m - run)})` }); run = null; }
  }
  const pres = new Set(present), std = new Set(leaders), per: Record<string, any[]> = {};
  bl.forEach(b => {
    const t = b.title || 'Naamloos onderdeel';
    if (b.start < lo || b.start + b.dur > hi) issues.push({ lvl: 'warn', at: b.start, id: b.id, text: `${t} valt buiten ${fmtT(lo)}–${fmtT(hi)}` });
    if (!nn && b.minLeaders && b.names.length < b.minLeaders) issues.push({ lvl: 'warn', at: b.start, id: b.id, text: `${t}: ${b.names.length} van minimaal ${b.minLeaders} leiding ingedeeld` });
    if (!isFixed(b) && !b.desc && !b.short) issues.push({ lvl: 'info', at: b.start, id: b.id, text: `${t}: nog geen beschrijving` });
    if (!isFixed(b) && !b.location) issues.push({ lvl: 'info', at: b.start, id: b.id, text: `${t}: geen locatie` });
    b.names.forEach(n => {
      (per[n] = per[n] || []).push(b);
      if (std.has(n) && !pres.has(n)) issues.push({ lvl: 'warn', at: b.start, id: b.id, text: `${n} is ingedeeld bij ${t}, maar is afwezig` });
    });
  });
  Object.entries(per).forEach(([n, arr]) => {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a.start < b.start + b.dur && b.start < a.start + a.dur) {
        clashes.add(a.id + '|' + n); clashes.add(b.id + '|' + n);
        issues.push({ lvl: 'warn', at: b.start, id: b.id, text: `${n} staat tegelijk bij ${a.title || 'naamloos'} en ${b.title || 'naamloos'}` });
      }
    }
  });
  const big = bl.filter(b => !isFixed(b)).reduce<Block | null>((m, b) => (b.minLeaders || 0) > (m ? m.minLeaders : 0) ? b : m, null);
  const peak = big ? big.minLeaders : 0;
  if (!nn && peak && pres.size && pres.size < peak) issues.push({ lvl: 'warn', at: big!.start, id: big!.id, text: `Minimaal ${peak} leiding nodig (voor ${big!.title || 'naamloos'}), ${pres.size} aanwezig` });
  issues.sort((a, b) => a.at - b.at);
  return { total, planned, free: Math.max(0, total - planned), issues, warn: issues.filter(i => i.lvl === 'warn').length, per, clashes, peak, present: [...pres] };
}
export function analyze(o: Opk, present: string[], leaders: string[]): Analysis {
  const nn = o.state === 'bank';
  if (!isKamp(o)) return analyzeOne(o, present, leaders, nn);
  const out: Analysis = { total: 0, planned: 0, free: 0, issues: [], warn: 0, per: {}, clashes: new Set(), peak: 0, present };
  o.days.forEach((d, i) => {
    const a = analyzeOne(d, present, leaders, nn);
    out.total += a.total; out.planned += a.planned; out.free += a.free; out.warn += a.warn; out.peak = Math.max(out.peak, a.peak);
    a.issues.forEach(x => out.issues.push({ ...x, text: d.label + ': ' + x.text }));
    Object.entries(a.per).forEach(([n, arr]) => (out.per[n] = out.per[n] || []).push(...arr.map(b => ({ ...b, _day: d.label, _di: i }))));
    a.clashes.forEach(c => out.clashes.add(c));
  });
  return out;
}

/* ---------- Seizoen en planning ---------- */
export function nextOpkDay(s: Settings) { const t = todayISO(); return addDays(t, (s.opkDay - fromISO(t).getDay() + 7) % 7); }
export function seasonOf(s: Settings, iso: string) { const d = fromISO(iso); return d.getMonth() + 1 >= s.seasonStartMonth ? d.getFullYear() : d.getFullYear() - 1; }
export function seasonRange(s: Settings, Y: number) {
  const sm = s.seasonStartMonth, em = s.seasonEndMonth, endY = em >= sm ? Y : Y + 1;
  return { from: toISO(new Date(Y, sm - 1, 1, 12)), to: toISO(new Date(endY, em, 0, 12)) };
}
export const seasonLabel = (s: Settings, Y: number) => s.seasonEndMonth >= s.seasonStartMonth ? String(Y) : `${Y}–${Y + 1}`;
export function opkDaysIn(s: Settings, from: string, to: string) {
  const out: string[] = []; let d = from;
  while (fromISO(d).getDay() !== s.opkDay) d = addDays(d, 1);
  while (d <= to) { out.push(d); d = addDays(d, 7); }
  return out;
}
export type Row = { key: string; e: Plan | null; slot: string | null };
export const rowDate = (r: Row) => r.e ? r.e.date : (r.slot as string);
export const rowEnd = (r: Row) => (r.e && r.e.endDate) || rowDate(r);
export function rowsIn(s: Settings, plans: Plan[], from: string, to: string): Row[] {
  const sats = opkDaysIn(s, from, to), satSet = new Set(sats), rows: Row[] = [];
  sats.forEach(sl => { const e = plans.find(p => p.slot === sl); rows.push(e ? { key: e.id, e, slot: sl } : { key: 's:' + sl, e: null, slot: sl }); });
  plans.forEach(p => {
    if (p.slot && satSet.has(p.slot)) return;
    const end = p.endDate || p.date;
    if (end >= from && p.date <= to) rows.push({ key: p.id, e: p, slot: p.slot });
  });
  rows.sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
  return rows;
}
export function entryTimes(s: Settings, e: Plan | null, o: Opk | null): [number, number] {
  if (o) return [o.start, o.end];
  if (e && e.start != null && e.end != null) return [e.start, e.end];
  return [s.defStart, s.defEnd];
}
export const letterDue = (s: Settings, e: Plan) => e.letter.due || addDays(e.date, -s.letterDays);
export function entryStatus(e: Plan | null, o: Opk | null, warn: number): 'open' | 'off' | 'kamp' | 'warn' | 'ok' | 'topic' {
  if (!e) return 'open';
  if (e.type === 'geen') return 'off';
  if (e.type === 'kamp') return 'kamp';
  if (o) return (!allBlocks(o).length || warn) ? 'warn' : 'ok';
  return e.topic ? 'topic' : 'open';
}
export function dayTitle(o: Opk, i: number, date: string | null, long?: boolean) {
  const d = o.days[i];
  if (!date) return d.label;
  const x = fromISO(date);
  return d.label + ' ' + x.getDate() + ' ' + (long ? ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'][x.getMonth()] : mon3(date));
}
/** Verdeelt overlappende onderdelen over banen naast elkaar. */
export function lanesLayout(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const pos: Record<string, { lane: number; cluster: { ends: number[] } }> = {}; let cluster: { ends: number[] } | null = null, cEnd = -1;
  sorted.forEach(b => {
    if (!cluster || b.start >= cEnd) { cluster = { ends: [] }; cEnd = -1; }
    let lane = cluster.ends.findIndex(x => x <= b.start);
    if (lane < 0) { lane = cluster.ends.length; cluster.ends.push(0); }
    cluster.ends[lane] = b.start + b.dur; cEnd = Math.max(cEnd, b.start + b.dur);
    pos[b.id] = { lane, cluster };
  });
  const out: Record<string, { lane: number; n: number }> = {};
  Object.keys(pos).forEach(id => { out[id] = { lane: pos[id].lane, n: pos[id].cluster.ends.length }; });
  return out;
}
export { addDays as addDaysSafe } from './time';
