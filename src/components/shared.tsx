import { useSpeltak } from '../store/speltak';
import { allBlocks, analyze, catOf, isKamp, minNeed, opkCatOf, type Opk, type Day } from '../lib/model';
import { fmtDur, fmtT, plural } from '../lib/time';
import { makePdf } from '../lib/export';

/** Pdf maken van een opkomst met de huidige instellingen en aanwezige leiding. */
export function usePdf() {
  const { settings, entryOfOpk, presentFor } = useSpeltak();
  return (o: Opk | undefined | null) => { if (!o) return; makePdf(o, settings, o.state === 'planned' ? entryOfOpk(o) : null, presentFor(o)); };
}

export const PageTitle = ({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) =>
  <div className="row between" style={{ alignItems: 'flex-end' }}>
    <div><h1 className="display text-5xl md:text-7xl font-black tracking-tighter">{title}</h1>{sub && <p className="subline">{sub}</p>}</div>
    {children && <div className="row">{children}</div>}
  </div>;

/** Gekleurde balk met de verdeling van onderdelen over de tijd. */
export function Strip({ o }: { o: Opk | Day }) {
  const { settings } = useSpeltak();
  if ('kind' in o && isKamp(o)) return <div className="kstrip">{o.days.map(d => <div key={d.id} style={{ flex: Math.max(5, d.end - d.start) }} title={d.label}><Strip o={d} /></div>)}</div>;
  const segs: React.ReactNode[] = [];
  let t = o.start;
  [...o.blocks].sort((a, b) => a.start - b.start).forEach(b => {
    const s = Math.max(b.start, o.start), e = Math.min(b.start + b.dur, o.end); if (e <= s) return;
    if (s > t) segs.push(<span key={'g' + t} className="gap" style={{ flex: s - t }} />);
    if (e > t) segs.push(<span key={b.id} style={{ ['--c' as any]: catOf(settings, b.cat).color, flex: e - Math.max(s, t) }} title={b.title} />);
    t = Math.max(t, e);
  });
  if (t < o.end) segs.push(<span key="end" className="gap" style={{ flex: o.end - t }} />);
  return <div className="strip" aria-hidden="true">{segs}</div>;
}

export function StatusPill({ o }: { o: Opk }) {
  const { leaders, presentFor } = useSpeltak();
  const a = analyze(o, presentFor(o), leaders);
  if (!allBlocks(o).length) return <span className="pill neutral">Nog leeg</span>;
  if (a.warn) return <span className="pill warn">{plural(a.warn, 'aandachtspunt', 'aandachtspunten')}</span>;
  if (a.free) return <span className="pill neutral">{fmtDur(a.free)} vrij</span>;
  return <span className="pill good">Klaar</span>;
}

export function CatTags({ o }: { o: Opk }) {
  const { settings } = useSpeltak();
  const list = (o.cats || []).map(c => opkCatOf(settings, c)).filter(Boolean) as { id: string; label: string; color: string }[];
  if (!list.length) return null;
  return <span className="ocats">{list.map(c => <span key={c.id} className="ocat" style={{ ['--c' as any]: c.color }}>{c.label}</span>)}</span>;
}

export const PeopleChips = ({ list, abs }: { list: string[]; abs?: boolean }) => <>{list.map(n => <span key={n} className={'pchip' + (abs ? ' abs' : '')}>{n}</span>)}</>;

export function OpkMeta({ o }: { o: Opk }) {
  const n = minNeed(o);
  return <span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}{n ? ' · min. ' + n + ' leiding' : ''}{o.short ? ' · ' + o.short : ''}</span>;
}

export function PickOpk({ o, label, onPick, primary = true }: { o: Opk; label: string; onPick: () => void; primary?: boolean }) {
  return <div className="pick"><div className="info"><b>{o.title || 'Naamloze opkomst'}</b><OpkMeta o={o} /><CatTags o={o} /><Strip o={o} /></div>
    <button className={'btn sm' + (primary ? ' primary' : '')} onClick={onPick}>{label}</button></div>;
}
