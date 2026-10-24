import { addDays, clone, dayDiff, fmtDur, fmtRange, fmtT, fromISO, num, plural, splitLines, splitNames, todayISO, toISO, uid, wd2, DAYS, MONTHS, cap, mon3 } from './time.ts';

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
/** Naam van elke kleur in SWATCHES (voor schermlezers; de categorie bewaart de hexcode). */
export const SWATCH_NAMES: Record<string, string> = {
  '#3B6A9C': 'Blauw', '#2D7A4F': 'Groen', '#D9792B': 'Oranje', '#8A5A2B': 'Bruin', '#94477F': 'Pruim', '#B5462F': 'Rood', '#4F6B2D': 'Olijfgroen',
  '#5B4FA8': 'Violet', '#1F7A80': 'Petrol', '#6B7F99': 'Grijsblauw', '#C0466E': 'Framboos', '#B87A12': 'Oker', '#7E837A': 'Grijs',
};
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
  oranje: { label: 'Oranje', l: '#95510E', ls: '#F4E4D2', d: '#E6A75C', ds: '#3D2D1C', rgb: [149, 81, 14], pop: '#7FC2B5', popD: '#8ED1C4' },
  grijs: { label: 'Grijs', l: '#3B4248', ls: '#E2E5E8', d: '#C3CAD0', ds: '#2A2F33', rgb: [59, 66, 72], pop: '#F2C14E', popD: '#E3B04B' },
};
export const LIB_FIELDS = ['title', 'dur', 'cat', 'minLeaders', 'location', 'short', 'desc', 'prep', 'materials'] as const;
/** Velden die een onderdeel en een activiteit uit de bank delen. */
export type LibFields = Pick<Lib, typeof LIB_FIELDS[number]>;
/** Alleen de gedeelde velden (titel, duur, categorie, …) van een onderdeel of activiteit, om over te zetten naar de ander. */
export const libFields = (x: LibFields): LibFields => Object.fromEntries(LIB_FIELDS.map(k => [k, x[k]])) as LibFields;

export function defaultSettings(): Settings {
  return { categories: clone(DEFAULT_CATS), leaders: [], locations: [], defStart: 14 * 60, defEnd: 16 * 60 + 30, opkDay: 6,
    seasonStartMonth: 9, seasonEndMonth: 7, letterDays: 14, letterNotice: 14, groupName: '', speltak: '', logo: '', logoW: 0, logoH: 0,
    accent: 'marine', prepMin: 30, postMin: 30, fixedOn: true, fixedOpen: 5, fixedClose: 5, fixedRanja: 15 };
}
/** Alleen een kleur als #rrggbb (zoals de kleurkeuze en de pdf die kennen); anders `d`. Een kleur uit de groepsbank of een back-up kan zo geen CSS meesturen. */
export const hexColor = (c: unknown, d: string) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d;
export function normSettings(s: any): Settings {
  const d = defaultSettings();
  if (!s) return d;
  const out: Settings = { ...d, ...s };
  out.categories = Array.isArray(s.categories) && s.categories.length ? s.categories.map((c: any) => ({ id: c.id, label: c.label || 'Categorie', color: hexColor(c.color, SWATCHES[0]) })) : d.categories;
  out.leaders = splitNames(s.leaders); out.locations = Array.isArray(s.locations) ? s.locations.filter(Boolean) : [];
  (['defStart', 'defEnd', 'opkDay', 'seasonStartMonth', 'seasonEndMonth', 'letterDays', 'letterNotice', 'logoW', 'logoH', 'prepMin', 'postMin', 'fixedOpen', 'fixedClose', 'fixedRanja'] as const)
    .forEach(k => { (out as any)[k] = num(s[k], (d as any)[k]); });
  out.fixedOn = s.fixedOn !== false;
  if (!ACCENTS[out.accent]) out.accent = 'marine';
  return out;
}

/* ---------- Normalisatie ---------- */
export const isFixed = (b: Pick<Block, 'cat'> | null | undefined) => !!b && typeof b.cat === 'string' && b.cat.startsWith('__');
/** Tekstveld altijd als tekst: een getal of object (oude data, of geschreven door een andere speltak in de groepsbank) laat anders een pagina vallen. */
export const str = (v: unknown) => typeof v === 'string' ? v : '';
export function normBlock(b: any): Block {
  b = b && typeof b === 'object' ? b : {};
  return { id: b.id || uid(), libId: b.libId || null, title: str(b.title), start: num(b.start, 0), dur: Math.max(5, num(b.dur, 15)), cat: str(b.cat),
    minLeaders: num(b.minLeaders, 0), location: str(b.location), short: str(b.short), desc: str(b.desc), prep: str(b.prep),
    materials: str(b.materials), names: splitNames(b.names), pdfPage: b.pdfPage !== false };
}
/** Krijgt een onderdeel een eigen uitlegpagina in de pdf? Alleen als dat aan staat én er iets te lezen is (beschrijving, voorbereiding of materiaal). */
export const hasPdfPage = (b: Pick<Block, 'pdfPage' | 'desc' | 'prep' | 'materials'>) =>
  b.pdfPage !== false && !!((b.desc || '').trim() || (b.prep || '').trim() || splitLines(b.materials).length);
export function normDay(d: any, i = 0): Day {
  d = d && typeof d === 'object' ? d : {};
  const n: Day = { id: d.id || uid(), label: str(d.label) || 'Dag ' + (i + 1), start: num(d.start, 480), end: num(d.end, 1380), blocks: (Array.isArray(d.blocks) ? d.blocks : []).map(normBlock) };
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
    title: str(o.title), short: str(o.short), group: str(o.group), location: str(o.location),
    start: num(o.start, 840), end: num(o.end, 990), prep: num(o.prep, s ? s.prepMin : 0), post: num(o.post, s ? s.postMin : 0),
    days: [], blocks: (Array.isArray(o.blocks) ? o.blocks : []).map(normBlock), createdAt: num(o.createdAt, 0) || Date.now(), updatedAt: num(o.updatedAt, 0) || Date.now(),
    shared: o.shared !== false, fromShared: typeof o.fromShared === 'string' ? o.fromShared : null };
  if (n.end <= n.start) n.end = n.start + 60;
  if (n.kind === 'kamp') {
    n.prep = 0; n.post = 0; n.blocks = [];
    n.days = (Array.isArray(o.days) ? o.days : []).map(normDay);
    if (!n.days.length) n.days = [normDay({ label: 'Zaterdag', start: 480, end: 1380 }, 0)];
    // vaste blokken horen niet in een kamp (bijv. ooit ingepland via een vast blok uit de activiteitenbank): gewoon onderdeel, met categoriekeuze
    n.days.forEach(d => d.blocks.forEach(b => { if (isFixed(b)) b.cat = ''; }));
    syncKamp(n);
  }
  // de opkomstenbank bevat geen namen, ook niet uit een back-up of oude data
  if (n.state === 'bank') { n.lead = ''; allBlocks(n).forEach(b => { b.names = []; }); }
  return n;
}
/** Activiteit uit de bank. Een vast blok (Openen, Ranja, Sluiten) is in de bank een gewone activiteit: zijn '__'-categorie valt weg. */
export function normLib(l: any): Lib {
  const cat = str(l.cat);
  return { id: l.id || uid(), title: str(l.title), dur: Math.max(5, num(l.dur, 15)), cat: cat.startsWith('__') ? '' : cat, minLeaders: Math.max(0, num(l.minLeaders, 1)),
    location: str(l.location), short: str(l.short), desc: str(l.desc), prep: str(l.prep), materials: str(l.materials), updatedAt: num(l.updatedAt, 0) || Date.now() };
}
export function newEntry(slot: string | null, date?: string): Plan {
  return { id: uid(), slot, date: date || slot || todayISO(), endDate: '', type: 'opkomst', topic: '', start: null, end: null,
    planners: [], absent: [], letter: { needed: false, due: '', sent: false }, opkId: null, note: '', updatedAt: Date.now() };
}
/** Rij in de jaarplanning zonder inhoud: een gewone opkomst op zijn eigen datum, zonder onderwerp, opmerking, programma, planners, afwezigen, brief of eigen tijden. */
export function isBlankPlan(e: Plan) {
  return e.type === 'opkomst' && (!e.slot || e.date === e.slot) && !e.endDate && !e.topic.trim() && !e.note.trim() && !e.opkId
    && !e.planners.length && !e.absent.length && !e.letter.needed && e.start == null && e.end == null;
}
export function normPlan(p: any): Plan {
  const L = p.letter || {};
  return { id: p.id || uid(), slot: p.slot || null, date: p.date || p.slot || todayISO(), endDate: p.endDate || '',
    type: ['opkomst', 'kamp', 'geen'].includes(p.type) ? p.type : 'opkomst', topic: str(p.topic),
    start: p.start == null ? null : num(p.start, 0), end: p.end == null ? null : num(p.end, 0),
    planners: splitNames(p.planners), absent: splitNames(p.absent), letter: { needed: !!L.needed, due: L.due || '', sent: !!L.sent },
    opkId: p.opkId || null, note: str(p.note), updatedAt: num(p.updatedAt, 0) || Date.now() };
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
/** Onderdelen van het programma, zonder de vaste blokken (openen, ranja, sluiten): voor tellingen als "3 onderdelen". */
export const progBlocks = (o: Opk) => allBlocks(o).filter(b => !isFixed(b));
/** Programma nog leeg: alleen de vaste blokken, of helemaal niets (kamp: dagen zonder onderdelen). */
export const progEmpty = (o: Opk) => !progBlocks(o).length;
/** Nog niets ingevuld: geen titel, beschrijving, locatie of categorie, en alleen de vaste blokken (kamp: dagen zonder onderdelen). */
export const isBlankOpk = (o: Opk) => !o.title.trim() && !o.short.trim() && !o.location.trim() && !o.cats.length && progEmpty(o);
/** Zoektekst van een activiteit: alles wat je in de editor ziet (ook de uitgebreide beschrijving, voorbereiding en materiaal). */
export const libSearchText = (l: Lib) => [l.title, l.short, l.desc, l.location, l.prep, l.materials].join(' ').toLowerCase();
/** Zoektekst van een opkomst: titel, beschrijving, locatie en de onderdelen (zonder de vaste blokken). */
export const opkSearchText = (o: Opk) => [o.title, o.short, o.location, ...allBlocks(o).filter(b => !isFixed(b)).map(b => b.title)].join(' ').toLowerCase();
const TOPIC_SKIP = new Set(['opkomst', 'opkomsten', 'spel', 'spellen', 'avond', 'middag', 'ochtend', 'weekend', 'kamp', 'voor', 'naar', 'met', 'van', 'het', 'een', 'and', 'de', 'en', 'in', 'op']);
const topicWords = (s: string, min: number) => (s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= min && !TOPIC_SKIP.has(w));
/** Past een opkomst bij het onderwerp van een datum? Een woord uit het onderwerp staat in de titel of beschrijving, of een woord uit de titel in het onderwerp. */
export function fitsTopic(o: Pick<Opk, 'title' | 'short'>, topic: string) {
  const t = (topic || '').toLowerCase(), own = (o.title + ' ' + o.short).toLowerCase();
  return topicWords(t, 3).some(w => own.includes(w)) || (!!t.trim() && topicWords(o.title, 4).some(w => t.includes(w)));
}
/**
 * Wat past bij het onderwerp van een datum zonder programma (Nog zonder programma in de opkomstbouwer, Gebruiken op het dashboard):
 * eerst een concept (het laatst aangepaste eerst), anders iets uit de opkomstenbank (op titel). Ingeplande opkomsten tellen niet mee.
 */
export function fitFor(opks: Opk[], topic: string): Opk | undefined {
  if (!(topic || '').trim()) return undefined;
  const drafts = opks.filter(x => x.state === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const bank = opks.filter(x => x.state === 'bank').sort(byTitle);
  return [...drafts, ...bank].find(x => fitsTopic(x, topic));
}
/** Standaardtijden van een kamp zonder eigen tijden: meer dagen vertrek 19:00 en terug 15:00, één dag 09:00–17:00. */
export const KAMP_START = 19 * 60, KAMP_END = 15 * 60, KAMPDAG_START = 9 * 60, KAMPDAG_END = 17 * 60;
export const kampTimes = (n: number): [number, number] => n > 1 ? [KAMP_START, KAMP_END] : [KAMPDAG_START, KAMPDAG_END];
/** Tijden van een rij in de jaarplanning zonder eigen tijden: een kamp de kamptijden, anders de standaard opkomsttijden. */
export function defaultTimes(s: Settings, type: Plan['type'], date: string, endDate?: string | null): [number, number] {
  return type === 'kamp' ? kampTimes(kampLength(date, endDate)) : [s.defStart, s.defEnd];
}
/**
 * Heeft een rij in de jaarplanning eigen tijden? Alleen als ze afwijken van de standaardtijden van zijn soort en datums:
 * oudere rijen hebben de standaard soms opgeslagen, die volgen gewoon de soort (en latere standaardtijden).
 */
export function ownTimes(s: Settings, e: Plan | null | undefined) {
  if (!e || e.start == null || e.end == null) return false;
  const [a, b] = defaultTimes(s, e.type, e.date, e.endDate);
  return e.start !== a || e.end !== b;
}
export function kampDaysFor(n: number, firstISO: string | null, st?: number | null, en?: number | null): Day[] {
  const out: Day[] = [], [dSt, dEn] = kampTimes(n);
  for (let i = 0; i < n; i++) {
    const lbl = firstISO ? cap(DAYS[fromISO(addDays(firstISO, i)).getDay()]) : ['Vrijdag', 'Zaterdag', 'Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag'][i % 7];
    const first = i === 0, last = i === n - 1;
    out.push(normDay({ label: lbl, start: first ? (st != null ? st : dSt) : 8 * 60, end: last ? (en != null && en > (first ? (st || 0) : 480) ? en : dEn) : 23 * 60 }, i));
  }
  return out;
}
export function newKamp(s: Settings, n = 3, firstISO: string | null = null, st?: number | null, en?: number | null): Opk {
  const o = newOpk(s); o.kind = 'kamp'; o.prep = 0; o.post = 0; o.blocks = [];
  o.days = kampDaysFor(n, firstISO, st, en); syncKamp(o); return o;
}
/** Aantal kampdagen: t/m de einddatum (hooguit 14), of zonder einddatum t/m de eerstvolgende zondag (vr 3, za 2, zo 1; andere dagen 3). */
export function kampLength(date: string, endDate?: string | null) {
  if (endDate) return Math.max(1, Math.min(14, dayDiff(date, endDate) + 1));
  const toSun = (7 - fromISO(date).getDay()) % 7 + 1;
  return toSun <= 3 ? toSun : 3;
}
/**
 * Einddatum van een rij zoals je hem ziet: een kamp-rij zonder "tot en met" en zonder programma loopt t/m de eerstvolgende
 * zondag (zoals een nieuw weekendkamp vanaf die rij, zie kampLength); anders de einddatum zelf (leeg = één dag).
 */
export function shownEnd(e: Pick<Plan, 'type' | 'date' | 'endDate' | 'opkId'> | null | undefined) {
  if (!e) return '';
  if (e.endDate || e.type !== 'kamp' || e.opkId) return e.endDate || '';
  const n = kampLength(e.date);
  return n > 1 ? addDays(e.date, n - 1) : '';
}
/** Is de naam van een kampdag gewoon een weekdag ("Zaterdag")? Dan volgt hij de datum. */
export const isWeekdayLabel = (l: string) => DAYS.includes((l || '').trim().toLowerCase());
/**
 * Begindatum van een kamp dat op `date` wordt ingepland (een rij zonder "tot en met").
 * Heet de eerste dag naar een weekdag die vlak vóór `date` ligt, dan begint het kamp op die dag:
 * een kamp vr–zo op de vaste zaterdag loopt van de vrijdag ervoor t/m zondag. Valt `date` dan niet meer
 * binnen het kamp (bijv. vr–zo op een donderdag), of heet de eerste dag niet naar een weekdag, dan blijft `date`.
 */
export function kampStart(o: Opk, date: string) {
  if (!isKamp(o) || !o.days.length || isNaN(fromISO(date).getTime())) return date;
  const w = DAYS.indexOf((o.days[0].label || '').trim().toLowerCase());
  if (w < 0) return date;
  const back = (fromISO(date).getDay() - w + 7) % 7;
  return back > 0 && back < o.days.length ? addDays(date, -back) : date;
}
/**
 * Past een kamp qua lengte bij een rij in de jaarplanning (datum t/m "tot en met"; zonder einddatum één dag)?
 * Null als het klopt, anders het aantal dagen van het programma en van de rij. De jaarplanning gaat voor:
 * de kampdagen tellen altijd vanaf de datum, dus bij een verschil schuiven ze (een kamp vr–zo op een rij za–zo loopt za–ma).
 */
export function kampMismatch(o: Opk, date: string, endDate?: string | null): { prog: number; row: number } | null {
  if (!isKamp(o) || isNaN(fromISO(date).getTime())) return null;
  const row = endDate && endDate > date ? dayDiff(date, endDate) + 1 : 1;
  return row === o.days.length ? null : { prog: o.days.length, row };
}
/** Gewone opkomst (geen kamp) op een rij die een kamp is (soort kamp, of met een einddatum): het aantal dagen van de rij, anders null. */
export function opkOnKamp(o: Opk, date: string, endDate?: string | null, type?: Plan['type'] | null): number | null {
  if (!o || isKamp(o) || isNaN(fromISO(date).getTime())) return null;
  const long = !!endDate && endDate > date;
  if (type !== 'kamp' && !long) return null;
  return long ? dayDiff(date, endDate!) + 1 : 1;
}
/**
 * Melding als het kamp niet bij de rij past (zie kampMismatch), of als er een gewone opkomst aan een kamp in de jaarplanning hangt
 * (zie opkOnKamp; geef dan de soort van de rij mee), anders ''.
 */
export function kampMismatchNote(o: Opk, date: string, endDate?: string | null, type?: Plan['type'] | null) {
  const m = kampMismatch(o, date, endDate);
  if (m) return `Het kamp heeft ${plural(m.prog, 'dag', 'dagen')}, de jaarplanning ${m.row} (${fmtRange(date, endDate)}). Controleer de data.`;
  const n = opkOnKamp(o, date, endDate, type);
  return n ? `Dit is een gewone opkomst (${fmtT(o.start)}–${fmtT(o.end)}); de jaarplanning heeft hier ${type === 'kamp' ? 'een kamp' : 'een rij'} van ${plural(n, 'dag', 'dagen')} (${fmtRange(date, endDate)}). Controleer de data.` : '';
}
/**
 * Rij in de jaarplanning gelijk trekken met het kamp (na een dag toevoegen, kopiëren of weghalen in de bouwer):
 * t/m het aantal kampdagen. Heet de eerste dag naar een andere weekdag dan de datum en ligt die dag binnen de oude rij
 * (bijv. de vrijdag is weggehaald, het kamp begint nu op zaterdag), dan begint de rij op die dag.
 */
export function kampFitRow(o: Opk, date: string, endDate?: string | null): { date: string; endDate: string } {
  let d = date;
  const w = isKamp(o) && o.days.length && !isNaN(fromISO(date).getTime()) ? DAYS.indexOf((o.days[0].label || '').trim().toLowerCase()) : -1;
  if (w >= 0) { const k = (w - fromISO(date).getDay() + 7) % 7, last = endDate && endDate > date ? endDate : date; if (k > 0 && addDays(date, k) <= last) d = addDays(date, k); }
  return { date: d, endDate: isKamp(o) && o.days.length > 1 ? addDays(d, o.days.length - 1) : '' };
}
/**
 * Eerste dag van een kamp zoals bouwer, dashboard en pdf hem tonen. Past het kamp bij de rij, dan gewoon de datum (de jaarplanning gaat voor,
 * ook na verzetten of een andere dagnaam). Past het niet (bijv. de vrijdag is weggehaald en de rij is nog vr–zo), dan de datum die
 * kampFitRow zou kiezen: het zaterdagprogramma heet dan meteen zaterdag, ook voordat iemand met Jaarplanning de rij aanpast.
 */
export function kampBase(o: Opk, e: Pick<Plan, 'date' | 'endDate'>) {
  return isKamp(o) && kampMismatch(o, e.date, e.endDate) ? kampFitRow(o, e.date, e.endDate).date : e.date;
}
/** Dagnaam na `label`: een weekdag krijgt de volgende weekdag ("Zaterdag" → "Zondag"), anders null. */
export const nextWeekday = (label: string) => isWeekdayLabel(label) ? cap(DAYS[(DAYS.indexOf(label.trim().toLowerCase()) + 1) % 7]) : null;
/**
 * Dag kopiëren in een kamp: de kopie komt direct na dag `i`, met alle onderdelen (nieuwe ids). Heet de dag naar een weekdag,
 * dan heet de kopie naar de volgende weekdag en lopen de dagen daarna door (met een datum: de weekdag van hun datum).
 * Een andere naam krijgt " (kopie)". Geeft de index van de kopie.
 */
export function copyKampDay(o: Opk, i: number, firstISO: string | null) {
  const d = o.days[i], nd = normDay(clone(d), i); nd.id = uid(); nd.blocks.forEach(b => { b.id = uid(); });
  const next = nextWeekday(d.label);
  nd.label = next || (d.label + ' (kopie)');
  o.days.splice(i + 1, 0, nd);
  if (next && firstISO) relabelDays(o, firstISO);
  else if (next) {
    // zonder datum: de dagen na de kopie die een weekdag heten schuiven één weekdag op (geen twee tabs "Zondag")
    const base = DAYS.indexOf(next.toLowerCase());
    for (let j = i + 2; j < o.days.length; j++) if (isWeekdayLabel(o.days[j].label)) o.days[j].label = cap(DAYS[(base + j - i - 1) % 7]);
  }
  return i + 1;
}
/** Kampdagen die een weekdag heten krijgen de weekdag van hun datum (vanaf firstISO). Geeft true als er iets veranderde. */
export function relabelDays(o: Opk, firstISO: string) {
  if (!isKamp(o) || isNaN(fromISO(firstISO).getTime())) return false;
  let changed = false;
  o.days.forEach((d, i) => {
    if (!isWeekdayLabel(d.label)) return;
    const l = cap(DAYS[fromISO(addDays(firstISO, i)).getDay()]);
    if (l !== d.label) { d.label = l; changed = true; }
  });
  return changed;
}
export function blockFromLib(l: Lib, start: number): Block {
  return { ...normBlock({}), ...libFields(l), libId: l.id, start };
}
/** Kopie met nieuwe ids (opkomst, dagen en onderdelen). Met `s` krijgen ontbrekende voorbereiding/nabespreking de standaard. */
export function copyOpk(src: Opk, s?: Settings): Opk {
  const o = normOpk(clone(src), s); o.id = uid(); allBlocks(o).forEach(b => b.id = uid()); o.days.forEach(d => d.id = uid()); o.createdAt = Date.now(); return o;
}
/**
 * Versie voor de opkomstenbank: zonder namen van leiding, gedeeld met de groep, los van een bron of de groepsbank.
 * Een concept gaat zelf de bank in (zelfde id); van een ingeplande opkomst komt een kopie met nieuwe ids (`copy`).
 * libId blijft staan: de koppeling met de eigen activiteitenbank klopt nog.
 */
export function toBank(o: Opk, title: string, copy = o.state === 'planned'): Opk {
  const b = copy ? copyOpk(o) : normOpk(clone(o));
  b.title = title; b.state = 'bank'; b.lead = ''; b.shared = true; b.srcId = null; b.fromShared = null;
  allBlocks(b).forEach(x => { x.names = []; });
  return b;
}
/** Eerste moment (vanaf het begin) waarop `dur` minuten vrij zijn, of null als er geen gat is dat lang genoeg is. */
export function firstFree(day: { start: number; end: number; blocks: Block[] }, dur: number): number | null {
  const bl = [...day.blocks].sort((a, b) => a.start - b.start);
  let t = day.start;
  for (const b of bl) {
    // een onderdeel na het einde (bijv. na een vroegere eindtijd) telt niet als grens: het gat loopt hooguit tot het einde
    if (b.start >= day.end) break;
    if (b.start - t >= dur) return t;
    t = Math.max(t, b.start + b.dur);
  }
  return day.end - t >= dur ? t : null;
}
/** Vaste blokken schuiven mee met begin en eind (alleen als ze nog op hun eigen plek stonden). */
function moveFixed(blocks: Block[], os: number, oe: number, ns: number, ne: number) {
  blocks.forEach(b => {
    if (b.cat === '__open' && b.start === os) b.start = ns;
    if (b.cat === '__close' && b.start + b.dur === oe) b.start = ne - b.dur;
    if (b.cat === '__ranja') { const mid = Math.round(((os + oe) / 2 - b.dur / 2) / 5) * 5; if (b.start === mid) b.start = Math.round(((ns + ne) / 2 - b.dur / 2) / 5) * 5; }
  });
}
export type TimeChange = { opk: Opk; note?: string; error?: undefined } | { opk?: undefined; note?: undefined; error: string };
/** Begin- of eindtijd van een gewone opkomst aanpassen. Geeft een aangepaste kopie (het origineel blijft zoals het is), of een fout. */
export function changeOpkTime(o: Opk, which: 'start' | 'end', v: number): TimeChange {
  if (which === 'end' && v <= o.start) return { error: 'De eindtijd moet na de begintijd liggen.' };
  const c = clone(o); let note: string | undefined;
  if (which === 'start') { c.start = v; if (c.end <= v) { c.end = v + 60; note = 'Eindtijd verschoven naar ' + fmtT(c.end); } }
  else c.end = v;
  moveFixed(c.blocks, o.start, o.end, c.start, c.end);
  return { opk: c, note };
}
/** Tijden uit de jaarplanning die bewust afwijken (niet de standaardtijden) van een gewone opkomst. */
export function planTimesDiffer(s: Settings, e: Plan, o: Opk) {
  if (isKamp(o) || e.type !== 'opkomst' || e.start == null || e.end == null || e.end <= e.start) return false;
  if (e.start === s.defStart && e.end === s.defEnd) return false;
  return e.start !== o.start || e.end !== o.end;
}
/** Hele programma verschuiven naar een nieuwe begintijd en daarna de eindtijd zetten (vaste blokken schuiven mee). */
export function applyPlanTimes(o: Opk, st: number, en: number) {
  if (isKamp(o) || en <= st) return;
  const delta = st - o.start;
  o.start += delta; o.end += delta; o.blocks.forEach(b => { b.start += delta; });
  if (o.end !== en) { const oe = o.end; o.end = en; moveFixed(o.blocks, o.start, oe, o.start, en); }
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
/** Onderdelen per naam; bij een kamp met `_di`, de index van de dag. */
export type PerName = Record<string, (Block & { _di?: number })[]>;
export type Analysis = { total: number; planned: number; free: number; issues: Issue[]; warn: number; per: PerName; clashes: Set<string>; peak: number; present: string[] };
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
  const pres = new Set(present), std = new Set(leaders), per: PerName = {};
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
  if (!nn && peak && (leaders.length > 0 || pres.size > 0) && pres.size < peak) issues.push({ lvl: 'warn', at: big!.start, id: big!.id, text: `Minimaal ${peak} leiding nodig (voor ${big!.title || 'naamloos'}), ${pres.size} aanwezig` });
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
    Object.entries(a.per).forEach(([n, arr]) => (out.per[n] = out.per[n] || []).push(...arr.map(b => ({ ...b, _di: i }))));
    a.clashes.forEach(c => out.clashes.add(c));
  });
  return out;
}

/* ---------- Seizoen en planning ---------- */
export function nextOpkDay(s: Settings) { const t = todayISO(); return addDays(t, (s.opkDay - fromISO(t).getDay() + 7) % 7); }
/** Seizoen (beginjaar) van een datum. Maanden in de pauze tussen twee seizoenen horen bij het komende seizoen. */
export function seasonOf(s: Settings, iso: string) {
  const d = fromISO(iso), m = d.getMonth() + 1, y = d.getFullYear(), sm = s.seasonStartMonth, em = s.seasonEndMonth;
  if (em >= sm) return m > em ? y + 1 : y;
  return m >= sm ? y : m <= em ? y - 1 : y;
}
export function seasonRange(s: Settings, Y: number) {
  const sm = s.seasonStartMonth, em = s.seasonEndMonth, endY = em >= sm ? Y : Y + 1;
  return { from: toISO(new Date(Y, sm - 1, 1, 12)), to: toISO(new Date(endY, em, 0, 12)) };
}
export const seasonLabel = (s: Settings, Y: number) => s.seasonEndMonth >= s.seasonStartMonth ? String(Y) : `${Y}–${Y + 1}`;
export function opkDaysIn(s: Settings, from: string, to: string) {
  const out: string[] = []; let d = from;
  if (isNaN(fromISO(from).getTime()) || isNaN(fromISO(to).getTime())) return out; // oude, foute datum: niet blijven hangen
  for (let i = 0; i < 7 && fromISO(d).getDay() !== s.opkDay; i++) d = addDays(d, 1);
  if (fromISO(d).getDay() !== s.opkDay) return out;
  while (d <= to) { out.push(d); d = addDays(d, 7); }
  return out;
}
/** `key` wijst de rij aan (voor entryFor, vensters en focus); `rk` blijft gelijk als er voor een lege dag een rij wordt aangemaakt (React-key). */
export type Row = { key: string; rk: string; e: Plan | null; slot: string | null };
export const rowDate = (r: Row) => r.e ? r.e.date : (r.slot as string);
export const rowEnd = (r: Row) => (r.e && r.e.endDate) || rowDate(r);
export function rowsIn(s: Settings, plans: Plan[], from: string, to: string): Row[] {
  const sats = opkDaysIn(s, from, to), satSet = new Set(sats), rows: Row[] = [];
  sats.forEach(sl => { const e = plans.find(p => p.slot === sl); rows.push(e ? { key: e.id, rk: 's:' + sl, e, slot: sl } : { key: 's:' + sl, rk: 's:' + sl, e: null, slot: sl }); });
  plans.forEach(p => {
    if (p.slot && satSet.has(p.slot)) return;
    const end = p.endDate || p.date;
    if (end >= from && p.date <= to) rows.push({ key: p.id, rk: p.id, e: p, slot: p.slot });
  });
  rows.sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
  return rows;
}
export function entryTimes(s: Settings, e: Plan | null, o: Opk | null): [number, number] {
  if (o) return [o.start, o.end];
  if (e && e.start != null && e.end != null) return [e.start, e.end];
  return e ? defaultTimes(s, e.type, e.date, e.endDate) : [s.defStart, s.defEnd];
}
export const letterDue = (s: Settings, e: Plan) => e.letter.due || addDays(e.date, -s.letterDays);
/**
 * Stand van een programma: nog leeg (alleen vaste blokken), met aandachtspunten, of klaar.
 * Eén bron voor de statuspil, het dashboard en de jaarplanning; grote vrije stukken zijn geen aandachtspunt.
 */
export function progStatus(o: Opk, present: string[], leaders: string[]): 'leeg' | 'warn' | 'ok' {
  if (progEmpty(o)) return 'leeg';
  return analyze(o, present, leaders).warn ? 'warn' : 'ok';
}
/** Status van een rij in de jaarplanning. Met een gekoppelde opkomst telt de analyse mee (afwezige leiding, te weinig leiding, enz.); een leeg programma heet 'leeg' (zoals de statuspil), niet klaar. */
export function entryStatus(e: Plan | null, o: Opk | null, leaders: string[] = []): 'open' | 'off' | 'kamp' | 'leeg' | 'warn' | 'ok' | 'topic' {
  if (!e) return 'open';
  if (e.type === 'geen') return 'off';
  if (e.type === 'kamp') return 'kamp';
  if (o) return progStatus(o, presentNames(leaders, e.absent, o), leaders);
  return e.topic ? 'topic' : 'open';
}
export function dayTitle(o: Opk, i: number, date: string | null, long?: boolean) {
  const d = o.days[i];
  if (!date) return d.label;
  const x = fromISO(date);
  if (isNaN(x.getTime())) return d.label;
  // heet de dag naar een weekdag, dan telt de datum (een kamp dat verzet is, of op een andere dag begint)
  const lbl = isWeekdayLabel(d.label) ? cap(DAYS[x.getDay()]) : d.label;
  return lbl + ' ' + x.getDate() + ' ' + (long ? MONTHS[x.getMonth()] : mon3(date));
}
/** Korte, unieke dagnaam (pdf): met datum "za 17"; zonder datum de eerste twee letters als die uniek zijn, anders "dag 2". */
export function dayShort(o: Opk, i: number, date: string | null) {
  if (date && !isNaN(fromISO(date).getTime())) return wd2(date) + ' ' + fromISO(date).getDate();
  const two = (l: string) => (l || '').trim().slice(0, 2).toLowerCase(), t = two(o.days[i].label);
  return t.length === 2 && o.days.filter(d => two(d.label) === t).length === 1 ? t : 'dag ' + (i + 1);
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
