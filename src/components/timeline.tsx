/*
 * Vaste delen van de tijdlijn, gedeeld door de opkomstbouwer en "Leiding indelen".
 * Slepen, klikken en de namenkolom blijven in hun eigen scherm.
 */
import type { CSSProperties, ReactNode } from 'react';
import { fmtT } from '../lib/time';
import { isKamp, type Block, type Opk } from '../lib/model';

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
