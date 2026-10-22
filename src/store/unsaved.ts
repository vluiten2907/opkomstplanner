import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { create } from 'zustand';
import { toast, useToast } from './toast';

/** Onthoudt of er een bank-opkomst of -activiteit open staat met wijzigingen die nog niet zijn opgeslagen. */
export const useUnsaved = create<{ dirty: boolean }>(() => ({ dirty: false }));
export const setUnsaved = (dirty: boolean) => useUnsaved.setState({ dirty });

const ASK = 'Je wijzigingen zijn nog niet opgeslagen. Sla op of annuleer eerst.';

/** Voert `fn` uit, of vraagt eerst of de wijzigingen weg mogen. */
export function guardLeave(fn: () => void) {
  if (!useUnsaved.getState().dirty) { fn(); return; }
  toast(ASK, { label: 'Weggooien', fn: () => { setUnsaved(false); fn(); } });
}

/** Zet de vlag zolang dit onderdeel open is (en waarschuwt bij het sluiten van het tabblad). */
export function useDirty(dirty: boolean) {
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
    const go = () => { open = false; setUnsaved(false); try { if (ref.current.state === 'blocked') ref.current.proceed(); } catch { /* al door een andere navigatie vervangen */ } };
    toast(ASK, { label: 'Weggooien', fn: go });
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
