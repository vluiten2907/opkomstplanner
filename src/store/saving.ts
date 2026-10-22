import { create } from 'zustand';

/**
 * Opslagstatus voor de kopbalk: wat nog wacht (de korte vertraging), wat onderweg is
 * (Firestore bevestigt pas als de server het heeft) en of er verbinding is.
 */
type S = { queued: number; busy: number; last: 'ok' | 'fail' | null; online: boolean };
export const useSaving = create<S>(() => ({ queued: 0, busy: 0, last: null, online: typeof navigator === 'undefined' || navigator.onLine !== false }));

const queued = new Set<string>();
const inflight = new Set<Promise<unknown>>();
const sync = () => useSaving.setState({ queued: queued.size, busy: inflight.size });

/** Een wijziging wacht op de korte vertraging voordat hij wordt verstuurd. */
export const markQueued = (key: string, on: boolean) => { if (on) queued.add(key); else queued.delete(key); sync(); };

/** Houdt een schrijfactie bij tot de server hem bevestigt (of weigert). */
export function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p); sync();
  const end = (ok: boolean) => { inflight.delete(p); useSaving.setState({ last: ok ? 'ok' : 'fail' }); sync(); };
  p.then(() => end(true), () => end(false));
  return p;
}

/** Staat er nog iets dat niet (bevestigd) is opgeslagen? */
export const hasUnsaved = () => queued.size + inflight.size > 0;

/** Wacht tot alles is opgeslagen, maar niet langer dan `ms`: offline lukt dat niet. */
export const settle = (ms = 3000) => new Promise<void>(res => {
  const t = setTimeout(res, ms);
  Promise.allSettled([...inflight]).then(() => { clearTimeout(t); res(); });
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSaving.setState({ online: true }));
  window.addEventListener('offline', () => useSaving.setState({ online: false }));
}
