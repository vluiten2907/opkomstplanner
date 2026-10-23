import { useId, useRef, useState, type ReactNode } from 'react';
import { useSpeltak } from '../store/speltak';
import { withFreeName } from '../store/modal';
import type { Gedeeld } from '../store/groepsbank';
import { progBlocks, analyze, catOf, freeName, isKamp, minNeed, nameTaken, opkCatOf, progEmpty, type Cat, type Opk, type Day } from '../lib/model';
import { fmtDur, fmtT, plural } from '../lib/time';
import { makePdf } from '../lib/export';
import { Trash2 } from 'lucide-react';
import { ConfirmBtn } from './ui';

/** Pdf maken van een opkomst met de huidige instellingen en aanwezige leiding. */
export function usePdf() {
  const { settings, entryOfOpk, presentFor, practice } = useSpeltak();
  return (o: Opk | undefined | null) => { if (!o) return; makePdf(o, settings, o.state === 'planned' ? entryOfOpk(o) : null, presentFor(o), practice); };
}

type Speltak = ReturnType<typeof useSpeltak>;

/** Zin voor de melding als categorieën uit de groep bij jullie nog niet bestaan (zonder recht Instellingen vallen ze weg); anders ''. */
export const droppedNote = (dropped: string[]) => !dropped.length ? '' : (dropped.length === 1 ? `Categorie ${dropped[0]} bestaat` : `${dropped.length} categorieën (${dropped.join(', ')}) bestaan`)
  + ' bij jullie nog niet; die onderdelen staan zonder categorie.';

/**
 * Gedeelde opkomst uit de groep als kopie in de eigen opkomstenbank zetten: met de eigen titel als die vrij is, anders eerst om een andere naam vragen.
 * Kopieert met de nieuwste stand (`latest`), want het venster voor een andere naam kan ertussen hebben gestaan.
 * `then` krijgt de kopie, de zin over weggevallen categorieën (droppedNote, of '') en die nieuwste stand.
 */
export function copySharedToBank(g: Gedeeld, bank: Opk[], okLabel: string, latest: () => Speltak, then: (copy: Opk, note: string, L: Speltak) => void) {
  withFreeName(g.opk.title, {
    title: 'Andere naam kiezen', sub: `"${g.opk.title || 'Naamloos'}" staat al in jullie opkomstenbank. Geef de kopie een andere naam.`, label: 'Opkomst titel', okLabel,
    suggest: freeName(bank, g.opk.title), taken: n => nameTaken(bank, n),
    ok: name => { const L = latest(), { opk, dropped } = L.importShared(g, name); then(opk, droppedNote(dropped), L); },
  });
}

/**
 * Om een vrije naam in de opkomstenbank vragen voor opkomst `o` (In bank zetten). `except`: een concept dat zelf de bank in gaat
 * mag zijn eigen naam houden (o.id); een kopie (bijv. van een ingeplande opkomst) niet (null).
 */
export function askBankName(o: Opk, bank: Opk[], except: string | null, ok: (name: string) => void) {
  withFreeName(o.title, {
    title: 'Andere naam kiezen', sub: o.title.trim() ? `"${o.title.trim()}" staat al in de opkomstenbank. Kies een andere naam.` : 'Geef de opkomst een titel voor de bank.', label: 'Opkomst titel', okLabel: 'In bank zetten',
    suggest: o.title.trim() ? freeName(bank, o.title) : '', taken: n => nameTaken(bank, n, except), ok,
  });
}

/** Paginakop. `small`: op het dashboard, zodat de komende opkomst (64 px) het grootst blijft. */
export const PageTitle = ({ title, sub, kicker, small, children }: { title: React.ReactNode; sub?: React.ReactNode; kicker?: React.ReactNode; small?: boolean; children?: React.ReactNode }) =>
  <div className="row between" style={{ alignItems: 'flex-end' }}>
    <div>{kicker && <p className="kicker">{kicker}</p>}<h1 className={'display font-black tracking-tighter ' + (small ? 'text-5xl md:text-[56px]' : 'text-5xl md:text-7xl')}>{title}</h1>{sub && <p className="subline">{sub}</p>}</div>
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
  // alleen de vaste blokken (openen, ranja, sluiten) is nog geen programma
  if (progEmpty(o)) return <span className="pill neutral">Nog leeg</span>;
  const a = analyze(o, presentFor(o), leaders);
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
  return <span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(progBlocks(o).length, 'onderdeel', 'onderdelen')}{n ? ' · min. ' + n + ' leiding' : ''}{o.short ? ' · ' + o.short : ''}</span>;
}

/** Opkomst in een keuzelijst. `kicker`: regel boven de titel, bijv. de datum en de status van een ingeplande opkomst. `cats`: categorieën van een andere speltak (groepsbank). */
export function PickOpk({ o, label, onPick, primary = true, extra, kicker, cats }: { o: Opk; label: string; onPick: () => void; primary?: boolean; extra?: ReactNode; kicker?: ReactNode; cats?: Cat[] }) {
  // naam met de titel erbij: in een lijst van schermlezers zijn de knoppen anders allemaal "Openen"
  const btn = <button className={'btn sm' + (primary ? ' primary' : '')} onClick={onPick} aria-label={`${label}: ${o.title || 'Naamloze opkomst'}`}>{label}</button>;
  return <div className="pick"><div className="info">{kicker && <span className="pick-kicker">{kicker}</span>}<b>{o.title || 'Naamloze opkomst'}</b><OpkMeta o={o} /><CatTags o={o} cats={cats} /><Strip o={o} cats={cats} /></div>
    {extra ? <div className="row">{btn}{extra}</div> : btn}</div>;
}

/** Onderbalk bij het bewerken van iets uit een bank: Annuleren / Opslaan / Opslaan als kopie (met nieuwe naam). */
export function SaveBar({ dirty, isNew, title, taken, suggest, onCancel, onSave, onCopy, sticky }: {
  dirty: boolean; isNew?: boolean; title: string; taken: (name: string, copy: boolean) => boolean; suggest: string;
  onCancel: () => void; onSave: () => void; onCopy: (name: string) => void; sticky?: boolean;
}) {
  const [copying, setCopying] = useState(false);
  const [name, setName] = useState('');
  const errId = useId();
  const copyBtn = useRef<HTMLButtonElement>(null);
  const why = (n: string, copy = false) => !n.trim() ? 'Geef een titel op.' : taken(n, copy) ? 'Deze naam bestaat al in de bank. Kies een andere naam.' : '';
  const saveErr = dirty || isNew ? why(title) : '';
  const copyErr = why(name, true);
  // voorstel: de (aangepaste) titel als die nog vrij is, anders een vrije naam met (kopie)
  const startCopy = () => { setName(title.trim() && !taken(title, true) ? title.trim() : suggest); setCopying(true); };
  // terug uit de naamvraag (Terug, Esc of Kopie opslaan): de focus naar Opslaan als kopie, niet kwijt naar het begin van de pagina.
  // Na Kopie opslaan staat er vaak een nieuw paneel (de kopie): dan de knop daarin.
  const endCopy = () => {
    setCopying(false);
    setTimeout(() => {
      const a = document.activeElement; if (a && a !== document.body && a.isConnected) return;
      (copyBtn.current?.isConnected ? copyBtn.current : document.querySelector<HTMLElement>('.savebar .sb-copy'))?.focus();
    }, 30);
  };
  const doCopy = () => { endCopy(); onCopy(name.trim()); };
  return <div className={'savebar' + (sticky ? ' sticky' : '') + (dirty || isNew ? ' on' : '')} role="group" aria-label="Opslaan">
    {copying ? <>
      <label htmlFor="sb-name" className="lbl">Naam van de kopie</label>
      <input id="sb-name" className="inp" value={name} autoFocus aria-invalid={!!copyErr} aria-describedby={errId} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !copyErr) doCopy(); if (e.key === 'Escape') { e.preventDefault(); endCopy(); } }} />
      {/* altijd aanwezig, alleen de tekst verandert: zo leest een schermlezer de fout voor tijdens het typen */}
      <span className="sb-err" id={errId} aria-live="polite">{copyErr}</span>
      <div className="row"><button className="btn ghost" onClick={endCopy}>Terug</button><button className="btn primary" disabled={!!copyErr} onClick={doCopy}>Kopie opslaan</button></div>
    </> : <>
      <span className="sb-err" id={errId} aria-live="polite">{saveErr}</span>
      {(dirty || isNew) && !saveErr ? <span className="sb-msg">{isNew ? 'Nog niet in de bank.' : 'Niet opgeslagen wijzigingen.'}</span> : null}
      <div className="row">
        <button className="btn ghost" disabled={!dirty && !isNew} onClick={onCancel}>Annuleren</button>
        <button className="btn primary" disabled={(!dirty && !isNew) || !!saveErr} onClick={onSave}>Opslaan</button>
        {!isNew && <button ref={copyBtn} className="btn sb-copy" onClick={startCopy}>Opslaan als kopie</button>}
      </div>
    </>}
  </div>;
}

/** Kaart in een bank met een eigen verwijderknop rechtsonder (twee keer klikken). */
export function BankCard({ children, onDelete, what }: { children: ReactNode; onDelete?: () => void; what: string }) {
  return <div className="bwrap transition-transform duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5">{children}
    {onDelete && <ConfirmBtn className="btn sm ghost carddel" label={<Trash2 size={15} aria-label={what + " verwijderen"} />} confirm="Verwijderen?" title={what + ' verwijderen'} onConfirm={onDelete} />}</div>;
}
