import { useEffect } from 'react';
import { create } from 'zustand';
import { toast } from './toast';

/** Onthoudt of er een bank-opkomst of -activiteit open staat met wijzigingen die nog niet zijn opgeslagen. */
export const useUnsaved = create<{ dirty: boolean }>(() => ({ dirty: false }));
export const setUnsaved = (dirty: boolean) => useUnsaved.setState({ dirty });

/** Voert `fn` uit, of vraagt eerst of de wijzigingen weg mogen. */
export function guardLeave(fn: () => void) {
  if (!useUnsaved.getState().dirty) { fn(); return; }
  toast('Je wijzigingen zijn nog niet opgeslagen. Sla op of annuleer eerst.', { label: 'Weggooien', fn: () => { setUnsaved(false); fn(); } });
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
