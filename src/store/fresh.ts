import type { NavigateFunction } from 'react-router-dom';
import { toast, undoAction } from './toast';
import { fmtRange } from '../lib/time';
import type { useSpeltak } from './speltak';
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
/**
 * Programma maken voor een datum in de jaarplanning (Maken in de opkomstbouwer, Nieuwe opkomst of Weekendkamp in Koppelen,
 * Programma maken op het dashboard): een nieuwe opkomst met het onderwerp als titel, meteen gekoppeld, en open in de bouwer
 * met de details open (net als Nieuwe opkomst). De melding heeft Ongedaan maken: de opkomst weer weg en de rij zoals hij was
 * (het onderwerp blijft), maar alleen zolang hij nog gekoppeld is en niemand hem heeft aangepast. Daarna terug naar `from`,
 * de pagina waar je vandaan kwam (als je nog in de bouwer van die opkomst bent).
 */
export function makeForEntry(S: Speltak, key: string, kamp: boolean, nav: NavigateFunction, from: string) {
  const before = { ...S.entryFor(key) }, o = S.newForEntry({ ...before }, kamp), to = `/s/${S.sid}/bouwer/${o.id}`;
  markFresh(o.id); nav(to);
  // terug naar de jaarplanning: met die rij in beeld
  const path = from.split('?')[0], back = path.endsWith('/jaarplanning') ? `${path}?focus=${encodeURIComponent(before.id)}` : from;
  // pas na het opslaan (de nieuwste stand heeft dan het tijdstip van opslaan) en nadat een venster dicht is: dan hoort Ctrl+Z bij de pagina
  setTimeout(() => {
    const L0 = S.latest(), made = L0.getO(o.id), row = L0.plans.find(p => p.opkId === o.id); if (!made || !row) return;
    // elke aanpassing (in de bouwer, het onderwerp in de jaarplanning, leiding indelen) slaat de opkomst opnieuw op
    const stamp = made.updatedAt;
    toast(`Programma gemaakt voor ${fmtRange(row.date, row.endDate)}`, undoAction(() => {
      const L = S.latest(), cur = L.getO(o.id), r = L.plans.find(p => p.id === before.id);
      if (!cur || !r || r.opkId !== o.id || cur.state !== 'planned' || cur.updatedAt !== stamp) { toast('Kan niet meer terug: de opkomst of de datum is intussen veranderd.'); return; }
      L.savePlan({ ...r, opkId: null, type: before.type, date: before.date, endDate: before.endDate });
      L.deleteOpk(cur.id); toast('Programma weggehaald. Het onderwerp blijft staan.');
      if (window.location.pathname.endsWith(to)) nav(back, { replace: true });
    }));
  }, 0);
  return o;
}
