import { useState, type ReactNode } from 'react';
import { useSpeltak } from '../store/speltak';
import { allBlocks, analyze, catOf, isKamp, minNeed, opkCatOf, type Cat, type Opk, type Day } from '../lib/model';
import { fmtDur, fmtT, plural } from '../lib/time';
import { makePdf } from '../lib/export';

/** Pdf maken van een opkomst met de huidige instellingen en aanwezige leiding. */
export function usePdf() {
  const { settings, entryOfOpk, presentFor, practice } = useSpeltak();
  return (o: Opk | undefined | null) => { if (!o) return; makePdf(o, settings, o.state === 'planned' ? entryOfOpk(o) : null, presentFor(o), practice); };
}

export const PageTitle = ({ title, sub, kicker, children }: { title: React.ReactNode; sub?: React.ReactNode; kicker?: React.ReactNode; children?: React.ReactNode }) =>
  <div className="row between" style={{ alignItems: 'flex-end' }}>
    <div>{kicker && <p className="kicker">{kicker}</p>}<h1 className="display text-5xl md:text-7xl font-black tracking-tighter">{title}</h1>{sub && <p className="subline">{sub}</p>}</div>
    {children && <div className="row">{children}</div>}
  </div>;

/** Gekleurde balk met de verdeling van onderdelen over de tijd. `cats`: categorieën van een andere speltak (groepsbank). */
export function Strip({ o, cats }: { o: Opk | Day; cats?: Cat[] }) {
  const { settings } = useSpeltak();
  if ('kind' in o && isKamp(o)) return <div className="kstrip">{o.days.map(d => <div key={d.id} style={{ flex: Math.max(5, d.end - d.start) }} title={d.label}><Strip o={d} cats={cats} /></div>)}</div>;
  const segs: React.ReactNode[] = [];
  let t = o.start;
  [...o.blocks].sort((a, b) => a.start - b.start).forEach(b => {
    const s = Math.max(b.start, o.start), e = Math.min(b.start + b.dur, o.end); if (e <= s) return;
    if (s > t) segs.push(<span key={'g' + t} className="gap" style={{ flex: s - t }} />);
    if (e > t) segs.push(<span key={b.id} style={{ ['--c' as any]: (cats?.find(c => c.id === b.cat) || catOf(settings, b.cat)).color, flex: e - Math.max(s, t) }} title={b.title} />);
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

export function CatTags({ o, cats }: { o: Opk; cats?: Cat[] }) {
  const { settings } = useSpeltak();
  const list = (o.cats || []).map(c => cats?.find(x => x.id === c) || opkCatOf(settings, c)).filter(Boolean) as { id: string; label: string; color: string }[];
  if (!list.length) return null;
  return <span className="ocats">{list.map(c => <span key={c.id} className="ocat" style={{ ['--c' as any]: c.color }}>{c.label}</span>)}</span>;
}

export const PeopleChips = ({ list, abs }: { list: string[]; abs?: boolean }) => <>{list.map(n => <span key={n} className={'pchip' + (abs ? ' abs' : '')}>{n}</span>)}</>;

export function OpkMeta({ o }: { o: Opk }) {
  const n = minNeed(o);
  return <span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}{n ? ' · min. ' + n + ' leiding' : ''}{o.short ? ' · ' + o.short : ''}</span>;
}

export function PickOpk({ o, label, onPick, primary = true, extra }: { o: Opk; label: string; onPick: () => void; primary?: boolean; extra?: ReactNode }) {
  const btn = <button className={'btn sm' + (primary ? ' primary' : '')} onClick={onPick}>{label}</button>;
  return <div className="pick"><div className="info"><b>{o.title || 'Naamloze opkomst'}</b><OpkMeta o={o} /><CatTags o={o} /><Strip o={o} /></div>
    {extra ? <div className="row">{btn}{extra}</div> : btn}</div>;
}

/** Onderbalk bij het bewerken van iets uit een bank: Annuleren / Opslaan / Opslaan als kopie (met nieuwe naam). */
export function SaveBar({ dirty, isNew, title, taken, suggest, onCancel, onSave, onCopy, sticky }: {
  dirty: boolean; isNew?: boolean; title: string; taken: (name: string, copy: boolean) => boolean; suggest: string;
  onCancel: () => void; onSave: () => void; onCopy: (name: string) => void; sticky?: boolean;
}) {
  const [copying, setCopying] = useState(false);
  const [name, setName] = useState('');
  const why = (n: string, copy = false) => !n.trim() ? 'Geef een titel op.' : taken(n, copy) ? 'Deze naam bestaat al in de bank. Kies een andere naam.' : '';
  const saveErr = dirty || isNew ? why(title) : '';
  const copyErr = why(name, true);
  return <div className={'savebar' + (sticky ? ' sticky' : '') + (dirty || isNew ? ' on' : '')} role="group" aria-label="Opslaan">
    {copying ? <>
      <label htmlFor="sb-name" className="lbl">Naam van de kopie</label>
      <input id="sb-name" className="inp" value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !copyErr) { setCopying(false); onCopy(name.trim()); } if (e.key === 'Escape') setCopying(false); }} />
      {copyErr && <span className="sb-err">{copyErr}</span>}
      <div className="row"><button className="btn ghost" onClick={() => setCopying(false)}>Terug</button><button className="btn primary" disabled={!!copyErr} onClick={() => { setCopying(false); onCopy(name.trim()); }}>Kopie opslaan</button></div>
    </> : <>
      {(dirty || isNew) ? (saveErr ? <span className="sb-err">{saveErr}</span> : <span className="sb-msg">{isNew ? 'Nog niet in de bank.' : 'Niet opgeslagen wijzigingen.'}</span>) : null}
      <div className="row">
        <button className="btn ghost" disabled={!dirty && !isNew} onClick={onCancel}>Annuleren</button>
        <button className="btn primary" disabled={(!dirty && !isNew) || !!saveErr} onClick={onSave}>Opslaan</button>
        {!isNew && <button className="btn" onClick={() => { setName(suggest); setCopying(true); }}>Opslaan als kopie</button>}
      </div>
    </>}
  </div>;
}
