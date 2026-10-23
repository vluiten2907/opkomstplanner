/*
 * Vaste delen van de tijdlijn, gedeeld door de opkomstbouwer en "Leiding indelen".
 * Slepen, klikken en de namenkolom blijven in hun eigen scherm.
 */
import { useLayoutEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { fmtT } from '../lib/time';
import { isKamp, type Block, type Opk } from '../lib/model';

/** Focus naar het eerste element dat er is (na het renderen); bijv. een onderdeel in de tijdlijn of de knop + Onderdeel. */
export const focusSoon = (...sels: string[]) => setTimeout(() => {
  for (const q of sels) { const el = q ? document.querySelector<HTMLElement>(q) : null; if (el) { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest' }); return; } }
}, 0);

/**
 * Onderdelen op volgorde van tijd (zo leest een schermlezer en loopt Tab), daarbinnen links naar rechts.
 * De plaats in beeld komt uit blkGeom, dus het beeld verandert niet.
 */
export function byTime(blocks: Block[], pos: Record<string, { lane: number }>) {
  return [...blocks].sort((a, b) => a.start - b.start || (pos[a.id]?.lane ?? 0) - (pos[b.id]?.lane ?? 0));
}

/**
 * Schuift een onderdeel met de focus naar een andere plek in de volgorde (slepen, andere begintijd), dan verplaatst React
 * het in de pagina en raakt de browser de focus kwijt. Zet die dan terug op hetzelfde element.
 */
export function useKeepFocus(box: RefObject<HTMLElement | null>) {
  // vóór het bijwerken van de pagina: wat had de focus (binnen de tijdlijn)?
  const a = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
  const had = a && box.current && box.current.contains(a) ? a : null;
  useLayoutEffect(() => {
    const now = document.activeElement;
    if (had && had.isConnected && now !== had && (!now || now === document.body)) had.focus({ preventScroll: true });
  });
}

/** Tijden naast de tijdlijn: elk kwartier (lange dagen: elk halfuur), plus begin en eind. */
export function Ticks({ T0, T1, row }: { T0: number; T1: number; row: number }) {
  const long = T1 - T0 > 480, out: ReactNode[] = [];
  for (let m = T0; m <= T1; m += 5) {
    if (m % (long ? 30 : 15) !== 0 && m !== T0 && m !== T1) continue;
    out.push(<span key={m} className={'tick' + (m % 60 === 0 ? ' hour' : '')} style={{ top: (m - T0) / 5 * row }}>{fmtT(m)}</span>);
  }
  return <div className="ticks" style={{ height: (T1 - T0) / 5 * row }}>{out}</div>;
}

/** Hoogte, rijhoogte en kwartierbanden van de baan met onderdelen. */
export function lanesStyle(T0: number, T1: number, row: number): CSSProperties {
  const off = ((T0 % 15) / 5) * row;
  return { height: (T1 - T0) / 5 * row, ['--row' as any]: row + 'px', backgroundPosition: `0 ${off ? -off : 0}px` };
}

/** Voorbereiding en nabespreking van de leiding (alleen bij een gewone opkomst; de tijdlijn begint bij de voorbereiding). */
export function PrepZones({ o, T0, row }: { o: Opk; T0: number; row: number }) {
  if (isKamp(o)) return null;
  return <>
    {o.prep ? <div className="zone" style={{ top: 0, height: o.prep / 5 * row }}><span>Voorbereiding leiding · {o.prep} min</span></div> : null}
    {o.post ? <div className="zone" style={{ top: (o.end - T0) / 5 * row, height: o.post / 5 * row }}><span>Nabespreking leiding · {o.post} min</span></div> : null}
  </>;
}

/** Plaats en basis-classes van een onderdeel; onderdelen die tegelijk zijn staan naast elkaar (zie lanesLayout). */
export function blkGeom(p: { lane: number; n: number }, b: Block, T0: number, row: number, sel: boolean) {
  const top = (b.start - T0) / 5 * row, h = b.dur / 5 * row - 3;
  return {
    cls: ['blk', h < 46 ? 'short' : '', h < 24 ? 'tiny' : '', h < 92 ? 'mid' : '', sel ? 'sel' : '', p.n > 1 ? 'overlap' : ''],
    style: { top: top + 1.5, height: h, left: `calc(${p.lane / p.n * 100}% + 4px)`, width: `calc(${100 / p.n}% - 8px)` },
  };
}

/**
 * Naam van een onderdeel voor schermlezers: titel, tijd, leiding (met namen) en locatie,
 * bijv. "Pietendiploma halen, 14:05 tot 14:50, 0 van 1 leiding, nog niemand, Grasveld". `nn`: zonder namen (opkomstenbank).
 */
export function blkLabel(b: Block, nn = false) {
  const who = b.names.length ? b.names.join(', ') : 'nog niemand';
  const lead = nn ? (b.minLeaders ? `minimaal ${b.minLeaders} leiding` : '') : b.minLeaders ? `${b.names.length} van ${b.minLeaders} leiding, ${who}` : who;
  return [b.title || 'Naamloos onderdeel', `${fmtT(b.start)} tot ${fmtT(b.start + b.dur)}`, lead, b.location.trim()].filter(Boolean).join(', ');
}
