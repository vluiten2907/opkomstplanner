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
