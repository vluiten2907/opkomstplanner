import { create } from 'zustand';
type Action = { label: string; fn: () => void };
type S = { msg: string; action: Action | null; n: number; show: (msg: string, action?: Action) => void; hide: () => void };
let timer: any;
export const useToast = create<S>((set) => ({
  msg: '', action: null, n: 0,
  show: (msg, action) => { clearTimeout(timer); set(s => ({ msg, action: action || null, n: s.n + 1 })); timer = setTimeout(() => set({ msg: '' }), action ? 7000 : 3600); },
  hide: () => set({ msg: '' }),
}));
export const toast = (msg: string, action?: Action) => useToast.getState().show(msg, action);
