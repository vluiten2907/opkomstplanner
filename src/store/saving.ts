import { create } from 'zustand';
import { toast } from './toast';

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

/** Wacht tot ook de wijzigingen die nog op de korte vertraging wachten zijn verstuurd en bevestigd, hooguit `ms` in totaal. */
async function settleAll(ms = 3000) {
  const end = Date.now() + ms;
  while (queued.size && Date.now() < end) await new Promise(r => setTimeout(r, 100));
  await settle(Math.max(0, end - Date.now()));
}

/**
 * Uitloggen zonder werk kwijt te raken: eerst alles wegschrijven (`flush`, bijv. de speltak) en even wachten op de server.
 * Staat er dan nog iets open (geen verbinding), dan niet zomaar uitloggen maar een melding met "Toch uitloggen".
 */
export async function safeLogout(logout: () => Promise<unknown>, done?: () => void, flush?: () => unknown) {
  flush?.(); // alleen versturen; het wachten (hooguit 3 s) doet settleAll
  await settleAll();
  const out = () => logout().then(() => done?.());
  if (hasUnsaved()) { toast('Nog niet alles is opgeslagen. Wacht tot je weer verbinding hebt.', { label: 'Toch uitloggen', fn: () => { out(); } }); return; }
  await out();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSaving.setState({ online: true }));
  window.addEventListener('offline', () => useSaving.setState({ online: false }));
  // Tabblad sluiten of herladen terwijl er nog iets wacht of onderweg is: de browser vraagt of je echt weg wilt.
  // Hier en niet in de speltak, zodat het ook werkt nadat je de speltak hebt verlaten (Mijn speltakken, Beheer, Account).
  window.addEventListener('beforeunload', ev => { if (hasUnsaved()) { ev.preventDefault(); ev.returnValue = ''; } });
}
