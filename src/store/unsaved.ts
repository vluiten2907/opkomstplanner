import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { create } from 'zustand';
import { toast, useToast } from './toast';

/**
 * Onthoudt of er een bank-opkomst of -activiteit open staat met wijzigingen die nog niet zijn opgeslagen,
 * en hoe die bewerking ze weggooit (`discard`, bijv. Annuleren van de onderbalk).
 */
export const useUnsaved = create<{ dirty: boolean; discard: (() => void) | null }>(() => ({ dirty: false, discard: null }));
export const setUnsaved = (dirty: boolean) => useUnsaved.setState({ dirty });

const ASK = 'Je wijzigingen zijn nog niet opgeslagen. Sla op of annuleer eerst.';

/** Weggooien: de bewerking zet zijn kladversie terug (blijft hij open staan, dan klopt hij weer), daarna is er niets meer te bewaren. */
function discardAll() {
  const d = useUnsaved.getState().discard;
  try { d?.(); } finally { setUnsaved(false); }
}

/**
 * Breed scherm: het zijpaneel van een bank plakt pas onder de kopbalk als je wat naar beneden scrolt; bovenaan de pagina staat het lager
 * en valt de opslaan-balk onder de rand van het scherm. Dan de pagina schuiven tot het paneel op zijn plakplek staat (zoals editorInView in de bouwer).
 */
export function sideInView() {
  setTimeout(() => {
    if (window.matchMedia?.('(max-width: 900px)').matches) return;
    const el = document.querySelector<HTMLElement>('.bank > aside.side'); if (!el || !el.querySelector('.savebar')) return;
    const r = el.getBoundingClientRect(), stick = parseFloat(getComputedStyle(el).top) || 80;
    if (r.bottom <= window.innerHeight || r.top <= stick + 1) return;
    window.scrollBy({ top: r.top - stick, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, 30);
}

/** Voert `fn` uit, of vraagt eerst of de wijzigingen weg mogen (met Opslaan in beeld: de melding zegt "Sla op"). */
export function guardLeave(fn: () => void) {
  if (!useUnsaved.getState().dirty) { fn(); return; }
  toast(ASK, { label: 'Weggooien', fn: () => { discardAll(); fn(); } });
  sideInView();
}

/**
 * Zet de vlag zolang dit onderdeel open is (en waarschuwt bij het sluiten van het tabblad).
 * `onDiscard` zet de wijzigingen terug als iemand in de melding op Weggooien klikt.
 */
export function useDirty(dirty: boolean, onDiscard?: () => void) {
  const ref = useRef(onDiscard); ref.current = onDiscard;
  useEffect(() => {
    const mine = () => ref.current?.();
    useUnsaved.setState({ discard: mine });
    return () => { if (useUnsaved.getState().discard === mine) useUnsaved.setState({ discard: null }); };
  }, []);
  useEffect(() => { setUnsaved(dirty); }, [dirty]);
  useEffect(() => () => setUnsaved(false), []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

/**
 * Terugknop, veeg-terug en links buiten het menu: met niet-opgeslagen wijzigingen eerst vragen.
 * Eén keer in de app. Zolang de melding staat, wacht de navigatie; Weggooien laat hem alsnog doorgaan.
 */
export function LeaveGuard() {
  const blocker = useBlocker(({ currentLocation: a, nextLocation: b }) => useUnsaved.getState().dirty && a.pathname !== b.pathname);
  const ref = useRef(blocker); ref.current = blocker;
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let open = true;
    const go = () => { open = false; discardAll(); try { if (ref.current.state === 'blocked') ref.current.proceed(); } catch { /* al door een andere navigatie vervangen */ } };
    toast(ASK, { label: 'Weggooien', fn: go }); sideInView();
    const n = useToast.getState().n;
    // melding verlopen of vervangen: niet weggaan (na de klik op Weggooien, die direct volgt, niets doen)
    const unsub = useToast.subscribe(s => {
      if (!open || (s.n === n && s.msg)) return;
      setTimeout(() => { if (open) { open = false; ref.current.reset?.(); } }, 0);
    });
    return () => { unsub(); };
  }, [blocker.state]);
  return null;
}
