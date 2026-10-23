import { create } from 'zustand';
type Action = { label: string; fn: () => void };
/**
 * `scope`: het venster dat open stond toen de melding kwam (of null). Ctrl+Z werkt alleen in dat venster of zonder venster,
 * zodat een melding van de pagina niets terugzet terwijl je in een ander venster bezig bent.
 */
type S = { msg: string; action: Action | null; n: number; scope: Element | null; show: (msg: string, action?: Action, ms?: number) => void; hide: () => void; hold: (on: boolean) => void };
let timer: any, until = 0, left = 0, held = false;
export const useToast = create<S>((set, get) => {
  // ook de knop weghalen: een verdwenen melding mag niet meer aan te klikken zijn
  const gone = () => { until = 0; set({ msg: '', action: null, scope: null }); };
  const arm = (ms: number) => { clearTimeout(timer); if (held) { left = ms; until = 0; return; } until = Date.now() + ms; timer = setTimeout(gone, ms); };
  return {
    msg: '', action: null, n: 0, scope: null,
    show: (msg, action, ms) => { held = false; set(s => ({ msg, action: action || null, n: s.n + 1, scope: typeof document === 'undefined' ? null : document.querySelector('.modal') })); arm(ms || (action ? 7000 : 3600)); },
    hide: () => { clearTimeout(timer); held = false; gone(); },
    // muis erop of de knop heeft focus: de melding blijft staan; daarna nog even de tijd
    hold: on => {
      if (on === held) return; held = on;
      if (on) { if (until) { clearTimeout(timer); left = Math.max(0, until - Date.now()); until = 0; } }
      else if (get().msg) arm(Math.max(left, 2500));
    },
  };
});
/** Melding onderin; `ms` voor een langere tekst die meer leestijd nodig heeft. */
export const toast = (msg: string, action?: Action, ms?: number) => useToast.getState().show(msg, action, ms);
/** Alleen "Ongedaan maken" mag met Ctrl+Z (⌘Z): nooit uitloggen, weggooien of naar een andere pagina gaan. */
export const isUndo = (a: Action | null | undefined) => !!a && a.label === 'Ongedaan maken';
