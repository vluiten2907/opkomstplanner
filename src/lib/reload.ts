import { settleAll } from '../store/saving';

/**
 * Na een update van de site bestaan de oude stukjes code (assets/…js) niet meer. Een tabblad dat nog openstond,
 * kan een pagina dan niet laden; één keer opnieuw laden haalt de nieuwe versie op.
 * Hooguit eens per minuut: een pagina die echt niet te laden is, blijft zo niet eindeloos herladen,
 * en een volgende update later in hetzelfde tabblad herlaadt gewoon weer. Zonder verbinding niet herladen.
 */
const KEY = 'opk.herladen', GAP = 60_000;
/** Zo lang wachten we hooguit tot wijzigingen die nog wachten of onderweg zijn, zijn opgeslagen. */
export const SETTLE_MS = 3000;
let busy = false;

/** Fout van een pagina die niet geladen kon worden (Chrome, Firefox, Safari, Vite). */
export function isLoadError(e: unknown) {
  const m = String((e as { message?: unknown } | null)?.message ?? e);
  return /dynamically imported module|Importing a module script failed|Unable to preload|module script/i.test(m);
}

/** Is de pagina al aan het herladen (dan geen foutmelding tonen)? */
export const isReloading = () => busy;

/** Herlaadt de pagina als dat in de laatste minuut nog niet gebeurde. Geeft true als hij herlaadt. */
export function reloadForUpdate(): boolean {
  if (busy) return true;
  if (!navigator.onLine) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - last < GAP) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  busy = true;
  // Eerst wegschrijven wat nog wacht of onderweg is (hooguit 3 s), anders vraagt de browser midden in "Nieuwe versie laden…"
  // of je wijzigingen kwijt mag. De browser kan het herladen dan nog tegenhouden: na even toch de melding (ErrorBoundary).
  settleAll(SETTLE_MS).finally(() => {
    setTimeout(() => { busy = false; }, 4000);
    window.location.reload();
  });
  return true;
}
