// Unit-tests voor pure functies in src/lib/model.ts (draait in `npm run check`, of los: node test/unit/model.test.mjs).
// Vite laadt de TypeScript-bron direct; er is geen extra testpakket nodig.
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let fails = 0, n = 0;
const t = (name, ok) => { n++; console.log((ok ? 'OK   ' : 'FAIL ') + name); if (!ok) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
try {
  const M = await server.ssrLoadModule('/src/lib/model.ts');
  const s = M.defaultSettings();
  const blk = (id, start, dur, extra = {}) => M.normBlock({ id, start, dur, title: id, names: ['Akela'], libId: 'lib-' + id, ...extra });
  const opk = (extra = {}) => M.normOpk({ id: 'o1', state: 'draft', title: 'Spel', start: 840, end: 990, prep: 30, post: 30, lead: 'Baloe', srcId: 'bron', fromShared: 'g_x', shared: false,
    blocks: [blk('a', 840, 30), blk('b', 900, 30)], ...extra });

  /* ---- eerste vrije moment ---- */
  const day = { start: 840, end: 990, blocks: [blk('a', 840, 30), blk('b', 900, 30)] };
  t('firstFree: gat tussen twee onderdelen', M.firstFree(day, 30) === 870);
  t('firstFree: te lang voor het gat, dan na het laatste onderdeel', M.firstFree(day, 45) === 930);
  t('firstFree: nergens plek → null', M.firstFree(day, 90) === null);
  t('firstFree: lege dag → begin', M.firstFree({ start: 480, end: 1380, blocks: [] }, 60) === 480);
  t('firstFree: overlappende onderdelen tellen samen', M.firstFree({ start: 0, end: 100, blocks: [blk('x', 0, 40), blk('y', 10, 10)] }, 20) === 40);

  /* ---- opkomstenbank: zonder namen ---- */
  const o = opk();
  const b = M.toBank(o, 'In de bank');
  t('toBank (concept): zelfde id', b.id === 'o1' && b.blocks[0].id === 'a');
  t('toBank: state bank, titel, gedeeld', b.state === 'bank' && b.title === 'In de bank' && b.shared === true);
  t('toBank: geen namen en geen eindverantwoordelijke', b.lead === '' && M.allBlocks(b).every(x => x.names.length === 0));
  t('toBank: los van bron en groepsbank', b.srcId === null && b.fromShared === null);
  t('toBank: koppeling met de activiteitenbank blijft', b.blocks[0].libId === 'lib-a');
  t('toBank: origineel blijft ongewijzigd', o.state === 'draft' && o.lead === 'Baloe' && o.blocks[0].names[0] === 'Akela');
  const p = opk({ state: 'planned' }), pb = M.toBank(p, 'Kopie');
  t('toBank (ingepland): kopie met nieuwe ids', pb.id !== 'o1' && pb.blocks.every(x => !['a', 'b'].includes(x.id)) && pb.state === 'bank');
  const k = M.toBank(M.normOpk({ id: 'k1', kind: 'kamp', state: 'planned', lead: 'Kaa', days: [{ id: 'd1', label: 'Zaterdag', start: 480, end: 1380, blocks: [blk('c', 600, 60)] }] }), 'Kamp');
  t('toBank (kamp): ook namen in de dagen weg, nieuwe ids', k.id !== 'k1' && k.days[0].id !== 'd1' && k.days[0].blocks[0].names.length === 0 && k.lead === '');
  t('toBank (ingepland, copy=false): zelfde ids', M.toBank(p, 'x', false).id === 'o1');

  /* ---- kopie met nieuwe ids ---- */
  const c = M.copyOpk(M.normOpk({ id: 'o2', prep: 0, post: 15, blocks: [blk('a', 840, 30)] }), { ...s, prepMin: 30, postMin: 45 });
  t('copyOpk: nieuwe ids, eigen voorbereiding blijft', c.id !== 'o2' && c.blocks[0].id !== 'a' && c.prep === 0 && c.post === 15);
  const old = M.copyOpk({ id: 'o3', title: 'Oud', blocks: [] }, { ...s, prepMin: 30, postMin: 45 });
  t('copyOpk met instellingen: oude opkomst zonder voorbereiding krijgt de standaard', old.prep === 30 && old.post === 45);

  /* ---- tijden aanpassen ---- */
  const f = M.normOpk({ id: 'f', start: 840, end: 990, blocks: M.fixedBlocks(s, 840, 990) });
  const later = M.changeOpkTime(f, 'start', 1000);
  t('changeOpkTime: begin na eind schuift het eind mee, met melding', later.opk.start === 1000 && later.opk.end === 1060 && /Eindtijd verschoven naar 17:40/.test(later.note));
  t('changeOpkTime: vaste blokken schuiven mee', later.opk.blocks.find(x => x.cat === '__open').start === 1000 && later.opk.blocks.find(x => x.cat === '__close').start === 1055);
  t('changeOpkTime: origineel blijft ongewijzigd', f.start === 840 && f.end === 990 && f.blocks.find(x => x.cat === '__open').start === 840);
  const bad = M.changeOpkTime(f, 'end', 840);
  t('changeOpkTime: eind vóór begin geeft een fout en geen opkomst', !bad.opk && bad.error === 'De eindtijd moet na de begintijd liggen.');
  const end = M.changeOpkTime(f, 'end', 1020);
  t('changeOpkTime: nieuwe eindtijd, sluiten schuift mee, geen melding', end.opk.end === 1020 && end.opk.blocks.find(x => x.cat === '__close').start === 1015 && !end.note);
  const ap = M.normOpk({ id: 'g', start: 840, end: 990, blocks: M.fixedBlocks(s, 840, 990) }); M.applyPlanTimes(ap, 600, 720);
  t('applyPlanTimes: hele programma naar 10:00–12:00', ap.start === 600 && ap.end === 720 && ap.blocks.find(x => x.cat === '__close').start === 715);
} finally { await server.close(); }
console.log(`\n${n - fails}/${n} geslaagd`);
process.exit(fails ? 1 : 0);
