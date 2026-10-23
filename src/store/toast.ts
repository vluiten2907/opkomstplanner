import { create } from 'zustand';
type Action = { label: string; fn: () => void };
type S = { msg: string; action: Action | null; n: number; show: (msg: string, action?: Action, ms?: number) => void; hide: () => void };
let timer: any;
export const useToast = create<S>((set) => ({
  msg: '', action: null, n: 0,
  show: (msg, action, ms) => { clearTimeout(timer); set(s => ({ msg, action: action || null, n: s.n + 1 })); timer = setTimeout(() => set({ msg: '', action: null }), ms || (action ? 7000 : 3600)); },
  // ook de knop weghalen: een verdwenen melding mag niet meer aan te klikken zijn
  hide: () => { clearTimeout(timer); set({ msg: '', action: null }); },
}));
/** Melding onderin; `ms` voor een langere tekst die meer leestijd nodig heeft. */
export const toast = (msg: string, action?: Action, ms?: number) => useToast.getState().show(msg, action, ms);
