import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { isUndo, useToast } from '../store/toast';
import { pad2 } from '../lib/time';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

export function Toast() {
  const { msg, action, n, hide, hold } = useToast();
  const act = msg ? action : null, undo = isUndo(act) ? act : null;
  // muis erop of focus op de knop: de melding wacht (nieuwe melding: opnieuw beginnen)
  const on = useRef({ hover: false, focus: false });
  useEffect(() => { on.current = { hover: false, focus: false }; }, [n]);
  const set = (k: 'hover' | 'focus', v: boolean) => { on.current[k] = v; hold(on.current.hover || on.current.focus); };
  // Ctrl+Z (⌘Z) doet hetzelfde als "Ongedaan maken": met het toetsenbord hoef je niet eerst naar de melding onderin.
  // Niet in een tekstveld (daar zet de browser je tekst terug) en niet vanuit een ander venster dan waar de melding vandaan kwam.
  useEffect(() => {
    if (!undo) return;
    const h = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const m = document.querySelector('.modal'); if (m && m !== useToast.getState().scope) return;
      e.preventDefault(); hide(); undo.fn();
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [undo, hide]);
  return <div className={'toast' + (msg ? ' show' : '') + (act ? ' has-act' : '')} role="status" aria-live="polite"
    onMouseEnter={() => set('hover', true)} onMouseLeave={() => set('hover', false)} onFocus={() => set('focus', true)} onBlur={() => set('focus', false)}>
    <span>{msg}</span>{act && <button type="button" onClick={() => { hide(); act.fn(); }}
      title={undo ? (MAC ? 'Of ⌘Z' : 'Of Ctrl+Z') : undefined} aria-keyshortcuts={undo ? (MAC ? 'Meta+Z' : 'Control+Z') : undefined}>{act.label}</button>}
  </div>;
}

/** Eén gedeeld, onzichtbaar meldvak voor schermlezers, direct in body (zo maakt een open venster het nooit onbereikbaar). */
let liveBox: HTMLElement | null = null;
function liveRegion() {
  if (typeof document === 'undefined') return null;
  if (!liveBox || !liveBox.isConnected) {
    liveBox = document.createElement('div'); liveBox.className = 'sr-only'; liveBox.id = 'sr-live';
    liveBox.setAttribute('aria-live', 'polite'); document.body.appendChild(liveBox);
  }
  return liveBox;
}
/** Laat een schermlezer iets zeggen zonder iets te tonen (dezelfde tekst twee keer wordt ook twee keer gezegd). */
export function announce(text: string) {
  const el = liveRegion(); if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 60);
}
const focusVisible = (el: Element) => { try { return el.matches(':focus-visible'); } catch { return true; } };

/**
 * Klik twee keer om te bevestigen (geen alert/confirm in de browser).
 * Na de eerste klik blijft de vraag staan zolang de muis erop staat of de knop de focus heeft via het toetsenbord
 * (of een schermlezer); daarna nog 3 seconden. De vraag wordt ook voorgelezen.
 */
export function ConfirmBtn({ label, confirm, onConfirm, className = 'btn ghost', title, ariaLabel, role, tabIndex }: { label: ReactNode; confirm: string; onConfirm: () => void; className?: string; title?: string; ariaLabel?: string; role?: string; tabIndex?: number }) {
  const [armed, setArmed] = useState(false);
  const [hold, setHold] = useState({ hover: false, focus: false });
  const held = hold.hover || hold.focus;
  const set = (k: 'hover' | 'focus', v: boolean) => setHold(h => h[k] === v ? h : { ...h, [k]: v });
  useEffect(() => { liveRegion(); }, []);
  useEffect(() => { if (!armed || held) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed, held]);
  // aria-label alleen in rust (bijv. een knop met alleen een pictogram); gewapend is de zichtbare vraag de naam
  return <button type="button" className={className} role={role} tabIndex={tabIndex} data-armed={armed || undefined} title={title} aria-label={armed ? undefined : ariaLabel}
    onPointerEnter={e => { if (e.pointerType === 'mouse') set('hover', true); }} onPointerLeave={e => { if (e.pointerType === 'mouse') set('hover', false); }}
    onFocus={e => { if (focusVisible(e.currentTarget)) set('focus', true); }} onBlur={() => set('focus', false)}
    onClick={e => {
      // detail 0: met het toetsenbord of een schermlezer ingedrukt (dan blijft de vraag staan zolang de focus erop staat)
      if (e.detail === 0) set('focus', true);
      if (armed) { setArmed(false); onConfirm(); }
      else { setArmed(true); announce(/nogmaals/i.test(confirm) ? confirm : `${confirm} Nogmaals drukken om te bevestigen.`); }
    }}>{armed ? confirm : label}</button>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab en Shift+Tab blijven binnen `c` (venster of paneel). */
function trapTab(c: HTMLElement | null, e: ReactKeyboardEvent) {
  if (e.key !== 'Tab' || !c) return;
  const list = [...c.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.getClientRects().length > 0);
  const first = list[0], last = list[list.length - 1], at = document.activeElement;
  if (!first) { e.preventDefault(); c.focus(); return; }
  if (e.shiftKey && (at === first || at === c)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
}

/**
 * Maakt alles naast `el` (en naast elk van zijn ouders) onbereikbaar met `inert`, ook voor schermlezers.
 * De melding onderin (Ongedaan maken) en het donkere vlak achter een paneel blijven werken.
 * Geeft een functie terug die alleen terugzet wat hier is aangezet.
 */
function inertOutside(el: HTMLElement) {
  const done: HTMLElement[] = [];
  for (let n: HTMLElement = el; n.parentElement && n.parentElement !== document.body; n = n.parentElement) {
    for (const s of Array.from(n.parentElement.children)) {
      if (s === n || !(s instanceof HTMLElement) || s.inert || s.matches('.toast, .scrim, script, style')) continue;
      s.inert = true; done.push(s);
    }
  }
  return () => done.forEach(s => { s.inert = false; });
}

/** Klopt de media query (bijv. smal scherm)? Volgt draaien en vergroten. */
export function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return;
    const h = () => setOn(m.matches); h(); m.addEventListener('change', h); return () => m.removeEventListener('change', h);
  }, [q]);
  return on;
}

/** Escape sluit het open zijpaneel van een bank, tenzij er een venster open is of de toets al is afgehandeld. */
export function useEscapeClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal')) close(); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });
}

/**
 * Bewerkpaneel dat op een smal scherm (≤ 900 px, ook een laptop op 200%) als vel over de pagina ligt:
 * dan is het een venster. Focus erin, Tab blijft erin, de rest is onbereikbaar en na het sluiten gaat de focus terug.
 * Op een breed scherm is het een gewoon zijpaneel. `opener` zegt waar de focus heen moet als die niet op een knop stond.
 */
export function useSheetDialog(open: boolean, label: string, opener?: () => HTMLElement | null) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useMedia('(max-width: 900px)') && open;
  const op = useRef(opener); op.current = opener;
  useEffect(() => {
    const el = ref.current; if (!active || !el) return;
    const a = document.activeElement as HTMLElement | null;
    const back = a && a !== document.body && !el.contains(a) ? a : op.current?.() || null;
    const undo = inertOutside(el);
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      undo();
      const now = document.activeElement;
      if (back && back.isConnected && (!now || now === document.body || !now.isConnected || el.contains(now))) back.focus({ preventScroll: true });
    };
  }, [active]);
  const props = active ? { role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1, className: 'sheet-dlg', onKeyDown: (e: ReactKeyboardEvent) => trapTab(ref.current, e) } : {};
  return [ref, props] as const;
}

export function Modal({ title, sub, onClose, wide, children }: { title: string; sub?: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null);
  const id = useId();
  // wat de focus had vóór het venster (bij het renderen, dus vóór een autoFocus in het venster): daar gaat hij na het sluiten heen
  const [prev] = useState(() => document.activeElement as HTMLElement | null);
  // Esc sluit alleen het venster (preventDefault: een paneel eronder sluit dan niet mee)
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  useEffect(() => {
    // de rest van de app is zolang onbereikbaar (ook voor schermlezers); de melding onderin blijft werken
    const undo = root.current ? inertOutside(root.current) : () => {};
    // focus in het venster; op de kaart zelf, zodat op een telefoon niet meteen het toetsenbord opent (een veld met autoFocus houdt hem)
    const c = card.current;
    if (c && !c.contains(document.activeElement)) c.focus({ preventScroll: true });
    return () => { undo(); if (prev && prev !== document.body && prev.isConnected) prev.focus({ preventScroll: true }); };
  }, [prev]);
  return <div ref={root} className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={card} className={'modal-card' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={id + 't'} aria-describedby={sub ? id + 's' : undefined} tabIndex={-1} onKeyDown={e => trapTab(card.current, e)}>
      <div className="pad stack">
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div><h2 id={id + 't'}>{title}</h2>{sub && <p id={id + 's'} className="hint" style={{ marginTop: 4 }}>{sub}</p>}</div>
          <button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  </div>;
}

/** Tijdkiezer: uren en minuten (per 5) als losse menu's. Waarden in minuten vanaf middernacht; >1440 = na middernacht (+1). */
export function TimePicker({ value, onChange, from = 0, to = 1435, id, extra, disabled, label }: { value: number; onChange: (v: number) => void; from?: number; to?: number; id?: string; extra?: boolean; disabled?: boolean; label?: string }) {
  const vals: number[] = []; for (let m = from; m <= to; m += 5) vals.push(m);
  if (extra && !vals.includes(value)) vals.push(value);
  const hours = [...new Set(vals.map(x => Math.floor(x / 60)))].sort((a, b) => a - b);
  const h = Math.floor(value / 60), mins = vals.filter(x => Math.floor(x / 60) === h).map(x => x % 60);
  const pick = (hv: number, mv: number) => {
    const inHour = vals.filter(x => Math.floor(x / 60) === hv), want = hv * 60 + mv;
    if (!inHour.length) return;
    onChange(inHour.includes(want) ? want : inHour.reduce((a, x) => Math.abs(x - want) < Math.abs(a - want) ? x : a, inHour[0]));
  };
  // elk menu een eigen naam ("Begintijd uur"), zodat begin, eind en het onderdeel niet allemaal "Uur" heten
  return <span className="tpick" role="group" aria-label={label}>
    <select id={id} className="tp-h" aria-label={label ? label + ' uur' : 'Uur'} value={h} disabled={disabled} onChange={e => pick(+e.target.value, value % 60)}>{hours.map(x => <option key={x} value={x}>{pad2(x % 24)}{x >= 24 ? ' (+1)' : ''}</option>)}</select>
    <span className="tp-sep">:</span>
    <select className="tp-m" aria-label={label ? label + ' minuten' : 'Minuten'} value={value % 60} disabled={disabled} onChange={e => pick(h, +e.target.value)}>{mins.map(x => <option key={x} value={x}>{pad2(x)}</option>)}</select>
  </span>;
}

/**
 * Veld met label. Zonder `htmlFor` koppelt het label zich vanzelf aan het ene veld erin (input, select, textarea,
 * tijdkiezer, …); een groep knoppen (bijv. Soort) krijgt het label als naam van de groep.
 */
export function Field({ label, htmlFor, hint, children, className }: { label?: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const auto = useId();
  let body = children, forId = htmlFor, group = false;
  const kids = Children.toArray(children);
  if (label && !htmlFor && kids.length === 1 && isValidElement(kids[0])) {
    const el = kids[0] as ReactElement<{ id?: string; label?: string }>;
    if (typeof el.type === 'string' && !['input', 'select', 'textarea'].includes(el.type)) group = true;
    else {
      forId = el.props.id || auto + 'f';
      body = cloneElement(el, el.type === TimePicker ? { id: forId, label: el.props.label ?? label } : { id: forId });
    }
  }
  return <div className={'field' + (className ? ' ' + className : '')} role={group ? 'group' : undefined} aria-labelledby={group ? auto + 'l' : undefined}>
    {label && <label id={auto + 'l'} htmlFor={group ? undefined : forId}>{label}</label>}{body}{hint && <span className="hint">{hint}</span>}</div>;
}

export function Chip({ on, onClick, children, disabled, title, className = '' }: { on?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean; title?: string; className?: string }) {
  return <button type="button" className={'chip ' + className} aria-pressed={!!on} disabled={disabled} title={title} onClick={onClick}>{children}</button>;
}

export function Dot({ color, style }: { color: string; style?: React.CSSProperties }) { return <i className="dot" style={{ ['--c' as any]: color, ...style }} />; }

/**
 * Tekstveld dat pas na een korte pauze opslaat. `flush` schrijft direct weg (bij wegklikken);
 * bij het sluiten van het onderdeel (bijv. naar een andere pagina) gaat wat nog wacht ook mee.
 */
export function useDebouncedInput(value: string, onCommit: (v: string) => void, delay = 400) {
  const [v, setV] = useState(value);
  const last = useRef(value), cur = useRef(value), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // altijd de nieuwste onCommit gebruiken, niet die van de toetsaanslag waarmee de timer begon
  const commit = useRef(onCommit); commit.current = onCommit;
  useEffect(() => { if (value !== last.current) { last.current = value; cur.current = value; setV(value); } }, [value]);
  const flush = useCallback(() => { clearTimeout(timer.current); if (cur.current !== last.current) { last.current = cur.current; commit.current(cur.current); } }, []);
  const set = useCallback((x: string) => { cur.current = x; setV(x); clearTimeout(timer.current); timer.current = setTimeout(flush, delay); }, [flush, delay]);
  useEffect(() => {
    // tabblad sluiten of naar de achtergrond: niet op de pauze wachten (en waarschuwen als er nog iets wachtte)
    const before = (e: BeforeUnloadEvent) => { if (cur.current !== last.current) { flush(); e.preventDefault(); e.returnValue = ''; } };
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', before); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('beforeunload', before); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide); flush(); };
  }, [flush]);
  return [v, set, flush] as const;
}
