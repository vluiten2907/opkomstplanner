import { create } from 'zustand';

export type ModalSpec =
  | { kind: 'date'; keyId: string }
  | { kind: 'extra' }
  | { kind: 'people'; keyId: string; field: 'planners' | 'absent' }
  | { kind: 'letter'; keyId: string }
  | { kind: 'link'; keyId: string }
  | { kind: 'toplan'; oid: string }
  | { kind: 'takeover'; oid: string; fresh: boolean };

type S = { modal: ModalSpec | null; open: (m: ModalSpec) => void; close: () => void };
export const useModal = create<S>(set => ({ modal: null, open: m => set({ modal: m }), close: () => set({ modal: null }) }));
export const openModal = (m: ModalSpec) => useModal.getState().open(m);
export const closeModal = () => useModal.getState().close();
