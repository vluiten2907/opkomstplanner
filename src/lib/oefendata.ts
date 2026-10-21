/*
 * Voorbeelddata voor de oefenomgeving: een welpenspeltak met een gevulde jaarplanning,
 * uitgewerkte opkomsten, een weekendkamp en gevulde banken. Datums liggen rond vandaag.
 */
import { fixedBlocks, nextOpkDay, normBlock, normLib, normOpk, normPlan, normSettings, type Block, type Lib, type Opk, type Plan } from './model';
import { addDays } from './time';
import { ALL_PERMS } from './types';

export const OEFEN_SID = 'oefen';
export const OEFEN_UID = 'oefen-jij';
export const OEFEN_NAME = 'Akela';

const LIB: Record<string, Partial<Lib>> = {
  jungle: { title: 'Junglejacht', dur: 30, cat: 'spel', minLeaders: 2, location: 'Grasveld', short: 'Tikspel waarbij Shere Khan de welpen probeert te vangen.', desc: 'Eén leiding is Shere Khan. Welpen rennen van boom naar boom; wie getikt wordt, wordt ook een tijger. Wie als laatste over is, wint.', materials: 'Lintjes in twee kleuren' },
  knopen: { title: 'Knopen leren', dur: 30, cat: 'ust', minLeaders: 2, location: 'Lokaal', short: 'Platte knoop, mastworp en paalsteek.', desc: 'Voordoen, nadoen en daarna een estafette: wie legt de knoop het snelst goed?', prep: 'Touwtjes op lengte knippen', materials: 'Touw (1 m per welp)\nPaal of stoelpoot' },
  stratego: { title: 'Levend stratego', dur: 60, cat: 'spel', minLeaders: 4, location: 'Bos achter het clubhuis', short: 'Twee teams met rangkaartjes veroveren elkaars vlag.', desc: 'Iedere welp krijgt een kaartje met een rang. Tik je iemand, dan vergelijk je de rangen bij de scheidsrechter. De hoogste wint.', prep: 'Kaartjes printen en lamineren', materials: 'Rangkaartjes\n2 vlaggen\nFluitje' },
  kompas: { title: 'Kompas en kaartlezen', dur: 45, cat: 'buitenleven', minLeaders: 3, location: 'Park', short: 'In groepjes een route lopen met kompas en kaart.', desc: 'Uitleg van het kompas, daarna lopen de nesten een korte route met posten.', materials: 'Kompassen (1 per nest)\nKaartjes van het park' },
  vuur: { title: 'Vuur maken', dur: 45, cat: 'ust', minLeaders: 2, location: 'Vuurplaats', short: 'Vuur maken met vuurstaal en weinig materiaal.', desc: 'Eerst veilig werken uitleggen, dan per nest een vuurtje bouwen. Wie krijgt het water als eerste aan de kook?', prep: 'Droog hout en berkenbast verzamelen', materials: 'Vuurstaal\nBerkenbast\nEmmer water\nPannetjes' },
  ehbo: { title: 'EHBO-kwartet', dur: 20, cat: 'veilig', minLeaders: 2, location: 'Lokaal', short: 'Kwartetspel over pleisters, wespensteken en brandwonden.', materials: 'Kwartetkaarten\nVerbandtrommel om te laten zien' },
  liedjes: { title: 'Liedjes rond het vuur', dur: 15, cat: 'identiteit', minLeaders: 1, location: 'Vuurplaats', short: 'Afsluiten met een paar vaste welpenliedjes.' },
  speurtocht: { title: 'Speurtocht door de wijk', dur: 60, cat: 'samenleving', minLeaders: 3, location: 'Wijk rond het clubhuis', short: 'Vragen beantwoorden en foto’s maken bij herkenningspunten.', prep: 'Route lopen en vragen maken', materials: 'Vragenlijsten\nPennen\nTelefoon voor foto’s' },
  toneel: { title: 'Toneelstukje in nesten', dur: 30, cat: 'expressie', minLeaders: 2, location: 'Lokaal', short: 'Elk nest speelt een stukje uit het Jungleboek.', materials: 'Verkleedkist' },
  trefbal: { title: 'Trefbal', dur: 30, cat: 'sportspel', minLeaders: 2, location: 'Gymzaal', short: 'Klassiek trefbal met zachte ballen.', materials: '3 zachte ballen\nPionnen' },
  quiz: { title: 'Landenquiz', dur: 30, cat: 'internationaal', minLeaders: 1, location: 'Lokaal', short: 'Vlaggen, hoofdsteden en scouting in andere landen.', materials: 'Vlaggenkaarten\nBeamer' },
  vlaggenroof: { title: 'Vlaggenroof', dur: 45, cat: 'spel', minLeaders: 3, location: 'Bos achter het clubhuis', short: 'Twee kampen, elk met een vlag. Pak de vlag van de ander.', materials: '2 vlaggen\nLintjes' },
};

export function oefenData(): Record<string, any> {
  const settings = normSettings({
    groupName: 'Scouting De Voorbeeldgroep', speltak: 'Welpen', accent: 'groen', opkDay: 6, defStart: 840, defEnd: 990,
    leaders: ['Baloe', 'Bagheera', 'Kaa', 'Raksha', 'Chil'], locations: ['Clubhuis', 'Bos achter het clubhuis', 'Grasveld', 'Gymzaal', 'Kampterrein De Hoge Den'],
  });
  const now = Date.now();
  const lib: Lib[] = Object.entries(LIB).map(([id, l]) => normLib({ ...l, id: 'lib-' + id, updatedAt: now }));
  const L = (k: string) => lib.find(x => x.id === 'lib-' + k)!;
  const fromLib = (k: string, start: number, names: string[] = [], dur?: number): Block => {
    const l = L(k); return normBlock({ ...l, id: undefined, libId: l.id, start, dur: dur || l.dur, names });
  };
  const own = (title: string, cat: string, start: number, dur: number, names: string[] = [], extra: Partial<Block> = {}) => normBlock({ title, cat, start, dur, names, minLeaders: 1, ...extra });
  const opkomst = (id: string, state: Opk['state'], title: string, short: string, cats: string[], lead: string, blocks: Block[], extra: Partial<Opk> = {}) =>
    normOpk({ id, state, title, short, cats, lead, group: 'Welpen', location: 'Clubhuis', start: 840, end: 990, prep: 30, post: 30,
      blocks: [...fixedBlocks(settings, 840, 990), ...blocks], createdAt: now, updatedAt: now, shared: true, ...extra }, settings);

  const sat = nextOpkDay(settings);
  const wk = (n: number) => addDays(sat, 7 * n);

  const opks: Opk[] = [
    // eerder gedraaid
    opkomst('opk-speur', 'planned', 'Speurtocht door de wijk', 'Met de nesten de wijk in.', ['samenleving'], 'Baloe',
      [fromLib('trefbal', 845, ['Kaa', 'Chil'], 25), fromLib('speurtocht', 925, ['Baloe', 'Raksha', 'Akela'], 60)]),
    opkomst('opk-toneel', 'planned', 'Jungleboek-toneel', 'Elk nest speelt een stukje uit het Jungleboek.', ['expressie'], 'Raksha',
      [fromLib('jungle', 845, ['Kaa', 'Baloe']), fromLib('toneel', 925, ['Raksha', 'Bagheera']), own('Opvoering voor elkaar', 'expressie', 955, 30, ['Raksha'])]),
    // komende zaterdag: helemaal uitgewerkt
    opkomst('opk-jungle', 'planned', 'Junglejacht en stratego', 'Rennen, knopen en een groot spel in het bos.', ['spel', 'ust'], 'Akela',
      [fromLib('jungle', 845, ['Baloe', 'Kaa']), fromLib('knopen', 875, ['Akela', 'Raksha']), fromLib('stratego', 925, ['Akela', 'Baloe', 'Bagheera', 'Kaa'])]),
    // week daarna: te weinig leiding bij het kompasspel (aandachtspunt)
    opkomst('opk-vuur', 'planned', 'Vuur en kompas', 'Buitenopkomst: kaartlezen en vuur maken.', ['buitenleven', 'ust'], 'Kaa',
      [fromLib('kompas', 845, ['Kaa', 'Bagheera']), fromLib('ehbo', 890, ['Akela']), fromLib('vuur', 925, ['Akela', 'Kaa']), fromLib('liedjes', 970, ['Akela'])]),
    // concept
    opkomst('opk-sint', 'draft', 'Sinterklaasopkomst', 'Pakjes, pepernoten en een pietendiploma.', ['expressie'], '',
      [own('Pietendiploma halen', 'spel', 845, 45), own('Pepernoten bakken', 'expressie', 925, 45)]),
    // opkomstenbank (zonder namen)
    opkomst('opk-bank-knopen', 'bank', 'Knopen en pionieren', 'Knopen leren en samen een kleine toren bouwen.', ['ust'], '',
      [fromLib('knopen', 845), own('Toren bouwen met sjorringen', 'ust', 925, 60, [], { minLeaders: 3, materials: 'Palen\nSjortouw' })]),
    opkomst('opk-bank-wereld', 'bank', 'Rond de wereld', 'Spelletjes en hapjes uit andere landen.', ['internationaal'], '',
      [fromLib('quiz', 845), own('Spelletjes uit andere landen', 'internationaal', 875, 30, [], { minLeaders: 2 }), own('Hapjes proeven', 'internationaal', 925, 30, [], { minLeaders: 2 })]),
    opkomst('opk-bank-vlag', 'bank', 'Grote vlaggenroof', 'Een hele middag één groot bosspel.', ['spel'], '',
      [fromLib('vlaggenroof', 845, [], 60), fromLib('vlaggenroof', 925, [], 60)]),
  ];

  // weekendkamp vrijdag t/m zondag
  const kampFri = addDays(wk(4), -1);
  opks.push(normOpk({ id: 'opk-kamp', state: 'planned', kind: 'kamp', title: 'Winterweekend', short: 'Twee nachten in de blokhut op kampterrein De Hoge Den.', cats: ['buitenleven'], lead: 'Akela',
    group: 'Welpen', location: 'Kampterrein De Hoge Den', createdAt: now, updatedAt: now, shared: true,
    days: [
      { id: 'kd1', label: 'Vrijdag', start: 1140, end: 1410, blocks: [own('Aankomst en bedden opmaken', 'buitenleven', 1140, 45, ['Akela', 'Raksha']), own('Nachtspel', 'spel', 1230, 60, ['Baloe', 'Kaa', 'Chil'], { minLeaders: 3 }), own('Chocomelk en naar bed', 'identiteit', 1320, 30, ['Akela'])] },
      { id: 'kd2', label: 'Zaterdag', start: 480, end: 1380, blocks: [own('Ontbijt', 'veilig', 510, 45, ['Raksha']), { ...fromLib('speurtocht', 600, ['Baloe', 'Bagheera', 'Chil'], 120) }, own('Lunch', 'veilig', 750, 45, ['Raksha']), fromLib('vlaggenroof', 840, ['Baloe', 'Kaa', 'Bagheera']), fromLib('vuur', 960, ['Akela', 'Kaa']), own('Avondeten', 'veilig', 1050, 60, ['Raksha', 'Chil']), own('Kampvuur', 'identiteit', 1200, 75, ['Akela', 'Baloe'])] },
      { id: 'kd3', label: 'Zondag', start: 480, end: 900, blocks: [own('Ontbijt', 'veilig', 510, 45, ['Raksha']), own('Opruimen en inpakken', 'veilig', 600, 90, ['Akela', 'Kaa']), own('Ouders ophalen met presentatie', 'identiteit', 840, 60, ['Akela'])] },
    ] }, settings));

  const plan = (id: string, p: Partial<Plan>) => normPlan({ id, updatedAt: now, ...p });
  const plans: Plan[] = [
    plan('pl-m3', { slot: wk(-3), date: wk(-3), topic: 'Startopkomst: kennismaken' }),
    plan('pl-m2', { slot: wk(-2), date: wk(-2), topic: 'Speurtocht door de wijk', opkId: 'opk-speur', planners: ['Baloe'] }),
    plan('pl-m1', { slot: wk(-1), date: wk(-1), topic: 'Jungleboek-toneel', opkId: 'opk-toneel', planners: ['Raksha', 'Bagheera'] }),
    plan('pl-0', { slot: wk(0), date: wk(0), topic: 'Junglejacht en stratego', opkId: 'opk-jungle', planners: ['Akela', 'Baloe'], absent: ['Chil'] }),
    plan('pl-1', { slot: wk(1), date: wk(1), topic: 'Vuur en kompas', opkId: 'opk-vuur', planners: ['Kaa'], absent: ['Baloe', 'Raksha', 'Chil'] }),
    plan('pl-2', { slot: wk(2), date: wk(2), topic: 'Sinterklaas', planners: ['Bagheera', 'Raksha'] }),
    plan('pl-3', { slot: wk(3), date: wk(3), type: 'geen', topic: 'Geen opkomst', note: 'Leiding heeft een trainingsweekend.' }),
    plan('pl-kamp', { slot: wk(4), date: kampFri, endDate: addDays(kampFri, 2), type: 'kamp', topic: 'Winterweekend', opkId: 'opk-kamp', planners: ['Akela', 'Raksha'], letter: { needed: true, due: '', sent: false } }),
    plan('pl-5', { slot: wk(5), date: wk(5), topic: 'Rond de wereld', planners: ['Chil'] }),
    plan('pl-6', { slot: wk(6), date: wk(6), topic: 'Pannenkoekenopkomst' }),
    plan('pl-7', { slot: wk(7), date: wk(7), topic: 'Bosspel met de Scouts' }),
    plan('pl-9', { slot: wk(9), date: wk(9), topic: 'Ouderopkomst', letter: { needed: true, due: '', sent: false } }),
  ];

  const me = { name: OEFEN_NAME, email: 'jij@voorbeeld.nl', role: 'teamleider', perms: ALL_PERMS, since: now };
  const { groupName, speltak, ...rest } = settings;
  const out: Record<string, any> = {
    ['speltakken/' + OEFEN_SID]: { name: speltak, groupName, settings: rest, createdAt: now, createdBy: OEFEN_UID, members: { [OEFEN_UID]: me }, memberIds: [OEFEN_UID], tlIds: [OEFEN_UID], gid: null },
  };
  opks.forEach(o => { out[`speltakken/${OEFEN_SID}/opkomsten/${o.id}`] = o; });
  lib.forEach(l => { out[`speltakken/${OEFEN_SID}/activiteiten/${l.id}`] = l; });
  plans.forEach(p => { out[`speltakken/${OEFEN_SID}/planning/${p.id}`] = p; });
  return JSON.parse(JSON.stringify(out));
}
