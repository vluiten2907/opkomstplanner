import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSpeltak } from '../store/speltak';
import { withFreeName } from '../store/modal';
import type { Gedeeld } from '../store/groepsbank';
import { progBlocks, analyze, catOf, freeName, isKamp, minNeed, nameTaken, opkCatOf, progEmpty, sameName, toBank, type Cat, type Opk, type Day } from '../lib/model';
import { clone, fmtDur, fmtT, plural } from '../lib/time';
import { toast, undoAction } from '../store/toast';
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
export function copySharedToBank(g: Gedeeld, bank: Opk[], okLabel: string, latest: () => Speltak, then: (copy: Opk, note: string, L: Speltak) => void,
  opt: { sub?: string; label?: string; back?: () => void } = {}) {
  withFreeName(g.opk.title, {
    title: 'Andere naam kiezen', sub: opt.sub ?? `"${g.opk.title || 'Naamloos'}" staat al in jullie opkomstenbank. Geef de kopie een andere naam.`, label: opt.label ?? 'Opkomst titel', okLabel, back: opt.back,
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

/**
 * Concept zelf de bank in zetten (zonder namen; met een groep meteen gedeeld). Met het recht Opkomsten kan het terug met Ongedaan maken:
 * de opkomst komt weer als concept mét namen. Dat gaat met verwijderen en opnieuw aanmaken, meteen na elkaar (de regels laten een
 * bank-opkomst niet terug naar concept gaan); de synchronisatie haalt hem dan ook uit de groepsbank.
 */
export function conceptToBank(o: Opk, name: string, latest: () => Speltak) {
  const S = latest(), back = clone(o);
  S.saveOpk(toBank(o, name));
  const msg = (S.sp?.gid ? 'In de opkomstenbank gezet en gedeeld met de groep' : 'In de opkomstenbank gezet') + ', zonder namen van leiding';
  toast(msg, S.can('build') ? undoAction(() => {
    const L = latest(), cur = L.getO(back.id); if (cur?.state !== 'bank') return;
    L.deleteOpk(back.id); L.saveOpk(clone(back));
  }) : undefined);
}

/** Focus na iets wat de knop met de focus weghaalt (verwijderen, in de bank zetten, kopiëren): het eerste element dat er dan is. */
export const focusAfter = (...sels: string[]) => setTimeout(() => {
  for (const q of sels) { const el = q ? document.querySelector<HTMLElement>(q) : null; if (el) { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest' }); return; } }
}, 30);
/** Selector voor een kaart in een bank (data-id). */
export const cardSel = (id: string) => `.bcard[data-id="${CSS.escape(id)}"]`;

/**
 * Breed scherm: het zijpaneel van een bank plakt pas onder de kopbalk als je wat naar beneden scrolt; bovenaan de pagina staat het lager
 * en valt de opslaan-balk onder de rand van het scherm. Dan de pagina schuiven tot het paneel op zijn plakplek staat (zoals editorInView in de bouwer).
 */
export function sideInView() {
  setTimeout(() => {
    if (window.matchMedia?.('(max-width: 900px)').matches) return;
    const el = document.querySelector<HTMLElement>('.bank > aside.side'); if (!el || !el.querySelector('.savebar')) return;
    const r = el.getBoundingClientRect(), stick = parseFloat(getComputedStyle(el).top) || 80;
    if (r.bottom <= window.innerHeight || r.top <= stick + 1) return;
    window.scrollBy({ top: r.top - stick, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, 30);
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
export function PickOpk({ o, label, onPick, primary = false, extra, kicker, cats, pickId }: { o: Opk; label: string; onPick: () => void; primary?: boolean; extra?: ReactNode; kicker?: ReactNode; cats?: Cat[]; pickId?: string }) {
  // standaard een gewone knop: in een lijst is hooguit de eerste (de beste keuze) de hoofdknop, anders zegt groen niets meer
  // naam met de titel erbij: in een lijst van schermlezers zijn de knoppen anders allemaal "Openen"
  const btn = <button className={'btn sm' + (primary ? ' primary' : '')} onClick={onPick} aria-label={`${label}: ${o.title || 'Naamloze opkomst'}`}>{label}</button>;
  return <div className="pick" data-pick={pickId}><div className="info">{kicker && <span className="pick-kicker">{kicker}</span>}<b>{o.title || 'Naamloze opkomst'}</b><OpkMeta o={o} /><CatTags o={o} cats={cats} /><Strip o={o} cats={cats} /></div>
    {extra ? <div className="row">{btn}{extra}</div> : btn}</div>;
}

/** Onderbalk bij het bewerken van iets uit een bank: Annuleren / Opslaan / Opslaan als kopie (met nieuwe naam). */
export function SaveBar({ dirty, isNew, newHint = 'Geef eerst een titel op.', title, origTitle, taken, suggest, onCancel, onSave, onCopy, sticky }: {
  dirty: boolean; isNew?: boolean; newHint?: string; title: string;
  /** opgeslagen titel: staat die al dubbel in de bank (back-up, Ongedaan maken, twee apparaten), dan blokkeert alleen een nieuwe dubbele naam Opslaan */
  origTitle?: string;
  taken: (name: string, copy: boolean) => boolean; suggest: string;
  onCancel: () => void; onSave: () => void; onCopy: (name: string) => void; sticky?: boolean;
}) {
  const [copying, setCopying] = useState(false);
  const [name, setName] = useState('');
  const errId = useId();
  const copyBtn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  // hoogte van de balk als --saveh: Tab en scrollIntoView zetten daarmee niets onder de balk (scroll-padding-bottom in styles.css)
  useLayoutEffect(() => {
    const el = box.current, root = document.documentElement; if (!el) return;
    const set = () => root.style.setProperty('--saveh', Math.ceil(el.getBoundingClientRect().height) + 'px');
    set();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set); ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty('--saveh'); };
  }, []);
  const why = (n: string, copy = false) => !n.trim() ? 'Geef een titel op.'
    : taken(n, copy) && (copy || isNew || origTitle === undefined || !sameName(n, origTitle)) ? 'Deze naam bestaat al in de bank. Kies een andere naam.' : '';
  // net aangemaakt en nog niets ingevuld: geen rode fout (je hebt nog niets fout gedaan), alleen een gewone aanwijzing; Opslaan kan nog niet.
  // Na de eerste invoer (ook weer leeggemaakt) wel de fout, en die leest een schermlezer dan voor.
  const pristine = !!isNew && !dirty && !title.trim();
  const saveErr = pristine ? '' : dirty || isNew ? why(title) : '';
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
  return <div ref={box} className={'savebar' + (sticky ? ' sticky' : '') + (dirty || isNew ? ' on' : '')} role="group" aria-label="Opslaan">
    {copying ? <>
      <label htmlFor="sb-name" className="lbl">Naam van de kopie</label>
      <input id="sb-name" className="inp" value={name} autoFocus aria-invalid={!!copyErr} aria-describedby={errId} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !copyErr) doCopy(); if (e.key === 'Escape') { e.preventDefault(); endCopy(); } }} />
      {/* altijd aanwezig, alleen de tekst verandert: zo leest een schermlezer de fout voor tijdens het typen */}
      <span className="sb-err" id={errId} aria-live="polite">{copyErr}</span>
      <div className="row"><button className="btn ghost" onClick={endCopy}>Terug</button><button className="btn primary" disabled={!!copyErr} onClick={doCopy}>Kopie opslaan</button></div>
    </> : <>
      <span className="sb-err" id={errId} aria-live="polite">{saveErr}</span>
      {(dirty || isNew) && !saveErr ? <span className="sb-msg">{pristine ? newHint : isNew ? 'Nog niet in de bank.' : 'Niet opgeslagen wijzigingen.'}</span> : null}
      <div className="row">
        <button className="btn ghost" disabled={!dirty && !isNew} onClick={onCancel}>Annuleren</button>
        <button className="btn primary" disabled={(!dirty && !isNew) || pristine || !!saveErr} onClick={onSave}>Opslaan</button>
        {!isNew && <button ref={copyBtn} className="btn sb-copy" onClick={startCopy}>Opslaan als kopie</button>}
      </div>
    </>}
  </div>;
}

/** Kaart in een bank met een eigen verwijderknop rechtsonder (twee keer klikken). De naam van de knop noemt de titel (in de lijst van een schermlezer niet 12× hetzelfde). */
export function BankCard({ children, onDelete, what, title }: { children: ReactNode; onDelete?: () => void; what: string; title: string }) {
  return <div className="bwrap transition-transform duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5">{children}
    {onDelete && <ConfirmBtn className="btn sm ghost carddel" label={<Trash2 size={15} aria-hidden="true" />} confirm="Verwijderen?" title={what + ' verwijderen'} ariaLabel={`${what} ${title || 'Naamloos'} verwijderen`} onConfirm={onDelete} />}</div>;
}
