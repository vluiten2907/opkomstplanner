/*
 * Groepsbank: opkomsten uit de opkomstenbank die een speltak deelt met de hele Scouting-groep.
 * Opslag: groepen/{gid}/gedeeld/{sid}_{opkId} — een momentopname zonder namen.
 * Lezen mag wie lid is van een speltak in de groep (bewezen via groepen/{gid}/leden/{uid}) en de beheerder.
 */
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { allBlocks, catOf, hexColor, normOpk, opkCatOf, str, FIXED_CATS, OPK_EXTRA, SWATCHES, type Cat, type Opk, type Settings } from '../lib/model';
import { clone, num, uid as mkId } from '../lib/time';

export type Gedeeld = {
  id: string; sid: string; oid: string; speltakName: string;
  /** Categorieën die de opkomst gebruikt, zoals de delende speltak ze noemt. */
  catDefs: Cat[];
  opk: Opk; updatedAt: number; copies: number;
};

export const sharedId = (sid: string, oid: string) => sid + '_' + oid;
const UNIVERSAL = new Set([...FIXED_CATS.map(c => c.id), ...OPK_EXTRA.map(c => c.id), '']);

export function normGedeeld(id: string, d: any): Gedeeld {
  // categorieën van een andere speltak: alleen id, naam en een echte kleur (#rrggbb) overnemen
  const catDefs: Cat[] = Array.isArray(d.catDefs) ? d.catDefs.filter((c: any) => c && typeof c === 'object')
    .map((c: any) => ({ id: String(c.id ?? ''), label: String(c.label ?? ''), color: hexColor(c.color, SWATCHES[0]) })) : [];
  // tekstvelden altijd als tekst: één afwijkend document van een andere speltak mag de groepsbank niet platleggen
  return { id, sid: str(d.sid), oid: str(d.oid), speltakName: str(d.speltakName), catDefs,
    opk: normOpk({ ...(d.opk && typeof d.opk === 'object' ? d.opk : {}), state: 'bank' }), updatedAt: num(d.updatedAt, 0), copies: num(d.copies, 0) };
}

/** Wat er gedeeld wordt: de bank-opkomst zonder leiding, met de gebruikte categorieën. */
export function snapshotOf(o: Opk, s: Settings, sid: string, speltakName: string) {
  const opk = normOpk(clone(o));
  opk.state = 'bank'; opk.lead = ''; opk.srcId = null; opk.fromShared = null; opk.shared = true;
  allBlocks(opk).forEach(b => { b.names = []; b.libId = null; });
  const ids = new Set<string>([...allBlocks(opk).map(b => b.cat), ...opk.cats]);
  const catDefs: Cat[] = [];
  ids.forEach(id => {
    if (UNIVERSAL.has(id)) return;
    const c = s.categories.find(x => x.id === id) || opkCatOf(s, id);
    if (c) catDefs.push({ id: c.id, label: c.label, color: c.color });
  });
  return { sid, oid: o.id, speltakName, catDefs, opk, updatedAt: o.updatedAt };
}

/**
 * Handtekening van wat er gedeeld wordt: versie, speltaknaam en de gebruikte categorieën (naam en kleur).
 * Zelf opgebouwd (niet JSON van het hele object), zodat wat Firestore teruggeeft hetzelfde oplevert als wat we schreven.
 */
export const sharedSig = (x: { updatedAt: number; speltakName: string; catDefs: Cat[] }) =>
  [x.updatedAt, x.speltakName || '', ...(x.catDefs || []).map(c => c.id + '|' + c.label + '|' + c.color)].join('\n');

export async function writeShared(gid: string, data: ReturnType<typeof snapshotOf>) {
  const ref = doc(db, 'groepen', gid, 'gedeeld', sharedId(data.sid, data.oid));
  await setDoc(ref, clone(data), { merge: true });
}
export const removeShared = (gid: string, id: string) => deleteDoc(doc(db, 'groepen', gid, 'gedeeld', id));
export const countCopy = (gid: string, id: string) => updateDoc(doc(db, 'groepen', gid, 'gedeeld', id), { copies: increment(1) });

/** Lidmaatschap van de groep vastleggen (nodig om de groepsbank te mogen lezen). */
export async function ensureLid(gid: string, uid: string, sid: string, force = false) {
  const ref = doc(db, 'groepen', gid, 'leden', uid);
  if (!force) { try { const s = await getDoc(ref); if (s.exists()) return; } catch { /* dan schrijven we hem */ } }
  await setDoc(ref, { sid, since: Date.now() });
}

/** Categorie van de delende speltak in de eigen instellingen terugvinden (op naam). */
const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Kopie voor de eigen opkomstenbank. Categorieën worden op naam gekoppeld;
 * categorieën die je nog niet hebt komen in `add` (alleen toevoegen als je instellingen mag wijzigen),
 * anders vallen ze weg: hun namen staan in `dropped`.
 */
export function copyFromShared(g: Gedeeld, s: Settings, canAddCats: boolean): { opk: Opk; add: Cat[]; dropped: string[] } {
  const add: Cat[] = [];
  const dropped: string[] = [];
  const map = new Map<string, string>();
  g.catDefs.forEach(c => {
    const mine = [...s.categories, ...OPK_EXTRA].find(x => sameLabel(x.label, c.label));
    if (mine) { map.set(c.id, mine.id); return; }
    if (!canAddCats) { map.set(c.id, ''); if (c.label && !dropped.includes(c.label)) dropped.push(c.label); return; }
    const id = s.categories.some(x => x.id === c.id) ? mkId() : c.id;
    add.push({ id, label: c.label, color: hexColor(c.color, SWATCHES[0]) }); map.set(c.id, id);
  });
  const conv = (id: string) => UNIVERSAL.has(id) ? id : (map.get(id) ?? (catOf(s, id).id ? id : ''));
  const o = normOpk(clone(g.opk));
  o.id = mkId(); o.state = 'bank'; o.srcId = null; o.lead = ''; o.shared = false; o.fromShared = g.id; o.createdAt = Date.now();
  o.group = s.speltak || o.group;
  o.cats = o.cats.map(conv).filter(Boolean);
  o.days.forEach(d => d.id = mkId());
  allBlocks(o).forEach(b => { b.id = mkId(); b.names = []; b.libId = null; b.cat = conv(b.cat); });
  return { opk: o, add, dropped };
}
