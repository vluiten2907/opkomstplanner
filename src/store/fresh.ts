import type { NavigateFunction } from 'react-router-dom';
import { toast, undoAction } from './toast';
import { fmtRange } from '../lib/time';
import type { useSpeltak } from './speltak';
import { kampMismatchNote, newKamp, newOpk, type Plan } from '../lib/model';
/**
 * Nieuwe opkomsten (knop Nieuwe opkomst of Weekendkamp) worden meteen opgeslagen. Ga je weg zonder iets in te vullen,
 * dan ruimt de bouwer ze weer op, zodat er geen lege "Naamloze opkomst" bij de concepten blijft staan.
 */
const fresh = new Set<string>();
const open = new Map<string, number>();
export const markFresh = (id: string) => { fresh.add(id); };
export const isFresh = (id: string) => fresh.has(id);
/**
 * De bouwer van opkomst `id` staat open; de teruggegeven functie sluit hem. Is hij daarna niet meteen weer open
 * (React opent en sluit in de ontwikkelmodus alles één keer extra), dan volgt `drop` voor een nieuwe opkomst.
 * Daarna is hij niet meer nieuw: een volgende keer openen ruimt nooit iets op.
 */
export function watchFresh(id: string, drop: () => void) {
  open.set(id, (open.get(id) || 0) + 1);
  return () => {
    open.set(id, Math.max(0, (open.get(id) || 0) - 1));
    setTimeout(() => { if (open.get(id)) return; open.delete(id); if (fresh.delete(id)) drop(); }, 0);
  };
}

type Speltak = ReturnType<typeof useSpeltak>;

/** Knop Nieuwe opkomst of Weekendkamp: meteen opslaan, als nieuw markeren (zie watchFresh) en openen in de bouwer. */
export function createFresh(S: Speltak, kamp: boolean, nav: NavigateFunction) {
  const o = kamp ? newKamp(S.settings, 3) : newOpk(S.settings);
  S.saveOpk(o); markFresh(o.id); nav(`/s/${S.sid}/bouwer/${o.id}`);
  return o;
}

export type PlannedSpec = {
  /** De rij in de jaarplanning (id) en hoe hij was vóór het inplannen. */
  rowId: string; before: Plan;
  /** De rij bestond nog niet: hij is net voor deze datum gemaakt (vaste dag zonder rij, of Andere datum). */
  created: boolean;
  /** De ingeplande opkomst. */
  oid: string;
  /** 'copy': een nieuwe opkomst (kopie uit de bank, kopie van een ingeplande opkomst, of net gemaakt) die weer weg gaat; 'draft': het concept wordt weer concept. */
  kind: 'copy' | 'draft';
  /** Concept: de titel vóór het koppelen (een lege titel kreeg het onderwerp van de rij). */
  title0?: string;
};
/**
 * Ongedaan maken na inplannen of koppelen: één regel voor Koppelen (Kiezen, Nieuwe opkomst), Inplannen, Gebruiken en Programma maken.
 * - Alleen zolang de rij nog naar de opkomst wijst en niemand de opkomst heeft aangepast (ook niet door leiding in te delen in
 *   Opkomst overnemen): het tijdstip van opslaan wordt vlak na het inplannen vastgelegd, daarna opent Opkomst overnemen (dat slaat niets op).
 * - De rij gaat terug zoals hij was (onderwerp, soort, datum, einddatum); een rij die hiervoor nog niet bestond gaat weer weg, als er
 *   verder niets in staat (planners, afwezigen, opmerking, brief). Hing er eerst een ander concept aan, dan komt dat terug.
 * - Een kopie gaat weg, een concept wordt weer concept.
 * Geeft de functie voor de knop Ongedaan maken; `done` is de melding daarna, `after` volgt als het gelukt is.
 */
export function plannedUndo(S: Speltak, spec: PlannedSpec, done = 'Niet meer ingepland', after?: () => void) {
  let stamp: number | null = null;
  // pas na het opslaan: de nieuwste stand heeft dan het tijdstip van opslaan
  setTimeout(() => { stamp = S.latest().getO(spec.oid)?.updatedAt ?? null; }, 0);
  return () => {
    const L = S.latest(), row = L.plans.find(p => p.id === spec.rowId), cur = L.getO(spec.oid), b = spec.before;
    if (!row || row.opkId !== spec.oid || !cur || cur.state !== 'planned') { toast('Kan niet meer terug: de opkomst of de datum is intussen veranderd.'); return; }
    if (stamp != null && cur.updatedAt !== stamp) { toast('Kan niet meer terug: er is al aan gewerkt.'); return; }
    const empty = !row.planners.length && !row.absent.length && !row.note.trim() && !row.letter.needed;
    if (spec.created && empty) L.deletePlan(row.id);
    else {
      // het concept dat er eerst aan hing (nu weer concept, en nergens anders gekoppeld) komt terug
      const prev = b.opkId && b.opkId !== spec.oid ? L.getO(b.opkId) : undefined, relink = !!prev && prev.state === 'draft' && !L.plans.some(p => p.opkId === prev.id);
      L.savePlan({ ...row, opkId: relink ? prev!.id : null, topic: b.topic, type: b.type, date: b.date, endDate: b.endDate });
      if (relink) L.saveOpk({ ...prev!, state: 'planned' });
    }
    if (spec.kind === 'copy') L.deleteOpk(cur.id);
    else L.saveOpk({ ...cur, state: 'draft', title: spec.title0 !== undefined && !spec.title0.trim() ? spec.title0 : cur.title });
    toast(done);
    after?.();
  };
}
/**
 * Programma maken voor een datum in de jaarplanning (Maken in de opkomstbouwer, Nieuwe opkomst of Weekendkamp in Koppelen,
 * Programma maken op het dashboard): een nieuwe opkomst met het onderwerp als titel, meteen gekoppeld, en open in de bouwer
 * met de details open (net als Nieuwe opkomst). De melding heeft Ongedaan maken (zie plannedUndo): de opkomst weer weg en de rij zoals hij was
 * (het onderwerp blijft). Daarna terug naar `from`, de pagina waar je vandaan kwam (als je nog in de bouwer van die opkomst bent).
 */
export function makeForEntry(S: Speltak, key: string, kamp: boolean, nav: NavigateFunction, from: string) {
  const created = !S.peekEntry(key), before = { ...S.entryFor(key) }, o = S.newForEntry({ ...before }, kamp), to = `/s/${S.sid}/bouwer/${o.id}`;
  markFresh(o.id); nav(to);
  // terug naar de jaarplanning: met die rij in beeld
  const path = from.split('?')[0], back = path.endsWith('/jaarplanning') ? `${path}?focus=${encodeURIComponent(before.id)}` : from;
  const undo = plannedUndo(S, { rowId: before.id, before, created, oid: o.id, kind: 'copy' }, 'Programma weggehaald. Het onderwerp blijft staan.', () => {
    if (window.location.pathname.endsWith(to)) nav(back, { replace: true });
  });
  // pas na het opslaan en nadat een venster dicht is: dan hoort Ctrl+Z bij de pagina
  setTimeout(() => {
    const L0 = S.latest(), made = L0.getO(o.id), row = L0.plans.find(p => p.opkId === o.id); if (!made || !row) return;
    const note = kampMismatchNote(made, row.date, row.endDate, row.type);
    toast(`Programma gemaakt voor ${fmtRange(row.date, row.endDate)}${note ? '. ' + note : ''}`, undoAction(undo), note ? 9000 : undefined);
  }, 0);
  return o;
}
