import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../store/toast';
import { fmtT, pad2 } from '../lib/time';

export function Toast() {
  const { msg, action, hide } = useToast();
  return <div className={'toast' + (msg ? ' show' : '') + (action ? ' has-act' : '')} role="status" aria-live="polite">
    <span>{msg}</span>{action && <button type="button" onClick={() => { hide(); action.fn(); }}>{action.label}</button>}
  </div>;
}

/** Klik twee keer om te bevestigen (geen alert/confirm in de browser). */
export function ConfirmBtn({ label, confirm, onConfirm, className = 'btn ghost', title }: { label: ReactNode; confirm: string; onConfirm: () => void; className?: string; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={className} data-armed={armed || undefined} title={title} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>{armed ? confirm : label}</button>;
}

export function Modal({ title, sub, onClose, wide, children }: { title: string; sub?: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);
  return <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={'modal-card' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
      <div className="pad stack">
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div><h2>{title}</h2>{sub && <p className="hint" style={{ marginTop: 4 }}>{sub}</p>}</div>
          <button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  </div>;
}

/** Tijdkiezer: uren en minuten (per 5) als losse menu's. Waarden in minuten vanaf middernacht; >1440 = na middernacht (+1). */
export function TimePicker({ value, onChange, from = 0, to = 1435, id, extra }: { value: number; onChange: (v: number) => void; from?: number; to?: number; id?: string; extra?: boolean }) {
  const vals: number[] = []; for (let m = from; m <= to; m += 5) vals.push(m);
  if (extra && !vals.includes(value)) vals.push(value);
  const hours = [...new Set(vals.map(x => Math.floor(x / 60)))].sort((a, b) => a - b);
  const h = Math.floor(value / 60), mins = vals.filter(x => Math.floor(x / 60) === h).map(x => x % 60);
  const pick = (hv: number, mv: number) => {
    const inHour = vals.filter(x => Math.floor(x / 60) === hv), want = hv * 60 + mv;
    if (!inHour.length) return;
    onChange(inHour.includes(want) ? want : inHour.reduce((a, x) => Math.abs(x - want) < Math.abs(a - want) ? x : a, inHour[0]));
  };
  return <span className="tpick">
    <select id={id} className="tp-h" aria-label="Uur" value={h} onChange={e => pick(+e.target.value, value % 60)}>{hours.map(x => <option key={x} value={x}>{pad2(x % 24)}{x >= 24 ? ' (+1)' : ''}</option>)}</select>
    <span className="tp-sep">:</span>
    <select className="tp-m" aria-label="Minuten" value={value % 60} onChange={e => pick(h, +e.target.value)}>{mins.map(x => <option key={x} value={x}>{pad2(x)}</option>)}</select>
  </span>;
}

export function Field({ label, htmlFor, hint, children, className }: { label?: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={'field' + (className ? ' ' + className : '')}>{label && <label htmlFor={htmlFor}>{label}</label>}{children}{hint && <span className="hint">{hint}</span>}</div>;
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
export const timeLabel = (v: number) => fmtT(v);
