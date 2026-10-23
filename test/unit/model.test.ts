// Unit-tests voor de pure functies in src/lib/model.ts en src/lib/time.ts.
// Draait in `npm run check`, of los: node --experimental-strip-types --test 'test/unit/*.test.ts'
// Node haalt de types zelf weg; er is geen extra testpakket nodig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/lib/model.ts';
import { fmtT, isoWeek, parseNL, parseRange, tidyNL } from '../../src/lib/time.ts';
import type { Block, Opk, Plan, Settings } from '../../src/lib/model.ts';

const S = (extra: Partial<Settings> = {}): Settings => ({ ...M.defaultSettings(), ...extra });
const blk = (id: string, start: number, dur: number, extra: Partial<Block> = {}): Block =>
  M.normBlock({ id, start, dur, title: id, names: ['Akela'], libId: 'lib-' + id, ...extra });
const opk = (extra: Partial<Opk> = {}): Opk => M.normOpk({ id: 'o1', state: 'draft', title: 'Spel', start: 840, end: 990, prep: 30, post: 30, lead: 'Baloe', srcId: 'bron', fromShared: 'g_x', shared: false,
  blocks: [blk('a', 840, 30), blk('b', 900, 30)], ...extra });
const plan = (extra: Partial<Plan>): Plan => M.normPlan({ id: 'p', ...extra });
const fixed = (o: { blocks: Block[] }, cat: string) => o.blocks.find(x => x.cat === cat)!;
const texts = (a: M.Analysis) => a.issues.map(i => i.text);

/* ---------- eerste vrije moment ---------- */
test('firstFree', () => {
  const day = { start: 840, end: 990, blocks: [blk('a', 840, 30), blk('b', 900, 30)] };
  assert.equal(M.firstFree(day, 30), 870, 'gat tussen twee onderdelen');
  assert.equal(M.firstFree(day, 45), 930, 'te lang voor het gat: na het laatste onderdeel');
  assert.equal(M.firstFree(day, 90), null, 'nergens plek');
  assert.equal(M.firstFree({ start: 480, end: 1380, blocks: [] }, 60), 480, 'lege dag: begin');
  assert.equal(M.firstFree({ start: 0, end: 100, blocks: [blk('x', 0, 40), blk('y', 10, 10)] }, 20), 40, 'overlappende onderdelen tellen samen');
  assert.equal(M.firstFree({ start: 840, end: 990, blocks: [blk('a', 840, 150), blk('x', 1080, 30)] }, 30), null, 'vol, met een onderdeel na het einde: geen moment na het einde');
  assert.equal(M.firstFree({ start: 840, end: 990, blocks: [blk('a', 840, 90), blk('x', 1080, 30)] }, 30), 930, 'gat tot het einde, onderdeel erna telt niet');
});

/* ---------- opkomstenbank: zonder namen ---------- */
test('toBank: concept gaat zelf de bank in, zonder namen', () => {
  const o = opk(), b = M.toBank(o, 'In de bank');
  assert.equal(b.id, 'o1'); assert.equal(b.blocks[0].id, 'a');
  assert.equal(b.state, 'bank'); assert.equal(b.title, 'In de bank'); assert.equal(b.shared, true);
  assert.equal(b.lead, ''); assert.ok(M.allBlocks(b).every(x => x.names.length === 0), 'geen namen');
  assert.equal(b.srcId, null); assert.equal(b.fromShared, null);
  assert.equal(b.blocks[0].libId, 'lib-a', 'koppeling met de activiteitenbank blijft');
  assert.equal(o.state, 'draft'); assert.equal(o.lead, 'Baloe'); assert.equal(o.blocks[0].names[0], 'Akela', 'origineel ongewijzigd');
});
test('toBank: ingepland → kopie met nieuwe ids; kamp ook zonder namen', () => {
  const p = opk({ state: 'planned' }), pb = M.toBank(p, 'Kopie');
  assert.notEqual(pb.id, 'o1'); assert.ok(pb.blocks.every(x => !['a', 'b'].includes(x.id))); assert.equal(pb.state, 'bank');
  assert.equal(M.toBank(p, 'x', false).id, 'o1', 'copy=false: zelfde id');
  const k = M.toBank(M.normOpk({ id: 'k1', kind: 'kamp', state: 'planned', lead: 'Kaa', days: [{ id: 'd1', label: 'Zaterdag', start: 480, end: 1380, blocks: [blk('c', 600, 60)] }] }), 'Kamp');
  assert.notEqual(k.id, 'k1'); assert.notEqual(k.days[0].id, 'd1'); assert.equal(k.days[0].blocks[0].names.length, 0); assert.equal(k.lead, '');
});
test('normOpk: bank-opkomst zonder namen, ook uit een back-up of oude data; andere houden ze', () => {
  const b = opk({ state: 'bank' });
  assert.equal(b.lead, ''); assert.ok(M.allBlocks(b).every(x => x.names.length === 0), 'geen namen in de bank');
  const k = M.normOpk({ id: 'k2', kind: 'kamp', state: 'bank', lead: 'Kaa', days: [{ id: 'd1', label: 'Zaterdag', start: 480, end: 1380, blocks: [blk('c', 600, 60)] }] });
  assert.equal(k.lead, ''); assert.equal(k.days[0].blocks[0].names.length, 0, 'kamp in de bank ook niet');
  const p = opk({ state: 'planned' }), d = opk();
  assert.equal(p.lead, 'Baloe'); assert.deepEqual(p.blocks[0].names, ['Akela'], 'ingepland houdt namen');
  assert.deepEqual(d.blocks[0].names, ['Akela'], 'concept houdt namen');
  const c = M.copyOpk(b, S());
  assert.ok(M.allBlocks(c).every(x => x.names.length === 0) && c.lead === '', 'kopie uit de bank ook zonder namen');
});

/* ---------- kopie met nieuwe ids ---------- */
test('copyOpk', () => {
  const s = S({ prepMin: 30, postMin: 45 });
  const c = M.copyOpk(M.normOpk({ id: 'o2', prep: 0, post: 15, blocks: [blk('a', 840, 30)] }), s);
  assert.notEqual(c.id, 'o2'); assert.notEqual(c.blocks[0].id, 'a'); assert.equal(c.prep, 0); assert.equal(c.post, 15);
  const old = M.copyOpk({ id: 'o3', title: 'Oud', blocks: [] } as any, s);
  assert.equal(old.prep, 30); assert.equal(old.post, 45, 'oude opkomst zonder voorbereiding krijgt de standaard');
});

/* ---------- vaste blokken ---------- */
test('fixedBlocks: openen, ranja en sluiten', () => {
  const f = M.fixedBlocks(S(), 840, 990);
  assert.deepEqual(f.map(b => [b.cat, b.start, b.dur]), [['__open', 840, 5], ['__close', 985, 5], ['__ranja', 910, 15]]);
  assert.ok(f.every(b => b.minLeaders === 0 && !b.pdfPage), 'tellen niet mee voor leiding en pdf');
  assert.deepEqual(M.fixedBlocks(S({ fixedOn: false }), 840, 990), [], 'uitgezet: geen vaste blokken');
  assert.deepEqual(M.fixedBlocks(S(), 840, 860).map(b => b.cat), ['__open', '__close'], 'te kort voor ranja');
  assert.deepEqual(M.fixedBlocks(S({ fixedRanja: 0 }), 840, 990).map(b => b.cat), ['__open', '__close']);
});
test('newOpk heeft vaste blokken, kamp niet', () => {
  assert.equal(M.newOpk(S()).blocks.filter(M.isFixed).length, 3);
  const k = M.newKamp(S(), 2);
  assert.equal(k.blocks.length, 0); assert.ok(k.days.every(d => d.blocks.length === 0));
});

/* ---------- tijden aanpassen (regressie: niet meer in het origineel schrijven, eind vóór begin geweigerd) ---------- */
test('changeOpkTime', () => {
  const f = M.normOpk({ id: 'f', start: 840, end: 990, blocks: M.fixedBlocks(S(), 840, 990) });
  const later = M.changeOpkTime(f, 'start', 1000);
  assert.ok(later.opk); assert.equal(later.opk.start, 1000); assert.equal(later.opk.end, 1060);
  assert.match(later.note || '', /Eindtijd verschoven naar 17:40/);
  assert.equal(fixed(later.opk, '__open').start, 1000, 'openen schuift mee met het begin');
  assert.equal(fixed(later.opk, '__close').start, 1055, 'sluiten schuift mee met het eind');
  assert.equal(f.start, 840); assert.equal(f.end, 990); assert.equal(fixed(f, '__open').start, 840, 'origineel ongewijzigd');
  const bad = M.changeOpkTime(f, 'end', 840);
  assert.equal(bad.opk, undefined); assert.equal(bad.error, 'De eindtijd moet na de begintijd liggen.');
  const end = M.changeOpkTime(f, 'end', 1020);
  assert.equal(end.opk!.end, 1020); assert.equal(fixed(end.opk!, '__close').start, 1015); assert.equal(end.note, undefined);
  const earlier = M.changeOpkTime(f, 'start', 780);
  assert.equal(fixed(earlier.opk!, '__open').start, 780); assert.equal(fixed(earlier.opk!, '__ranja').start, 880, 'ranja blijft in het midden');
});
test('changeOpkTime: verplaatste vaste blokken blijven staan', () => {
  const f = M.normOpk({ id: 'f', start: 840, end: 990, blocks: M.fixedBlocks(S(), 840, 990) });
  fixed(f, '__open').start = 850; fixed(f, '__ranja').start = 930;
  const r = M.changeOpkTime(f, 'start', 810).opk!;
  assert.equal(fixed(r, '__open').start, 850); assert.equal(fixed(r, '__ranja').start, 930);
});
test('applyPlanTimes: hele programma naar 10:00–12:00', () => {
  const ap = M.normOpk({ id: 'g', start: 840, end: 990, blocks: [...M.fixedBlocks(S(), 840, 990), blk('x', 900, 30)] });
  M.applyPlanTimes(ap, 600, 720);
  assert.equal(ap.start, 600); assert.equal(ap.end, 720);
  assert.equal(fixed(ap, '__open').start, 600); assert.equal(fixed(ap, '__close').start, 715);
  assert.equal(ap.blocks.find(b => b.id === 'x')!.start, 660, 'onderdelen schuiven mee');
  const k = M.newKamp(S(), 2), before = JSON.stringify(k); M.applyPlanTimes(k, 600, 720);
  assert.equal(JSON.stringify(k), before, 'kamp blijft ongewijzigd');
});

/* ---------- analyse (aandachtspunten) ---------- */
test('minNeed: hoogste minimum van de niet-vaste onderdelen', () => {
  const o = opk({ blocks: [blk('a', 840, 30, { minLeaders: 2 }), blk('b', 900, 30, { minLeaders: 4 }), blk('__o', 840, 5, { cat: '__open', minLeaders: 9 })] });
  assert.equal(M.minNeed(o), 4);
  assert.equal(M.minNeed(opk({ blocks: [] })), 0);
});
test('analyze: gaten, buiten de tijd, beschrijving en locatie', () => {
  const o = opk({ start: 840, end: 900, prep: 0, post: 0, blocks: [blk('a', 840, 30, { short: 'x', location: 'Bos', names: [] }), blk('b', 890, 20, { names: [] })] });
  const a = M.analyze(o, [], []);
  assert.equal(a.total, 60); assert.equal(a.planned, 40); assert.equal(a.free, 20);
  assert.ok(texts(a).includes('Niet ingepland: 14:30–14:50 (20 min)'));
  assert.ok(texts(a).includes('b valt buiten 14:00–15:00'));
  assert.ok(texts(a).includes('b: nog geen beschrijving') && texts(a).includes('b: geen locatie'));
  assert.ok(!texts(a).some(t => t.startsWith('a:')), 'compleet onderdeel geeft niets');
});
test('analyze: afwezig, dubbel ingedeeld en te weinig leiding', () => {
  const o = opk({ blocks: [blk('a', 840, 30, { minLeaders: 1, names: ['Akela', 'Baloe'] }), blk('b', 850, 30, { minLeaders: 3, names: ['Akela'] })] });
  const a = M.analyze(o, ['Akela', 'Kaa'], ['Akela', 'Baloe', 'Kaa']);
  assert.ok(texts(a).includes('Baloe is ingedeeld bij a, maar is afwezig'));
  assert.ok(texts(a).includes('Akela staat tegelijk bij a en b'));
  assert.ok(a.clashes.has('a|Akela') && a.clashes.has('b|Akela'));
  assert.ok(texts(a).includes('b: 1 van minimaal 3 leiding ingedeeld'));
  assert.ok(texts(a).includes('Minimaal 3 leiding nodig (voor b), 2 aanwezig'));
  assert.equal(a.peak, 3);
  assert.equal(a.warn, a.issues.filter(i => i.lvl === 'warn').length);
  const none = M.analyze(o, [], ['Akela', 'Baloe', 'Kaa']);
  assert.ok(texts(none).includes('Minimaal 3 leiding nodig (voor b), 0 aanwezig'), 'ook als niemand aanwezig is');
});
test('analyze: bank-opkomst kijkt niet naar namen', () => {
  const o = opk({ state: 'bank', blocks: [blk('b', 850, 30, { minLeaders: 3, names: [] })] });
  const a = M.analyze(o, [], ['Akela']);
  assert.ok(!texts(a).some(t => /leiding/.test(t)));
});
test('analyze: kamp per dag, met de dagnaam ervoor', () => {
  const k = M.normOpk({ id: 'k', kind: 'kamp', days: [
    { id: 'd1', label: 'Zaterdag', start: 600, end: 660, blocks: [blk('a', 600, 30, { short: 'x', location: 'Veld' })] },
    { id: 'd2', label: 'Zondag', start: 600, end: 630, blocks: [blk('b', 600, 30, { short: 'x', location: 'Veld' })] },
  ] });
  const a = M.analyze(k, ['Akela'], ['Akela']);
  assert.equal(a.total, 90); assert.equal(a.planned, 60);
  assert.deepEqual(texts(a), ['Zaterdag: Niet ingepland: 10:30–11:00 (30 min)']);
  assert.equal(a.per.Akela.length, 2);
});
test('presentNames en plannersOf', () => {
  const o = opk({ state: 'planned', lead: 'Kaa', blocks: [blk('a', 840, 30, { names: ['Henk', 'Baloe'] })] });
  assert.deepEqual(M.presentNames(['Akela', 'Baloe'], ['Baloe'], o), ['Akela', 'Henk', 'Kaa'], 'afwezig telt niet, met de hand ingedeeld wel');
  assert.deepEqual(M.plannersOf(plan({ planners: ['Akela'] }), o), ['Akela', 'Kaa'], 'oude eindverantwoordelijke telt als planner');
  assert.deepEqual(M.plannersOf(plan({ planners: ['Akela'] }), { ...o, state: 'bank' }), ['Akela']);
  assert.deepEqual(M.plannersOf(null, null), []);
});
test('entryStatus', () => {
  const o = opk({ state: 'planned', blocks: [blk('a', 840, 30, { names: ['Baloe'], short: 'x', location: 'Bos' })] });
  assert.equal(M.entryStatus(null, null), 'open');
  assert.equal(M.entryStatus(plan({ type: 'geen' }), null), 'off');
  assert.equal(M.entryStatus(plan({ type: 'kamp' }), null), 'kamp');
  assert.equal(M.entryStatus(plan({ topic: 'Bosspel' }), null), 'topic');
  assert.equal(M.entryStatus(plan({ absent: ['Baloe'] }), o, ['Baloe']), 'warn', 'afwezige leiding ingedeeld');
  assert.equal(M.entryStatus(plan({}), o, ['Baloe']), 'ok');
  const leeg = { ...M.newOpk(S()), state: 'planned' as const };
  assert.ok(leeg.blocks.length > 0 && M.progEmpty(leeg), 'nieuwe opkomst: alleen vaste blokken');
  assert.equal(M.entryStatus(plan({}), leeg, ['Baloe']), 'leeg', 'alleen vaste blokken: programma nog leeg (zoals de statuspil), niet klaar en geen aandachtspunten');
  const kort = opk({ state: 'planned', blocks: [blk('a', 840, 10, { names: ['Baloe'], short: 'x', location: 'Bos' })] });
  assert.equal(M.entryStatus(plan({}), kort, ['Baloe']), 'ok', 'veel vrije tijd is geen aandachtspunt');
});
test('progStatus: leeg, aandachtspunten of klaar (ook bij een kamp)', () => {
  const o = opk({ state: 'planned', blocks: [blk('a', 840, 30, { names: ['Baloe'], short: 'x', location: 'Bos' })] });
  assert.equal(M.progStatus(o, ['Baloe'], ['Baloe']), 'ok');
  assert.equal(M.progStatus({ ...M.newOpk(S()), state: 'planned' }, ['Baloe'], ['Baloe']), 'leeg', 'alleen vaste blokken');
  const leegKamp = { ...M.newKamp(S(), 3), state: 'planned' as const };
  assert.equal(M.progStatus(leegKamp, ['Baloe'], ['Baloe']), 'leeg', 'leeg kamp');
  assert.equal(M.entryStatus(plan({ type: 'kamp' }), leegKamp, ['Baloe']), 'kamp', 'kalender en telling blijven kamp');
  const kamp = M.normOpk({ id: 'k', state: 'planned', kind: 'kamp', days: [{ label: 'Zaterdag', start: 480, end: 600, blocks: [blk('hike', 480, 120, { names: ['Baloe'], short: 'x', location: 'Bos' })] }] });
  assert.equal(M.progStatus(kamp, M.presentNames(['Baloe', 'Akela'], [], kamp), ['Baloe', 'Akela']), 'ok');
  assert.equal(M.progStatus(kamp, M.presentNames(['Baloe', 'Akela'], ['Baloe'], kamp), ['Baloe', 'Akela']), 'warn', 'afwezige leiding ingedeeld bij een kamp');
});

/* ---------- tijdlijn ---------- */
test('lanesLayout: overlappende onderdelen naast elkaar', () => {
  const L = M.lanesLayout([blk('a', 0, 30), blk('b', 10, 10), blk('c', 20, 20), blk('d', 60, 10)]);
  assert.deepEqual(L.a, { lane: 0, n: 2 }); assert.deepEqual(L.b, { lane: 1, n: 2 }); assert.deepEqual(L.c, { lane: 1, n: 2 }, 'c past in de baan van b');
  assert.deepEqual(L.d, { lane: 0, n: 1 }, 'los onderdeel: eigen groep');
  assert.deepEqual(M.lanesLayout([]), {});
});

/* ---------- kamp ---------- */
test('kampDaysFor en kampLength', () => {
  const d = M.kampDaysFor(2, '2026-10-17');
  assert.deepEqual(d.map(x => [x.label, x.start, x.end]), [['Zaterdag', 1140, 1380], ['Zondag', 480, 900]]);
  const one = M.kampDaysFor(1, null);
  assert.deepEqual([one[0].label, one[0].start, one[0].end], ['Vrijdag', 540, 1020]);
  const own = M.kampDaysFor(3, '2026-10-16', 1200, 960);
  assert.deepEqual(own.map(x => [x.label, x.start, x.end]), [['Vrijdag', 1200, 1380], ['Zaterdag', 480, 1380], ['Zondag', 480, 960]]);
  assert.equal(M.kampLength('2026-10-16'), 3, 'vrijdag t/m zondag');
  assert.equal(M.kampLength('2026-10-17'), 2, 'zaterdag t/m zondag');
  assert.equal(M.kampLength('2026-10-18'), 1, 'zondag');
  assert.equal(M.kampLength('2026-10-14'), 3, 'andere dag: 3 dagen');
  assert.equal(M.kampLength('2026-10-16', '2026-10-20'), 5);
  assert.equal(M.kampLength('2026-10-01', '2026-12-01'), 14, 'hooguit 14 dagen');
});
test('entryTimes: een kamp-rij zonder eigen tijden krijgt de kamptijden, net als een nieuw weekendkamp', () => {
  const s = S();
  assert.deepEqual(M.entryTimes(s, plan({ date: '2026-10-16', endDate: '2026-10-18', type: 'kamp' }), null), [M.KAMP_START, M.KAMP_END], 'kamp vr–zo: 19:00 en 15:00');
  assert.deepEqual(M.entryTimes(s, plan({ date: '2026-10-18', type: 'kamp' }), null), [M.KAMPDAG_START, M.KAMPDAG_END], 'kamp van één dag (zondag): 09:00–17:00');
  assert.deepEqual(M.entryTimes(s, plan({ date: '2026-10-17', type: 'opkomst' }), null), [s.defStart, s.defEnd], 'gewone opkomst: standaardtijden');
  assert.deepEqual(M.entryTimes(s, plan({ date: '2026-10-16', type: 'kamp', start: 1080, end: 960 }), null), [1080, 960], 'eigen tijden blijven');
  assert.deepEqual(M.entryTimes(s, null, null), [s.defStart, s.defEnd]);
  // de rij en het kamp dat eraan gekoppeld wordt hebben dezelfde tijden
  const [st, en] = M.defaultTimes(s, 'kamp', '2026-10-16', '2026-10-18'), k = M.kampDaysFor(3, '2026-10-16');
  assert.deepEqual([k[0].start, k[2].end], [st, en]);
});
test('kampStart: een kamp vr–zo op de vaste zaterdag begint op de vrijdag ervoor', () => {
  const k = M.newKamp(S(), 3); // Vrijdag, Zaterdag, Zondag
  assert.equal(M.kampStart(k, '2026-11-07'), '2026-11-06', 'zaterdag → vrijdag ervoor');
  assert.equal(M.kampStart(k, '2026-11-08'), '2026-11-06', 'zondag → vrijdag ervoor');
  assert.equal(M.kampStart(k, '2026-11-06'), '2026-11-06', 'vrijdag blijft');
  assert.equal(M.kampStart(k, '2026-11-05'), '2026-11-05', 'donderdag valt er niet in: datum blijft');
  const eigen = M.newKamp(S(), 3); eigen.days[0].label = 'Aankomst';
  assert.equal(M.kampStart(eigen, '2026-11-07'), '2026-11-07', 'eerste dag zonder weekdagnaam: datum blijft');
  assert.equal(M.kampStart(opk(), '2026-11-07'), '2026-11-07', 'gewone opkomst: datum blijft');
});
test('ownTimes: alleen tijden die afwijken van de standaard zijn eigen tijden', () => {
  const s = S();
  assert.equal(M.ownTimes(s, null), false);
  assert.equal(M.ownTimes(s, plan({ date: '2026-11-14' })), false, 'geen tijden');
  assert.equal(M.ownTimes(s, plan({ date: '2026-11-14', start: s.defStart, end: s.defEnd })), false, 'opkomst met de standaardtijden opgeslagen');
  assert.equal(M.ownTimes(s, plan({ date: '2026-11-14', start: 600, end: 720 })), true, 'ochtendopkomst');
  assert.equal(M.ownTimes(s, plan({ date: '2026-11-13', endDate: '2026-11-15', type: 'kamp', start: M.KAMP_START, end: M.KAMP_END })), false, 'kamp met de kamptijden');
  assert.equal(M.ownTimes(s, plan({ date: '2026-11-13', endDate: '2026-11-15', type: 'kamp', start: s.defStart, end: s.defEnd })), true, 'kamp met opkomsttijden: wel eigen (oude data blijft zoals hij is)');
  assert.equal(M.ownTimes(S({ defStart: 810, defEnd: 960 }), plan({ date: '2026-11-14', start: 840, end: 990 })), true, 'standaard later veranderd: de oude tijden wijken nu af');
});
test('kampFitRow: rij in de jaarplanning gelijk trekken met het kamp', () => {
  const k = M.newKamp(S(), 3, '2026-11-13'); // vr 13 – zo 15 nov
  k.days.push(M.normDay({ label: 'Maandag' }, 3));
  assert.deepEqual(M.kampFitRow(k, '2026-11-13', '2026-11-15'), { date: '2026-11-13', endDate: '2026-11-16' }, 'dag toegevoegd: t/m maandag');
  const zz = M.newKamp(S(), 3, '2026-11-13'); zz.days.shift(); // vrijdag weggehaald: Zaterdag, Zondag
  assert.deepEqual(M.kampFitRow(zz, '2026-11-13', '2026-11-15'), { date: '2026-11-14', endDate: '2026-11-15' }, 'eerste dag weggehaald: begint op zaterdag');
  const zo = M.newKamp(S(), 3, '2026-11-13'); zo.days.splice(2, 1); // zondag weggehaald
  assert.deepEqual(M.kampFitRow(zo, '2026-11-13', '2026-11-15'), { date: '2026-11-13', endDate: '2026-11-14' }, 'laatste dag weggehaald');
  const eigen = M.newKamp(S(), 2, '2026-11-13'); eigen.days[0].label = 'Aankomst';
  assert.deepEqual(M.kampFitRow(eigen, '2026-11-13', '2026-11-15'), { date: '2026-11-13', endDate: '2026-11-14' }, 'eerste dag zonder weekdagnaam: datum blijft');
  const een = M.newKamp(S(), 1, '2026-11-14');
  assert.deepEqual(M.kampFitRow(een, '2026-11-14', '2026-11-15'), { date: '2026-11-14', endDate: '' }, 'kamp van één dag: geen einddatum');
  const ma = M.newKamp(S(), 2, '2026-11-13'); ma.days[0].label = 'Maandag';
  assert.deepEqual(M.kampFitRow(ma, '2026-11-13', '2026-11-15').date, '2026-11-13', 'weekdag buiten de oude rij: datum blijft');
  assert.equal(M.kampMismatch(zz, '2026-11-14', '2026-11-15'), null, 'daarna past het');
});
test('copyKampDay: een weekdag krijgt als kopie de volgende weekdag', () => {
  const k = M.newKamp(S(), 3); // Vrijdag, Zaterdag, Zondag (zonder datum)
  k.days[1].blocks.push(blk('hike', 600, 60));
  const at = M.copyKampDay(k, 1, null);
  assert.equal(at, 2);
  assert.deepEqual(k.days.map(d => d.label), ['Vrijdag', 'Zaterdag', 'Zondag', 'Maandag'], 'geen twee tabs Zondag');
  assert.equal(k.days[2].blocks.length, 1, 'onderdelen gaan mee');
  assert.notEqual(k.days[2].blocks[0].id, 'hike', 'met nieuwe ids'); assert.notEqual(k.days[2].id, k.days[1].id);
  const d = M.newKamp(S(), 2, '2026-11-14'); // za 14 – zo 15
  M.copyKampDay(d, 0, '2026-11-14');
  assert.deepEqual(d.days.map(x => x.label), ['Zaterdag', 'Zondag', 'Maandag'], 'met datum: de weekdag van de datum');
  assert.equal(M.dayTitle(d, 1, '2026-11-15'), 'Zondag 15 nov', 'kopie heet niet "Zaterdag (kopie) 15 november"');
  const e = M.newKamp(S(), 2); e.days[0].label = 'Hikedag';
  M.copyKampDay(e, 0, null);
  assert.deepEqual(e.days.map(x => x.label), ['Hikedag', 'Hikedag (kopie)', 'Zaterdag'], 'andere naam: (kopie), weekdagen erna blijven');
});
test('dayShort bij taken per leiding: unieke korte dagnaam', () => {
  const k = M.normOpk({ id: 'k', kind: 'kamp', days: [{ label: 'Dag 1' }, { label: 'Dag 2' }] });
  assert.deepEqual([M.dayShort(k, 0, null), M.dayShort(k, 1, null)], ['dag 1', 'dag 2'], 'niet twee keer "da"');
  assert.equal(M.dayShort(k, 1, '2026-11-15'), 'zo 15', 'met datum');
});
test('progBlocks: vaste blokken tellen niet als onderdeel', () => {
  const o = M.newOpk(S());
  assert.ok(o.blocks.length >= 3 && M.progBlocks(o).length === 0 && M.progEmpty(o), 'nieuwe opkomst: 0 onderdelen');
  o.blocks.push(blk('spel', 900, 30));
  assert.deepEqual(M.progBlocks(o).map(b => b.id), ['spel']);
  assert.equal(M.progEmpty(o), false);
});
test('kampMismatch: kamp past qua lengte niet bij de rij', () => {
  const k = M.newKamp(S(), 3); // vr–zo
  assert.deepEqual(M.kampMismatch(k, '2026-11-07', '2026-11-08'), { prog: 3, row: 2 }, 'rij za–zo, kamp vr–zo');
  assert.equal(M.kampMismatchNote(k, '2026-11-07', '2026-11-08'), 'Het kamp heeft 3 dagen, de jaarplanning 2 (za 7 – zo 8 nov). Controleer de data.');
  assert.equal(M.kampMismatch(k, '2026-11-06', '2026-11-08'), null, 'rij vr–zo past');
  assert.deepEqual(M.kampMismatch(M.newKamp(S(), 2), '2026-11-06', '2026-11-08'), { prog: 2, row: 3 }, 'kamp za–zo op een rij vr–zo');
  assert.deepEqual(M.kampMismatch(k, '2026-11-07', ''), { prog: 3, row: 1 }, 'zonder einddatum is de rij één dag');
  assert.equal(M.kampMismatch(M.newKamp(S(), 1), '2026-11-08', ''), null, 'kamp van één dag zonder einddatum');
  assert.equal(M.kampMismatch(opk(), '2026-11-07', '2026-11-08'), null, 'gewone opkomst: niets');
  assert.equal(M.kampMismatchNote(k, '2026-11-06', '2026-11-08'), '');
});
test('kampdag mag doorlopen tot na middernacht (26:00)', () => {
  const d = M.normDay({ label: 'Zaterdag', start: 1200, end: 1560, blocks: [blk('nacht', 1440, 60)] });
  assert.equal(d.end, 1560); assert.equal(fmtT(d.end), '02:00');
  const a = M.analyzeOne(d, [], [], false);
  assert.ok(!a.issues.some(i => /valt buiten/.test(i.text)), 'onderdeel om 00:00 valt binnen de dag');
  assert.equal(M.normDay({ start: 600, end: 500 }).end, 660, 'eind vóór begin wordt een uur na het begin');
});
test('dayTitle en relabelDays: weekdagnaam volgt de datum', () => {
  const k = M.newKamp(S(), 2);
  assert.equal(M.dayTitle(k, 0, '2026-10-17'), 'Zaterdag 17 okt');
  assert.equal(M.dayTitle(k, 1, '2026-10-18', true), 'Zondag 18 oktober');
  assert.equal(M.dayTitle(k, 0, null), k.days[0].label);
  k.days[1].label = 'Hike'; assert.equal(M.dayTitle(k, 1, '2026-10-18'), 'Hike 18 okt', 'eigen naam blijft');
  assert.equal(M.relabelDays(k, '2026-10-17'), true); assert.equal(k.days[0].label, 'Zaterdag'); assert.equal(k.days[1].label, 'Hike');
  assert.equal(M.relabelDays(k, '2026-10-17'), false, 'niets meer te veranderen');
});

/* ---------- seizoen en jaarplanning ---------- */
test('seasonRange en seasonOf', () => {
  assert.deepEqual(M.seasonRange(S(), 2026), { from: '2026-09-01', to: '2027-07-31' });
  assert.deepEqual(M.seasonRange(S({ seasonStartMonth: 1, seasonEndMonth: 12 }), 2026), { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(M.seasonOf(S(), '2026-07-31'), 2025);
  assert.equal(M.seasonOf(S(), '2026-08-01'), 2026, 'zomerpauze hoort bij het komende seizoen');
  assert.equal(M.seasonOf(S(), '2027-03-01'), 2026);
  assert.equal(M.seasonLabel(S(), 2026), '2026–2027');
});
test('rowsIn: vaste opkomstdagen plus extra data, op datum', () => {
  const s = S({ opkDay: 6 });
  const plans = [plan({ id: 'p1', slot: '2026-10-17', date: '2026-10-17', topic: 'Bosspel' }), plan({ id: 'x', slot: null, date: '2026-10-21', topic: 'Extra' }),
    plan({ id: 'k', slot: null, date: '2026-10-09', endDate: '2026-10-11', type: 'kamp' }), plan({ id: 'weg', slot: null, date: '2026-12-01' })];
  const rows = M.rowsIn(s, plans, '2026-10-10', '2026-10-31');
  assert.deepEqual(rows.map(r => r.key), ['k', 's:2026-10-10', 'p1', 'x', 's:2026-10-24', 's:2026-10-31']);
  // de React-key van een vaste dag blijft gelijk als er een rij voor wordt aangemaakt (anders verdwijnt het veld waarin je typt)
  assert.deepEqual(rows.map(r => r.rk), ['k', 's:2026-10-10', 's:2026-10-17', 'x', 's:2026-10-24', 's:2026-10-31']);
  assert.equal(rows[2].e!.topic, 'Bosspel');
  assert.equal(M.rowEnd(rows[0]), '2026-10-11');
  assert.deepEqual(M.opkDaysIn(s, 'kapot', '2026-10-31'), [], 'foute datum: geen eindeloze lus');
});
test('newEntry en normPlan', () => {
  const e = M.newEntry(null, '2026-10-21');
  assert.equal(e.slot, null); assert.equal(e.date, '2026-10-21'); assert.equal(e.type, 'opkomst'); assert.equal(e.opkId, null);
  assert.deepEqual(e.letter, { needed: false, due: '', sent: false });
  assert.equal(M.newEntry('2026-10-17').date, '2026-10-17', 'zonder datum: de vaste dag');
  const p = M.normPlan({ id: 'p', date: '2026-10-17', type: 'raar', planners: 'Akela, Baloe', start: '600' });
  assert.equal(p.type, 'opkomst'); assert.deepEqual(p.planners, ['Akela', 'Baloe']); assert.equal(p.start, 600); assert.equal(p.end, null);
});

/* ---------- datum en tijd ---------- */
test('parseNL', () => {
  assert.equal(parseNL('17-10-2026'), '2026-10-17');
  assert.equal(parseNL(' 1/2/26 '), '2026-02-01');
  assert.equal(parseNL('1.2.2026'), '2026-02-01');
  assert.equal(parseNL('31-02-2026'), null, 'bestaat niet');
  assert.equal(parseNL('17-10-202'), null, 'jaartal van 3 cijfers');
  assert.equal(parseNL('17-10-1999'), null);
  assert.equal(parseNL('morgen'), null);
  // alleen cijfers (cijferpad op een iPhone heeft geen streepje)
  assert.equal(parseNL('07112026'), '2026-11-07');
  assert.equal(parseNL('071126'), '2026-11-07');
  assert.equal(parseNL('0711', '2026-10-22'), '2026-11-07', 'zonder jaartal: eerstvolgende');
  assert.equal(parseNL('0710', '2026-10-22'), '2027-10-07', 'al geweest: volgend jaar');
  assert.equal(parseNL('2210', '2026-10-22'), '2026-10-22', 'vandaag telt mee');
  assert.equal(parseNL('31022026'), null, 'bestaat niet');
  assert.equal(parseNL('7112026'), null, '7 cijfers is niet eenduidig');
  assert.equal(parseNL('07-11-2026', '2030-01-01'), '2026-11-07', 'met jaartal telt vandaag niet');
  assert.equal(parseNL('7-11', '2026-10-22'), '2026-11-07', 'dd-mm zonder jaartal: eerstvolgende');
  assert.equal(parseNL('07-11', '2026-10-22'), '2026-11-07');
  assert.equal(parseNL('7/11', '2026-10-22'), '2026-11-07');
  assert.equal(parseNL('7 11', '2026-10-22'), '2026-11-07');
  assert.equal(parseNL('7-10', '2026-10-22'), '2027-10-07', 'al geweest: volgend jaar');
  assert.equal(parseNL('31-2', '2026-10-22'), null, 'bestaat niet');
  assert.equal(parseNL('7-11-'), null);
});
test('parseRange: datum en "tot en met", met duidelijke meldingen', () => {
  const T = '2026-10-23';
  assert.deepEqual(parseRange('07-11-2026', '', T), { iso: '2026-11-07', endIso: '' }, 'leeg = één dag');
  assert.deepEqual(parseRange('07-11-2026', ' 08-11-2026 ', T), { iso: '2026-11-07', endIso: '2026-11-08' });
  assert.deepEqual(parseRange('07-11-2026', '07-11-2026', T), { iso: '2026-11-07', endIso: '2026-11-07' }, 'zelfde dag mag');
  assert.deepEqual(parseRange('07-11-202', '', T), { error: 'Typ de datum als dd-mm-jjjj.' });
  assert.deepEqual(parseRange('', '08-11-2026', T), { error: 'Typ de datum als dd-mm-jjjj.' });
  assert.deepEqual(parseRange('07-11-2026', '31-02-2026', T), { error: 'Typ "tot en met" als dd-mm-jjjj, of laat het leeg.' });
  assert.deepEqual(parseRange('07-11-2026', '06-11-2026', T), { error: '"Tot en met" moet na de datum liggen.' });
});
test('parseRange: "tot en met" zonder jaartal telt vanaf de datum, niet vanaf vandaag', () => {
  assert.deepEqual(parseRange('20-10-2026', '22-10', '2026-10-26'), { iso: '2026-10-20', endIso: '2026-10-22' }, 'datum in het verleden: geen periode van ruim een jaar');
  assert.deepEqual(parseRange('17-10-2026', '25-10', '2026-10-26'), { iso: '2026-10-17', endIso: '2026-10-25' }, 'Geen opkomst over een periode die al voorbij is');
  // allebei zonder jaartal in een periode die al loopt: de datum is de eerstvolgende keer (volgend jaar), het einde volgt die datum
  assert.deepEqual(parseRange('17-10', '25-10', '2026-10-20'), { iso: '2027-10-17', endIso: '2027-10-25' }, 'geen foutmelding, dezelfde periode volgend jaar');
  assert.deepEqual(parseRange('28-12-2026', '03-01', '2026-10-20'), { iso: '2026-12-28', endIso: '2027-01-03' }, 'over de jaarwisseling');
  assert.equal(tidyNL('22-10', '2026-10-20'), '22-10-2026', 'veld netjes zetten met de datum als referentie');
  assert.equal(tidyNL('22-10', null), tidyNL('22-10'), 'zonder referentie: vanaf vandaag');
});
test('tidyNL', () => {
  assert.equal(tidyNL('07112026'), '07-11-2026');
  assert.equal(tidyNL('7/11/26'), '07-11-2026');
  assert.equal(tidyNL('foutje'), 'foutje');
  assert.equal(tidyNL(''), '');
});
test('isoWeek', () => {
  assert.equal(isoWeek('2026-01-01'), 1);
  assert.equal(isoWeek('2021-01-03'), 53, 'zondag hoort bij de week ervoor');
  assert.equal(isoWeek('2024-12-30'), 1, 'maandag in de eerste week van het nieuwe jaar');
  assert.equal(isoWeek('2026-10-22'), 43);
});
test('isBlankOpk: nieuwe, onaangeroerde opkomst', () => {
  const o = M.newOpk(S());
  assert.equal(M.isBlankOpk(o), true, 'alleen vaste blokken');
  assert.equal(M.isBlankOpk({ ...o, title: 'Sluipspel' }), false);
  assert.equal(M.isBlankOpk({ ...o, short: 'Iets' }), false);
  assert.equal(M.isBlankOpk({ ...o, cats: ['c1'] }), false);
  assert.equal(M.isBlankOpk({ ...o, blocks: [...o.blocks, M.normBlock({ title: '', start: 900, dur: 15, cat: 'spel' })] }), false, 'een eigen onderdeel');
  const k = M.newKamp(S(), 3);
  assert.equal(M.isBlankOpk(k), true, 'kamp zonder onderdelen');
  k.days[1].blocks.push(M.normBlock({ title: 'Ontbijt', start: 510, dur: 30 }));
  assert.equal(M.isBlankOpk(k), false);
});
test('fitsTopic', () => {
  const o = (title: string, short = '') => ({ title, short });
  assert.equal(M.fitsTopic(o('Sinterklaasopkomst'), 'Sinterklaas'), true);
  assert.equal(M.fitsTopic(o('Sinterklaas'), 'Sinterklaasopkomst'), true, 'andersom');
  assert.equal(M.fitsTopic(o('Pionieren met touw'), 'pionieren'), true, 'hoofdletters maken niet uit');
  assert.equal(M.fitsTopic(o('Vossenjacht', 'In het bos met kompas'), 'Kompas'), true, 'ook in de beschrijving');
  assert.equal(M.fitsTopic(o('Vossenjacht'), 'Sinterklaas'), false);
  assert.equal(M.fitsTopic(o('Opkomst in het bos'), 'Sinterklaasopkomst'), false, 'algemene woorden tellen niet');
  assert.equal(M.fitsTopic(o('Sinterklaasopkomst'), ''), false, 'geen onderwerp');
});
test('libFields en blockFromLib', () => {
  const l = M.normLib({ id: 'L1', title: 'Kompasposten', dur: 45, cat: 'spel', minLeaders: 2, location: 'Bos', short: 'Kort', desc: 'Lang', prep: 'Klaarzetten', materials: 'Kompas', updatedAt: 5 });
  assert.deepEqual(Object.keys(M.libFields(l)).sort(), [...M.LIB_FIELDS].sort(), 'alleen de gedeelde velden, geen id of updatedAt');
  const b = M.blockFromLib(l, 840);
  assert.equal(b.libId, 'L1'); assert.equal(b.start, 840); assert.ok(b.id && b.id !== 'L1', 'eigen id');
  assert.deepEqual(M.libFields(b), M.libFields(l));
  assert.deepEqual(b.names, [], 'geen namen uit de bank');
});
test('normLib: minimaal 0 leiding blijft 0 (zonder waarde 1)', () => {
  assert.equal(M.normLib({ id: 'L0', minLeaders: 0 }).minLeaders, 0, 'onderdeel zonder leiding uit de bouwer');
  assert.equal(M.normLib({ id: 'L1' }).minLeaders, 1, 'zonder waarde: 1');
  assert.equal(M.normLib({ id: 'L2', minLeaders: -3 }).minLeaders, 0, 'negatief wordt 0');
});
test('libSearchText: ook uitgebreide beschrijving, voorbereiding en materiaal', () => {
  const t = M.libSearchText(M.normLib({ id: 'L', title: 'Junglejacht', short: 'Tikspel', desc: 'Wie getikt wordt, wordt een tijger.', location: 'Grasveld', prep: 'Kaartjes lamineren', materials: 'Lintjes' }));
  for (const w of ['junglejacht', 'tikspel', 'tijger', 'grasveld', 'lamineren', 'lintjes']) assert.ok(t.includes(w), w);
});

test('hexColor en normSettings: alleen #rrggbb als kleur van een categorie (geen CSS uit een back-up of de groep)', () => {
  assert.equal(M.hexColor('#2D7A4F', 'x'), '#2D7A4F');
  assert.equal(M.hexColor('#abc', 'x'), 'x');
  assert.equal(M.hexColor('red, red) url("https://evil/p.png', 'x'), 'x');
  assert.equal(M.hexColor(undefined, 'x'), 'x');
  const s = M.normSettings({ categories: [{ id: 'a', label: 'A', color: 'red, red) url("https://evil/p.png' }, { id: 'b', label: 'B', color: '#123abc' }] });
  assert.deepEqual(s.categories.map(c => c.color), [M.SWATCHES[0], '#123abc']);
});

test('isBlankPlan: alleen een lege gewone opkomst op zijn eigen datum telt als leeg', () => {
  assert.equal(M.isBlankPlan(plan({ slot: '2026-12-19', date: '2026-12-19' })), true);
  assert.equal(M.isBlankPlan(plan({ slot: null, date: '2026-12-18' })), true, 'losse rij zonder inhoud');
  for (const [why, extra] of [
    ['onderwerp', { topic: 'Kerst' }], ['opmerking', { note: 'Vertrek 13:45' }], ['programma', { opkId: 'o1' }], ['planners', { planners: ['Baloe'] }],
    ['afwezig', { absent: ['Kaa'] }], ['brief', { letter: { needed: true, due: '', sent: false } }], ['eigen tijden', { start: 600, end: 720 }],
    ['geen opkomst', { type: 'geen' }], ['kamp', { type: 'kamp' }], ['verzet', { date: '2026-12-20' }], ['meer dagen', { endDate: '2026-12-20' }],
  ] as [string, Partial<Plan>][]) assert.equal(M.isBlankPlan(plan({ slot: '2026-12-19', date: '2026-12-19', ...extra })), false, why);
});
