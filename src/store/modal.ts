import { create } from 'zustand';

export type ModalSpec =
  | { kind: 'date'; keyId: string }
  | { kind: 'extra' }
  | { kind: 'people'; keyId: string; field: 'planners' | 'absent' }
  | { kind: 'letter'; keyId: string }
  // q: zoekterm om mee te beginnen, back: de groepsopkomst waar je vandaan kwam (terug uit Andere naam kiezen: de focus op zijn Kiezen)
  | { kind: 'link'; keyId: string; q?: string; back?: string }
  | { kind: 'toplan'; oid: string }
  | { kind: 'takeover'; oid: string; fresh: boolean }
  | NameSpec;

/**
 * Om een (unieke) naam vragen, bijv. bij in de bank zetten. `back`: Annuleren, Esc, de X of naast het venster klikken
 * gaat terug naar het venster waar je vandaan kwam (bijv. Koppelen) in plaats van alles te sluiten.
 */
export type NameSpec = { kind: 'name'; title: string; sub?: string; label: string; initial: string; okLabel: string; taken: (name: string) => boolean; ok: (name: string) => void; back?: () => void };

/** `seq` telt elk geopend venster (een fout in het ene venster blokkeert het volgende niet). */
type S = { modal: ModalSpec | null; seq: number; open: (m: ModalSpec) => void; close: () => void };
export const useModal = create<S>(set => ({ modal: null, seq: 0, open: m => set(s => ({ modal: m, seq: s.seq + 1 })), close: () => set({ modal: null }) }));
export const openModal = (m: ModalSpec) => useModal.getState().open(m);

/** Gebruik `title` als die vrij is; anders vragen om een andere naam. */
export function withFreeName(title: string, spec: Omit<NameSpec, 'kind' | 'initial'> & { suggest: string }) {
  if (title.trim() && !spec.taken(title)) { spec.ok(title.trim()); return; }
  const { suggest, ...rest } = spec;
  openModal({ kind: 'name', initial: suggest, ...rest });
}
