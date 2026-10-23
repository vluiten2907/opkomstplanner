import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, CalendarDays, ChevronRight, Copy, Download, GraduationCap, Plus, Tent, Trash2, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal, withFreeName } from '../store/modal';
import { guardLeave, setUnsaved, useDirty } from '../store/unsaved';
import { isFresh, markFresh, watchFresh } from '../store/fresh';
import { Strip, PickOpk, usePdf, PageTitle, SaveBar, StatusPill } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field, TimePicker, useMedia, useSheetDialog } from '../components/ui';
import { Ticks, PrepZones, blkGeom, blkLabel, byTime, focusSoon, lanesStyle, useKeepFocus } from '../components/timeline';
import { CatSelect, LocInput, NumInput } from '../components/fields';
import { addDays, cap, clone, fmtDur, fmtRange, fmtT, isoWeek, plural, splitLines, splitNames, todayISO, uid, DAYS } from '../lib/time';
import { allBlocks, analyze, analyzeOne, blockFromLib, byTitle, fitsTopic, rowDate, rowsIn, catOf, changeOpkTime, copyOpk, firstFree, freeName, nameTaken, dayTitle, isBlankOpk, isFixed, isKamp, lanesLayout, libSearchText, minNeed, newKamp, newOpk, normBlock, normDay, normLib, normOpk, opkCatList, plannersOf, prepLabel, syncKamp, toBank, libFields, PREP_OPTS, type Analysis, type Block, type Day, type Lib, type Opk } from '../lib/model';

/** Titel van de opkomst: loopt door op een volgende regel in plaats van af te breken (smal scherm), zonder echte regeleinden. */
function TitleArea({ value, readOnly, onChange, placeholder, autoFocus }: { value: string; readOnly: boolean; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
    fit();
    window.addEventListener('resize', fit);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => window.removeEventListener('resize', fit);
  }, [value]);
  return <textarea ref={ref} id="om-title" rows={1} value={value} readOnly={readOnly} aria-label="Opkomst titel" placeholder={placeholder} autoFocus={autoFocus}
    onKeyDown={ev => { if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) ev.preventDefault(); }} onChange={ev => onChange(ev.target.value.replace(/[\r\n]+/g, ' '))} />;
}

const blkSel = (id: string) => `.lanes [data-bid="${CSS.escape(id)}"]`;

/** Details open of dicht, onthouden per apparaat (telefoon en breed scherm apart). Zonder opslag (privévenster): niets onthouden. */
function metaPref(narrow: boolean, v?: '0' | '1') {
  const k = 'opk.details.' + (narrow ? 'smal' : 'breed');
  try { if (v) localStorage.setItem(k, v); return localStorage.getItem(k); } catch { return null; }
}

/* ============ Startscherm ============ */
export default function Bouwer() {
  const { oid } = useParams();
  const { opks, plans, settings, saveOpk, sid, can, canLink, getO, removeOpk, entryOfOpk, entryFor, newForEntry, practice } = useSpeltak();
  const nav = useNavigate();
  const o = oid ? getO(oid) : undefined;
  if (oid && o) return <Builder key={o.id} o={o} />;
  const bank = opks.filter(x => x.state === 'bank').sort(byTitle), drafts = opks.filter(x => x.state === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  // de eerstvolgende ingeplande opkomsten en kampen (een kamp dat nu loopt telt mee), zodat je die hier meteen vindt
  const today = todayISO();
  const coming = opks.filter(x => x.state === 'planned').map(x => ({ x, e: entryOfOpk(x) }))
    .filter((r): r is { x: Opk; e: NonNullable<typeof r.e> } => !!r.e && (r.e.endDate || r.e.date) >= today)
    .sort((a, b) => a.e.date.localeCompare(b.e.date)).slice(0, 6);
  // de eerstvolgende datums met een onderwerp (of een kamp) maar nog zonder programma; koppelen schrijft de jaarplanning én de opkomst: alleen met dat recht
  const open = canLink ? rowsIn(settings, plans, today, addDays(today, 180)).filter(r => !!r.e && !r.e.opkId && r.e.type !== 'geen' && (!!r.e.topic.trim() || r.e.type === 'kamp')).slice(0, 3) : [];
  // met het recht Opkomsten meteen een programma maken (onderwerp als titel, gekoppeld); anders kiezen uit de bank of een concept
  const make = (key: string) => { const en = { ...entryFor(key) }, n = newForEntry(en, en.type === 'kamp'); nav(`/s/${sid}/bouwer/${n.id}`); };
  const create = (kamp: boolean) => { const n = kamp ? newKamp(settings, 3) : newOpk(settings); saveOpk(n); markFresh(n.id); nav(`/s/${sid}/bouwer/${n.id}`); };
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title="Opkomstbouwer" />
    {oid && !o && <div className="ctx">Deze opkomst bestaat niet (meer).</div>}
    {can('build') && <div className="row"><button className="btn primary" onClick={() => create(false)}><Plus size={16} />Nieuwe opkomst</button><button className="btn" onClick={() => create(true)}><Tent size={16} />Weekendkamp</button></div>}
    {coming.length > 0 && <section className="stack" style={{ gap: 10 }} aria-labelledby="bw-coming">
      <div className="row between"><h2 id="bw-coming">Komende opkomsten</h2><button className="linkbtn" onClick={() => nav(`/s/${sid}/jaarplanning`)}>Hele jaarplanning</button></div>
      <div className="picklist coming">{coming.map(({ x, e }) => <PickOpk key={x.id} o={x} label="Openen" onPick={() => nav(`/s/${sid}/bouwer/${x.id}`)}
        kicker={<><span className="pk-when"><CalendarDays size={14} aria-hidden="true" />{fmtRange(e.date, e.endDate)}</span><StatusPill o={x} /></>} />)}</div>
    </section>}
    {open.length > 0 && <section className="stack" style={{ gap: 10 }} aria-labelledby="bw-open">
      <h2 id="bw-open">Nog zonder programma</h2>
      <div className="picklist">{open.map(r => {
        const e = r.e!, d = rowDate(r), what = e.topic.trim() || 'Weekendkamp';
        // past er al iets uit de bank of een concept bij het onderwerp? Dan ook kiezen (het venster Koppelen zet die bovenaan)
        const fit = e.topic.trim() ? [...bank, ...drafts].find(x => fitsTopic(x, e.topic)) : undefined;
        const pick = <button className="btn sm" onClick={() => openModal({ kind: 'link', keyId: r.key })} aria-label={`Koppelen: ${what}`}>Koppelen</button>;
        return <div key={r.key} className="pick">
          <div className="info"><span className="pick-kicker"><span className="pk-when"><CalendarDays size={14} aria-hidden="true" />{fmtRange(d, e.endDate)}</span>{e.type === 'kamp' && <span className="pill kamp">Kamp</span>}</span><b>{what}</b>
            {fit && <span className="hint">Past bij: {fit.title || 'Naamloze opkomst'} ({fit.state === 'bank' ? 'opkomstenbank' : 'concept'})</span>}</div>
          {can('build') ? <div className="row"><button className="btn sm primary" onClick={() => make(r.key)} aria-label={`Programma maken: ${what}`}><Plus size={14} />Maken</button>{fit && pick}</div> : pick}</div>;
      })}</div>
    </section>}
    {drafts.length > 0 && <><h2>Concepten</h2><div className="picklist">{drafts.map(x => <PickOpk key={x.id} o={x} label="Openen" onPick={() => nav(`/s/${sid}/bouwer/${x.id}`)}
      extra={can('build') ? <ConfirmBtn className="btn sm ghost" label={<><Trash2 size={14} />Verwijderen</>} confirm="Klik nogmaals" title="Concept verwijderen" onConfirm={() => removeOpk(x)} /> : undefined} />)}</div></>}
    {!coming.length && !drafts.length && !bank.length && !(oid && !o) && <div className="empty"><span>Hier bouw je het programma van een opkomst of kamp: onderdelen op een tijdlijn per 5 minuten, met wie wat doet.</span>
      {!practice && <Link className="btn" to="/s/oefen/bouwer"><GraduationCap size={16} />Oefenomgeving bekijken</Link>}</div>}
    {bank.length > 0 && <><h2>Uit de opkomstenbank</h2><div className="picklist">{bank.map(x => <PickOpk key={x.id} o={x} label="Openen" onPick={() => nav(`/s/${sid}/bouwer/${x.id}`)}
      extra={can('bank') ? <ConfirmBtn className="btn sm ghost" label={<><Trash2 size={14} />Verwijderen</>} confirm="Klik nogmaals" title="Uit de opkomstenbank verwijderen" onConfirm={() => removeOpk(x)} /> : undefined} />)}</div></>}
  </div>;
}

/* ============ Bouwer ============ */
function useRowHeight(kamp: boolean) {
  const [base, setBase] = useState(24);
  useEffect(() => {
    const read = () => setBase(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 24);
    read(); window.addEventListener('resize', read); return () => window.removeEventListener('resize', read);
  }, []);
  return base * (kamp ? 0.6 : 1);
}

type Ctx = { o: Opk; D: { start: number; end: number; blocks: Block[]; label?: string }; T0: number; T1: number; row: number; nn: boolean; present: string[]; readOnly: boolean };

function Builder({ o: stored }: { o: Opk }) {
  const S = useSpeltak();
  const { settings, leaders, opks, saveOpk, savePlan, saveLib, entryOfOpk, presentFor, getO, sid, can, canLink, dropAbsent, removeOpk, latest } = S;
  const nav = useNavigate(); const pdf = usePdf();
  const [, bump] = useState(0);
  // Nieuwe opkomst: titel meteen klaar om te typen; ga je weg zonder iets in te vullen, dan blijft er geen leeg concept staan.
  // Nooit bij een opkomst die al ingepland is, in de bank staat of al eerder bestond (die is niet nieuw).
  const [fresh] = useState(() => isFresh(stored.id));
  useEffect(() => watchFresh(stored.id, () => {
    const L = latest(), cur = L.getO(stored.id);
    if (cur && cur.state === 'draft' && isBlankOpk(cur) && !L.entryOfOpk(cur)) L.deleteOpk(cur.id);
  }), [stored.id]);
  // Details van een bestaande opkomst ingeklapt (ook op een laptop), zodat de tijdlijn meteen in beeld is; een nieuwe opkomst
  // (of een zonder titel) opent ze. Wie ze open- of dichtklapt, krijgt dat op dit apparaat ook bij de volgende opkomst.
  const narrow = useMedia('(max-width: 900px)');
  const [metaOpen, setMetaOpen] = useState(() => fresh || !stored.title.trim() || metaPref(narrow) === '1');
  const toggleMeta = () => { metaPref(narrow, metaOpen ? '0' : '1'); setMetaOpen(!metaOpen); };
  // net ingepland of gesleept onderdeel: in beeld brengen en even laten oplichten
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => { if (!flashId) return; const t = setTimeout(() => setFlashId(null), 1600); return () => clearTimeout(t); }, [flashId]);
  const showNew = (id: string) => {
    setFlashId(id);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(blkSel(id)); if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 120 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }, 30);
  };
  // de activiteitenbank (zijpaneel) in beeld? Dan is de knop "+ Activiteit" onderin niet nodig
  const [sideSeen, setSideSeen] = useState(false);
  // Een opkomst uit de bank bewerk je als kladversie: pas bij Opslaan (of Opslaan als kopie) gaat hij naar de bank.
  const bankEdit = stored.state === 'bank';
  const [draft, setDraft] = useState<Opk | null>(() => bankEdit ? normOpk(clone(stored)) : null);
  const [dirty, setDirty] = useState(false);
  // Weggooien in de melding (bijv. bij Inplannen of Kopie): de kladversie terug naar de bank-versie, net als Annuleren
  useDirty(dirty, () => { if (bankEdit) cancelBank(); });
  useEffect(() => { if (bankEdit && !draft) setDraft(normOpk(clone(stored))); if (!bankEdit && draft) { setDraft(null); setDirty(false); } }, [bankEdit]);
  const o = (bankEdit && draft) || stored;
  const bankOpks = opks.filter(x => x.state === 'bank');
  const go = (to: string) => guardLeave(() => nav(to));
  const [dayIdx, setDayIdx] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'bank' | 'check'>('bank');
  const lanesRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sideRef.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    // pas "in beeld" als het paneel een stukje het scherm in staat, niet bij de eerste pixel onderaan
    const io = new IntersectionObserver(([en]) => setSideSeen(en.isIntersecting), { rootMargin: '0px 0px -25% 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  const toSide = (tab: 'bank' | 'check') => { setSelId(null); setSideTab(tab); setTimeout(() => sideRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 0); };
  // Een opkomst uit de bank bewerk je met het recht Banken, de rest met Opkomsten (zoals de uitleg bij de rechten zegt).
  const readOnly = o.state === 'bank' ? !can('bank') : !can('build');
  // + Onderdeel onderin beeld, waar de knop Activiteit zweeft: die knop dan even weg, anders tik je hem per ongeluk aan
  const addRef = useRef<HTMLButtonElement>(null);
  const [addLow, setAddLow] = useState(false);
  useEffect(() => {
    const el = addRef.current; if (!narrow || !el || typeof IntersectionObserver === 'undefined') { setAddLow(false); return; }
    let io: IntersectionObserver | null = null;
    // alleen de onderste 120 px van het scherm tellen mee (ook als er een melding staat en de knop hoger zweeft)
    const watch = () => { io?.disconnect(); io = new IntersectionObserver(([en]) => setAddLow(en.isIntersecting), { rootMargin: `-${Math.max(0, window.innerHeight - 120)}px 0px 0px 0px` }); io.observe(el); };
    watch(); window.addEventListener('resize', watch);
    return () => { io?.disconnect(); window.removeEventListener('resize', watch); };
  }, [narrow, readOnly]);
  const kamp = isKamp(o), row = useRowHeight(kamp);
  const di = Math.min(dayIdx, o.days.length - 1);
  const D = kamp ? o.days[di] : o;
  const T0 = kamp ? D.start : o.start - (o.prep || 0), T1 = kamp ? D.end : o.end + (o.post || 0);
  const e = o.state === 'planned' ? entryOfOpk(o) : null, src = o.srcId ? getO(o.srcId) : undefined;
  // afwezig gemeld door iemand zonder recht op opkomsten: bij openen stil uit de indeling halen
  useEffect(() => { if (e && can('build')) dropAbsent(e, true); }, [e?.id, e?.absent.join('|')]);
  const nn = o.state === 'bank', present = presentFor(o);
  const ctx: Ctx = { o, D, T0, T1, row, nn, present, readOnly };
  const upd = (fn: () => void) => { if (readOnly) return; fn(); if (kamp) syncKamp(o); if (o === draft) setDirty(true); else saveOpk({ ...o }); bump(x => x + 1); };
  // Nieuwste stand voor acties die later komen (Ongedaan maken): na het opslaan vervangt de database de opkomst door een nieuw object.
  const live = useRef({ o, upd }); live.current = { o, upd };
  const saveBank = () => { const x = normOpk(clone(o)); x.title = x.title.trim(); saveOpk(x); setDraft(normOpk(clone(x))); setDirty(false); toast('Opkomst opgeslagen in de bank'); };
  const cancelBank = () => { setDraft(normOpk(clone(stored))); setDirty(false); setSelId(null); };
  const copyBank = (name: string) => {
    const c = copyOpk(o); c.title = name; c.srcId = null; c.fromShared = null; c.state = 'bank';
    saveOpk(c); setDirty(false); setUnsaved(false); nav(`/s/${sid}/bouwer/${c.id}`); toast(`Kopie "${name}" opgeslagen in de bank`);
  };
  const A = kamp ? analyzeOne(D as Day, present, leaders, nn) : analyze(o, present, leaders);
  const whole = kamp ? analyze(o, present, leaders) : A;
  const sel = selId ? allBlocks(o).find(b => b.id === selId) || null : null;
  useEffect(() => { if (selId && !sel) setSelId(null); }, [selId, sel]);
  // kb: met het toetsenbord gekozen, dan gaat de focus meteen naar het eerste veld van het onderdeel
  const select = (id: string | null, kb = false) => {
    if (id && kamp) { const k = o.days.findIndex(d => d.blocks.some(b => b.id === id)); if (k >= 0 && k !== di) setDayIdx(k); }
    setSelId(id); if (id && sideRef.current) sideRef.current.scrollTop = 0;
    if (id && kb) setTimeout(() => document.getElementById('bf-title')?.focus(), 30);
    if (id) setTimeout(editorInView, 30);
  };
  // Breed scherm: het bewerkpaneel plakt naast de tijdlijn, maar bij een onderdeel onderaan duwt het einde van de tijdlijn
  // het omhoog, onder de kopbalk (titel en sluiten onzichtbaar). Dan terugschuiven tot het paneel weer op zijn plek staat.
  const editorInView = () => {
    const el = sideRef.current; if (!el || window.matchMedia('(max-width: 900px)').matches) return;
    const bar = document.querySelector('header.bar')?.getBoundingClientRect().bottom ?? 0, top = el.getBoundingClientRect().top;
    if (top < bar + 4) window.scrollBy(0, top - (parseFloat(getComputedStyle(el).top) || bar + 16));
  };
  // sluiten (kruisje, Esc of naast het paneel): de focus gaat terug naar het onderdeel in de tijdlijn
  const closeEditor = () => { const id = selId; setSelId(null); if (id) focusSoon(blkSel(id)); };
  const [sheetRef, sheetProps] = useSheetDialog(!!sel, 'Onderdeel bewerken', () => sel ? document.querySelector<HTMLElement>(blkSel(sel.id)) : null);
  const deleteBlock = (id: string) => {
    if (readOnly) return;
    const dayId = kamp ? o.days.find(d => d.blocks.some(x => x.id === id))?.id : null;
    const blocksOf = (x: Opk) => kamp ? x.days.find(d => d.id === dayId)?.blocks : x.blocks;
    const list = blocksOf(o) || [];
    const i = list.findIndex(b => b.id === id); if (i < 0) return;
    // daarna de focus op het volgende onderdeel (of het vorige), anders op + Onderdeel: niet kwijt naar het begin van de pagina
    const rest = list.filter(x => x.id !== id).sort((a, c) => a.start - c.start);
    const nb = rest.find(x => x.start >= list[i].start) || rest[rest.length - 1];
    const [b] = list.splice(i, 1); if (selId === id) setSelId(null);
    upd(() => {});
    focusSoon(...(nb ? [blkSel(nb.id)] : []), '#bf-add');
    // terugzetten in de opkomst zoals hij nú is, zodat wat je intussen aanpaste blijft staan
    toast(`"${b.title || 'Naamloos onderdeel'}" verwijderd`, { label: 'Ongedaan maken', fn: () => live.current.upd(() => {
      const to = blocksOf(live.current.o); if (!to || to.some(x => x.id === b.id)) return;
      to.splice(Math.min(i, to.length), 0, b);
    }) });
  };
  const insertLib = (l: Lib, start: number) => {
    const dur = Math.min(l.dur, T1 - T0), s = Math.max(T0, Math.min(T1 - dur, start));
    const b = blockFromLib(l, s); b.dur = dur; upd(() => { D.blocks.push(b); }); setSelId(null); return b;
  };
  const addAt = (m: number) => {
    const next = D.blocks.filter(b => b.start > m).reduce((a, b) => Math.min(a, b.start), T1);
    const b = normBlock({ start: m, dur: Math.max(5, Math.min(15, next - m, T1 - m)), cat: (settings.categories[0] || {}).id || '', minLeaders: 1 });
    upd(() => { D.blocks.push(b); }); select(b.id);
    setTimeout(() => (document.getElementById('bf-title') as HTMLInputElement | null)?.focus(), 30);
  };
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const act = document.activeElement as HTMLElement | null, tag = (act && act.tagName) || '';
      // met een venster open sluit Esc alleen het venster
      if (ev.key === 'Escape' && selId) { if (!ev.defaultPrevented && !document.querySelector('.modal')) closeEditor(); return; }
      if (readOnly) return;
      // het onderdeel met de focus, anders het gekozen onderdeel
      const bid = act?.classList.contains('blk') ? act.dataset.bid : undefined, target = bid || selId;
      if ((ev.key === 'Delete' || (ev.key === 'Backspace' && (tag === 'BODY' || bid))) && target && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.querySelector('.modal')) { ev.preventDefault(); deleteBlock(target); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });
  const setTime = (which: 'start' | 'end', v: number) => {
    if (readOnly) return;
    const r = changeOpkTime(o, which, v);
    if (!r.opk) { toast(r.error); return; }
    const c = r.opk; upd(() => { o.start = c.start; o.end = c.end; o.blocks = c.blocks; });
    if (r.note) toast(r.note);
  };
  const pill = o.state === 'bank' ? <span className="pill good">In opkomstenbank</span> : o.state === 'planned' ? <span className="pill acc">Ingepland</span> : <span className="pill neutral">Concept</span>;
  const putInBank = () => {
    if (!allBlocks(o).length && !o.title) { toast('Geef de opkomst eerst een titel of een onderdeel.'); return; }
    const ask = { title: 'Andere naam kiezen', sub: o.title.trim() ? `"${o.title.trim()}" staat al in de opkomstenbank. Kies een andere naam.` : 'Geef de opkomst een titel voor de bank.', label: 'Opkomst titel', okLabel: 'In bank zetten', suggest: o.title.trim() ? freeName(bankOpks, o.title) : '' };
    // concept: gaat zelf de bank in; ingepland: er komt een kopie in de bank (allebei zonder namen)
    if (o.state === 'draft') return withFreeName(o.title, { ...ask, taken: n => nameTaken(bankOpks, n, o.id), ok: name => { if (!can('bank')) return; saveOpk(toBank(o, name)); toast(S.sp?.gid ? 'In de opkomstenbank gezet en gedeeld met de groep, zonder namen' : 'Opgeslagen in de opkomstenbank, zonder namen van leiding'); } });
    withFreeName(o.title, { ...ask, taken: n => nameTaken(bankOpks, n), ok: name => {
      // zonder recht Opkomsten blijft de ingeplande opkomst zelf ongemoeid (upd doet dan niets)
      const b = toBank(o, name); saveOpk(b); upd(() => { o.srcId = b.id; }); toast('Kopie opgeslagen in de opkomstenbank, zonder leiding');
    } });
  };
  // kopie van de opgeslagen bank-versie: na Weggooien is `o` in deze functie nog de kladversie met de weggegooide wijzigingen
  const dup = () => guardLeave(() => { const c = copyOpk(stored); c.state = 'draft'; c.srcId = null; c.title = (stored.title || 'Opkomst') + ' (kopie)'; saveOpk(c); nav(`/s/${sid}/bouwer/${c.id}`); toast('Kopie gemaakt'); });
  const updBank = () => {
    if (!src) return;
    if (nameTaken(bankOpks, o.title, src.id)) { toast(`"${o.title.trim()}" bestaat al in de opkomstenbank. Geef deze opkomst eerst een andere titel.`); return; }
    const f = toBank(o, o.title, false);
    saveOpk({ ...src, cats: f.cats, kind: f.kind, title: f.title, short: f.short, group: f.group, location: f.location, start: f.start, end: f.end, prep: f.prep, post: f.post, blocks: f.blocks, days: f.days });
    toast('Opkomstenbank bijgewerkt');
  };
  const pdfBtn = <button className="btn primary" onClick={() => pdf(o)}><Download size={16} />PDF maken</button>;
  // Elke knop volgt zijn eigen recht: In bank en Verwijderen (bank) met Banken, Kopie en Verwijderen (concept) met Opkomsten.
  const bankBtn = can('bank') && <button className="btn" onClick={putInBank}><Bookmark size={16} />In bank</button>;
  const planBtn = canLink && <button className="btn" onClick={() => guardLeave(() => openModal({ kind: 'toplan', oid: o.id }))}><CalendarDays size={16} />Inplannen</button>;
  const actions = o.state === 'draft' ? <>{bankBtn}{planBtn}{pdfBtn}{can('build') && <ConfirmBtn className="btn ghost" label={<><Trash2 size={16} />Verwijderen</>} confirm="Klik nogmaals om te verwijderen" title="Concept verwijderen" onConfirm={() => { nav(`/s/${sid}/bouwer`); removeOpk(stored); }} />}</>
    : o.state === 'bank' ? <>{can('build') && <button className="btn" onClick={dup} title="Kopie als concept"><Copy size={16} />Kopie</button>}{planBtn}{pdfBtn}{can('bank') && <ConfirmBtn className="btn ghost" label={<><Trash2 size={16} />Verwijderen</>} confirm="Klik nogmaals om te verwijderen" title="Uit de opkomstenbank verwijderen" onConfirm={() => { setUnsaved(false); nav(`/s/${sid}/bouwer`); removeOpk(stored); }} />}</>
      : <>{bankBtn}<button className="btn" onClick={() => go(`/s/${sid}/jaarplanning?focus=${e ? e.id : ''}`)}><CalendarDays size={16} />Jaarplanning</button>{pdfBtn}</>;
  const w = whole.warn;
  return <div className="stack pt-5 md:pt-7" style={{ gap: 16 }}>
    <section className="plan-head">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0, display: 'grid', gap: 2 }}>
          {/* kop van de pagina voor schermlezers; de zichtbare titel is het invoerveld eronder */}
          <h1 className="sr-only">{kamp ? 'Weekendkamp' : 'Opkomst'}: {o.title.trim() || 'zonder titel'}</h1>
          <div className="row"><span className="eyebrow">{kamp ? 'Weekendkampplanner' : 'Opkomstbouwer'}</span>{kamp && <span className="pill kamp">Kamp</span>}{pill}{readOnly && <span className="pill neutral">Alleen lezen</span>}</div>
          <TitleArea value={o.title} readOnly={readOnly} onChange={v => upd(() => { o.title = v; if (e) savePlan({ ...e, topic: v }); })} placeholder={kamp ? 'Titel van het kamp' : 'Opkomst titel'} autoFocus={fresh && !readOnly} />
        </div>
        <div className="row">{actions}<button className="btn ghost" onClick={() => go(`/s/${sid}/bouwer`)} title="Nieuwe opkomst of weekendkamp"><Plus size={16} />Nieuw</button></div>
      </div>
      {o.state === 'planned' && e && <div className="ctx">{!readOnly && <button className="btn sm" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })}>Leiding indelen</button>}<span>Ingepland op <b>{fmtRange(e.date, e.endDate, true)}</b></span><span>week {isoWeek(e.date)}</span><span>planning door: <b>{plannersOf(e, o).join(', ') || 'nog niemand'}</b></span>
        {src && can('bank') && <span>uit de opkomstenbank: {src.title || 'naamloos'} · <ConfirmBtn className="linkbtn" label="bank bijwerken met deze versie" confirm="Klik nogmaals: bank overschrijven" onConfirm={updBank} /></span>}</div>}
      <div className="card">
        <button className="metatoggle" aria-expanded={metaOpen} aria-controls="om-meta" onClick={toggleMeta}>
          <ChevronRight size={18} className="chev" aria-hidden="true" /><b>Details</b>
          <span className="hint">{[!kamp && fmtT(o.start) + '–' + fmtT(o.end), o.location.trim(), o.cats.length ? plural(o.cats.length, 'categorie', 'categorieën') : '', e && plural(present.length, 'leiding', 'leiding') + ' aanwezig'].filter(Boolean).join(' · ')}</span></button>
        {metaOpen && <div className="meta" id="om-meta">
          <Field label="Korte beschrijving" htmlFor="om-short" className="wide"><textarea id="om-short" rows={2} value={o.short} readOnly={readOnly} onChange={ev => upd(() => { o.short = ev.target.value; })} placeholder={`Waar gaat ${kamp ? 'dit kamp' : 'deze opkomst'} over? Komt op het dashboard en in de bank.`} /></Field>
          <Field label={`Categorieën van ${kamp ? 'het kamp' : 'de opkomst'}`} className="wide">
            <div className="row" style={{ gap: 6 }}>{opkCatList(settings).map(c => <Chip key={c.id} on={o.cats.includes(c.id)} disabled={readOnly} onClick={() => upd(() => { o.cats = o.cats.includes(c.id) ? o.cats.filter(x => x !== c.id) : [...o.cats, c.id]; })}><Dot color={c.color} />{c.label}</Chip>)}</div></Field>
          <Field label="Speltak / groep" htmlFor="om-group"><input id="om-group" value={o.group} readOnly={readOnly} onChange={ev => upd(() => { o.group = ev.target.value; })} placeholder="bijv. Scouts" /></Field>
          <Field label="Locatie" htmlFor="om-loc" className="loc"><input id="om-loc" value={o.location} readOnly={readOnly} onChange={ev => upd(() => { o.location = ev.target.value; })} placeholder="bijv. Clubhuis" /></Field>
          {!kamp && <>
            <Field label="Begintijd" className="timefield"><TimePicker value={o.start} from={360} to={1430} disabled={readOnly} onChange={v => setTime('start', v)} /></Field>
            <Field label="Eindtijd" className="timefield"><TimePicker value={o.end} from={365} to={1435} disabled={readOnly} onChange={v => setTime('end', v)} /></Field>
            <Field label="Voorbereiding" hint={o.prep ? 'Leiding om ' + fmtT(o.start - o.prep) : 'Geen tijd vooraf'}><select value={o.prep} disabled={readOnly} onChange={ev => upd(() => { o.prep = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' vooraf' : ''}</option>)}</select></Field>
            <Field label="Nabespreking" hint={o.post ? 'Klaar om ' + fmtT(o.end + o.post) : 'Geen tijd achteraf'}><select value={o.post} disabled={readOnly} onChange={ev => upd(() => { o.post = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' achteraf' : ''}</option>)}</select></Field>
          </>}
        </div>}
        {kamp && <DaysBar o={o} di={di} setDayIdx={setDayIdx} upd={upd} date={e ? e.date : null} readOnly={readOnly} />}
        {e && metaOpen && <div className="present" role="group" aria-labelledby="om-present-l"><span className="lbl" id="om-present-l" style={{ marginRight: 6 }}>Aanwezige leiding</span>
          {leaders.length ? leaders.map(n => <Chip key={n} on={!e.absent.includes(n)} disabled={!can('plan')} onClick={() => { const en = { ...e, absent: e.absent.includes(n) ? e.absent.filter(x => x !== n) : [...e.absent, n] }; dropAbsent(en); savePlan(en); }}>{n}</Chip>) : <span className="hint">Nog geen leidingteam.</span>}
          {present.filter(n => !leaders.includes(n)).map(n => <Chip key={n} on disabled title="Met de hand ingedeeld">{n}</Chip>)}</div>}
      </div>
    </section>
    <div className="card">{narrow ? <div className="summary mini">
      <span>Nog vrij <b>{A.free ? fmtDur(A.free) : '0 min'}</b></span>
      <button className={'linkbtn' + (w ? ' warnc' : '')} onClick={() => toSide('check')}>{plural(w, 'aandachtspunt', 'aandachtspunten')}{kamp ? ' (kamp)' : ''}</button>
    </div> : <div className="summary">
      {kamp && <span className="stat">Dag<b>{(D as Day).label}</b></span>}
      <span className="stat">Duur<b>{fmtDur(A.total)}</b></span><span className="stat">Ingepland<b>{fmtDur(A.planned)}</b></span>
      <span className="stat">Nog vrij<b>{A.free ? fmtDur(A.free) : '0 min'}</b></span><span className="stat">Onderdelen<b>{D.blocks.length}</b></span>
      <span className="stat">Minimaal leiding<b>{minNeed(o)}</b></span>
      {!nn && <span className={'stat' + (minNeed(o) > A.present.length ? ' warnc' : '')}>Leiding{o.state === 'planned' ? ' aanwezig' : ''}<b>{A.present.length}</b></span>}
      <button className={'stat' + (w ? ' warnc' : '')} onClick={() => { setSelId(null); setSideTab('check'); }}><span>Aandachtspunten{kamp ? ' (kamp)' : ''}</span><b>{w}</b></button>
    </div>}<div style={{ padding: '0 16px 16px' }}><Strip o={D as Day} /></div></div>
    <div className="plan-main">
      <section className="card" aria-label="Tijdlijn">
        <div className="tl-top"><span className="eyebrow">Tijdlijn{kamp ? ' · ' + (D as Day).label : ''}</span>
          {!readOnly && <button ref={addRef} id="bf-add" className="btn sm" onClick={() => addAt(firstFree(D, 15) ?? firstFree(D, 5) ?? D.start)}><Plus size={14} />Onderdeel</button>}</div>
        <div className="tl-head"><span /><div className="cols3"><span>Programma-onderdeel</span><span className="cl">Locatie</span><span>{nn ? 'Minimaal leiding' : 'Verantwoordelijk'}</span></div></div>
        <div className="tl-scroll"><Timeline ctx={ctx} A={A} selId={selId} flashId={flashId} lanesRef={lanesRef} onSelect={select} onDelete={deleteBlock} onAdd={addAt} onChange={() => upd(() => {})} /></div>
        <div className="tl-foot">{readOnly ? 'Je kunt deze opkomst bekijken, maar niet aanpassen.' : 'Klik in de tijdlijn of gebruik + Onderdeel om iets toe te voegen.'}</div>
      </section>
      <aside ref={sideRef} className={'card side sheet' + (sel ? ' editing' : '')} aria-label="Zijpaneel">
        {sel ? <div ref={sheetRef} {...sheetProps}><Editor key={sel.id} b={sel} ctx={ctx} upd={upd} onClose={closeEditor} onDelete={() => deleteBlock(sel.id)} onDup={() => {
          const fits = sel.start + 2 * sel.dur <= T1; const c = { ...clone(sel), id: uid(), start: fits ? sel.start + sel.dur : sel.start };
          upd(() => { D.blocks.push(c); }); select(c.id); toast(fits ? 'Kopie direct erna gezet' : 'Kopie op dezelfde tijd gezet');
        }} saveLib={saveLib} /></div>
          : <SidePanel tab={sideTab} setTab={t => { setSideTab(t); if (window.matchMedia('(max-width: 900px)').matches) sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} ctx={ctx} A={whole} lanesRef={lanesRef} onSelect={select}
            onPlan={l => { const f = firstFree(D, Math.min(l.dur, D.end - D.start)); const b = insertLib(l, f == null ? D.start : f); showNew(b.id); toast(f == null ? 'Geen vrij moment lang genoeg; gezet op ' + fmtT(b.start) : 'Ingepland om ' + fmtT(b.start)); }}
            onDrop={(l, m) => { const b = insertLib(l, m); showNew(b.id); toast('Ingepland om ' + fmtT(b.start)); }} />}
      </aside>
      <div className={'scrim' + (sel ? ' on' : '')} onClick={closeEditor} />
    </div>
    {/* telefoon: de activiteitenbank staat onder de tijdlijn; deze knop brengt je er in één tik heen (niet bij bewerken uit de bank: daar staat de opslaan-balk onderin) */}
    {narrow && !readOnly && !sel && !sideSeen && !addLow && !draft && <button className="btn primary plan-fab" onClick={() => toSide('bank')}><Plus size={16} />Activiteit</button>}
    {draft && !readOnly && <SaveBar sticky dirty={dirty} title={o.title} taken={(n, c) => nameTaken(bankOpks, n, c ? null : o.id)} suggest={freeName(bankOpks, o.title || stored.title)} onCancel={cancelBank} onSave={saveBank} onCopy={copyBank} />}
  </div>;
}

/* ============ Dagen (kamp) ============ */
function DaysBar({ o, di, setDayIdx, upd, date, readOnly }: { o: Opk; di: number; setDayIdx: (i: number) => void; upd: (fn: () => void) => void; date: string | null; readOnly: boolean }) {
  const { settings } = useSpeltak();
  const d = o.days[di];
  const live = useRef({ o, upd }); live.current = { o, upd };
  const addDay = () => {
    const last = o.days[o.days.length - 1], li = DAYS.findIndex(x => x.toLowerCase() === (last.label || '').toLowerCase());
    const nd = normDay({ label: li >= 0 ? cap(DAYS[(li + 1) % 7]) : 'Dag ' + (o.days.length + 1), start: 480, end: 1380 }, o.days.length);
    upd(() => { o.days.push(nd); }); setDayIdx(o.days.length - 1);
  };
  const copyDay = () => { const nd = normDay(clone(d), di); nd.id = uid(); nd.label = d.label + ' (kopie)'; nd.blocks.forEach(b => b.id = uid()); upd(() => { o.days.splice(di + 1, 0, nd); }); setDayIdx(di + 1); toast('Dag gekopieerd met alle onderdelen'); };
  const delDay = () => {
    if (o.days.length < 2) return; const [rm] = o.days.splice(di, 1); const at = di;
    setDayIdx(Math.max(0, di - 1)); upd(() => {});
    // terugzetten in het kamp zoals het nú is (na het opslaan een nieuw object), wat je intussen aanpaste blijft staan
    toast(`${rm.label} verwijderd`, { label: 'Ongedaan maken', fn: () => {
      live.current.upd(() => { const cur = live.current.o; if (!cur.days.some(x => x.id === rm.id)) cur.days.splice(Math.min(at, cur.days.length), 0, rm); });
      setDayIdx(at);
    } });
  };
  const meals = () => {
    const pauze = settings.categories.find(c => /eten|maaltijd/i.test(c.label)) || settings.categories.find(c => /pauze/i.test(c.label));
    const list: [string, number, number][] = [['Ontbijt', 510, 30], ['Lunch', 750, 45], ['Avondeten', 1050, 60]]; let n = 0;
    upd(() => { list.forEach(([title, st, dur]) => { if (st < d.start || st + dur > d.end || d.blocks.some(b => b.title.toLowerCase() === title.toLowerCase())) return; d.blocks.push(normBlock({ title, start: st, dur, cat: pauze ? pauze.id : '', minLeaders: 1, pdfPage: false })); n++; }); });
    toast(n ? plural(n, 'maaltijd', 'maaltijden') + ' toegevoegd' : 'Geen maaltijden toegevoegd: ze staan er al of vallen buiten de tijden van deze dag.');
  };
  return <div className="daysbar">
    <div className="daytabs" role="tablist">{o.days.map((x, j) => <button key={x.id} className="daytab" role="tab" aria-selected={j === di} onClick={() => setDayIdx(j)}><b>{dayTitle(o, j, date ? addDays(date, j) : null)}</b><span>{fmtT(x.start)}–{fmtT(x.end)} · {x.blocks.length}</span></button>)}
      {!readOnly && <button className="daytab add" onClick={addDay} title="Dag toevoegen"><Plus size={14} />Dag</button>}</div>
    {!readOnly && <div className="dayedit">
      <Field label="Naam van de dag" htmlFor="dy-label"><input id="dy-label" value={d.label} onChange={ev => upd(() => { d.label = ev.target.value; })} placeholder="bijv. Zaterdag" /></Field>
      <Field label="Begin" className="timefield"><TimePicker value={d.start} from={0} to={1435} onChange={v => upd(() => { d.start = v; if (d.end <= v) d.end = Math.min(26 * 60, v + 60); })} /></Field>
      <Field label="Einde" className="timefield"><TimePicker value={d.end} from={d.start + 5} to={26 * 60} onChange={v => { if (v <= d.start) { toast('Het einde moet na het begin liggen.'); return; } upd(() => { d.end = v; }); }} /></Field>
      <div className="row dayacts"><button className="btn sm" onClick={meals}>Maaltijden toevoegen</button><button className="btn sm" onClick={copyDay}>Dag kopiëren</button>{o.days.length > 1 && <ConfirmBtn className="btn sm ghost" label="Dag verwijderen" confirm="Klik nogmaals: dag verwijderen" onConfirm={delDay} />}</div>
    </div>}
  </div>;
}

/* ============ Tijdlijn ============ */
function Timeline({ ctx, A, selId, flashId, lanesRef, onSelect, onDelete, onAdd, onChange }: { ctx: Ctx; A: Analysis; selId: string | null; flashId: string | null; lanesRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string, kb?: boolean) => void; onDelete: (id: string) => void; onAdd: (m: number) => void; onChange: () => void }) {
  const { settings } = useSpeltak();
  const { o, D, T0, T1, row, nn, readOnly } = ctx;
  const [, bump] = useState(0);
  const [ghost, setGhost] = useState<number | null>(null);
  // Slepen onthoudt alleen het id: na het opslaan vervangt de database de blokken door nieuwe objecten, dus steeds opnieuw opzoeken.
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; y0: number; s0: number; d0: number; moved: boolean } | null>(null);
  const live = useRef({ D, onChange }); live.current = { D, onChange };
  const suppress = useRef(false);
  const minuteAt = (clientY: number, dur = 5) => { const rect = lanesRef.current!.getBoundingClientRect(); const m = T0 + Math.floor((clientY - rect.top) / row) * 5; return Math.max(T0, Math.min(T1 - dur, m)); };
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dy = ev.clientY - d.y0; if (!d.moved && Math.abs(dy) < 4) return;
      const b = live.current.D.blocks.find(x => x.id === d.id); if (!b) return;
      d.moved = true; const steps = Math.round(dy / row) * 5;
      if (d.mode === 'move') b.start = Math.max(T0, Math.min(T1 - d.d0, d.s0 + steps)); else b.dur = Math.max(5, Math.min(T1 - b.start, d.d0 + steps));
      bump(x => x + 1);
    };
    const up = () => { const d = drag.current; if (!d) return; drag.current = null; document.body.style.userSelect = ''; if (d.moved) { suppress.current = true; setTimeout(() => { suppress.current = false; }, 0); live.current.onChange(); } bump(x => x + 1); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [T0, T1, row]);
  const pos = lanesLayout(D.blocks);
  // op volgorde van tijd in de pagina; verschuift het onderdeel met de focus (slepen), dan houdt het de focus
  useKeepFocus(lanesRef);
  const startDrag = (ev: React.PointerEvent, b: Block, mode: 'move' | 'resize', handle: boolean) => {
    if (readOnly || ev.button) return;
    if (ev.pointerType !== 'mouse' && !handle) return;
    drag.current = { id: b.id, mode, y0: ev.clientY, s0: b.start, d0: b.dur, moved: false };
    document.body.style.userSelect = 'none';
    if (handle) ev.preventDefault();
  };
  return <div className="tl">
    <Ticks T0={T0} T1={T1} row={row} />
    <div ref={lanesRef} className="lanes" style={lanesStyle(T0, T1, row)}
      onPointerMove={ev => { if (ev.target === ev.currentTarget && ev.pointerType === 'mouse' && !readOnly) setGhost(minuteAt(ev.clientY)); else if (ghost != null) setGhost(null); }}
      onPointerLeave={() => setGhost(null)}
      onClick={ev => { if (suppress.current || readOnly) return; const t = ev.target as HTMLElement; if (t === ev.currentTarget || t.classList.contains('slotghost')) onAdd(minuteAt(ev.clientY)); }}>
      <PrepZones o={o} T0={T0} row={row} />
      {byTime(D.blocks, pos).filter(b => b.start + b.dur > T0 && b.start < T1).map(b => {
        const g = blkGeom(pos[b.id], b, T0, row, b.id === selId), c = catOf(settings, b.cat);
        const cls = [...g.cls, drag.current?.id === b.id && drag.current.moved ? 'dragging' : '', b.id === flashId ? 'flash' : ''].join(' ');
        const under = b.minLeaders && b.names.length < b.minLeaders, mats = splitLines(b.materials).length;
        return <div key={b.id} className={cls} data-bid={b.id} tabIndex={0} role="button" aria-label={blkLabel(b, nn)}
          style={{ ['--c' as any]: c.color, ...g.style }}
          onPointerDown={ev => { const t = ev.target as HTMLElement; if (t.closest('.bdel')) return; const rs = !!t.closest('.rs'), grip = !!t.closest('.grip'); startDrag(ev, b, rs ? 'resize' : 'move', rs || grip); }}
          onClick={ev => { ev.stopPropagation(); if (suppress.current) return; onSelect(b.id); }}
          onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(b.id, true); } }}>
          <div className="cols3">
            <div className="c1"><span className="grip" title="Vastpakken om te verplaatsen" />
              <div className="t">{b.title || 'Naamloos onderdeel'}</div>
              <div className="when">{fmtT(b.start)}–{fmtT(b.start + b.dur)} · {fmtDur(b.dur)}</div>
              {b.short && <div className="sh">{b.short}</div>}
              <div className="locin">{b.location}</div>
              <div className="tags">
                {b.minLeaders ? (nn ? <span className="tag">min. {b.minLeaders} leiding</span> : <span className={'tag ' + (under ? 'bad' : 'ok')}>{b.names.length}/{b.minLeaders} leiding</span>) : null}
                {mats ? <span className="tag">{mats}× materiaal</span> : null}
                {b.pdfPage === false && <span className="tag soft">geen uitlegpagina</span>}
              </div>
            </div>
            <div className="cl">{b.location || <span className="nobody">–</span>}</div>
            <div className="c2"><div className="names">{nn ? (b.minLeaders ? <span className="nobody">min. {b.minLeaders} leiding</span> : null) : b.names.length ? b.names.map(n => <span key={n} className={'nm' + (A.clashes.has(b.id + '|' + n) ? ' clash' : '')}>{n}</span>) : <span className="nobody">nog niemand</span>}</div></div>
          </div>
          {/* prullenbak voor muis en aanraken; niet in de Tab-volgorde en niet voor schermlezers (een knop in een knop):
              met het toetsenbord verwijder je met Delete op het onderdeel of met Verwijderen in het bewerkpaneel */}
          {!readOnly && <button className="bdel" tabIndex={-1} aria-hidden="true" onClick={ev => { ev.stopPropagation(); onDelete(b.id); }} title="Onderdeel verwijderen"><Trash2 size={14} /></button>}
          {!readOnly && <div className="rs" title="Sleep om de duur te wijzigen" />}
        </div>;
      })}
      {ghost != null && !drag.current && <div className="slotghost" style={{ top: (ghost - T0) / 5 * row }}>+ {fmtT(ghost)}</div>}
      <div className="droprev" id="droprev" hidden />
    </div>
  </div>;
}

/* ============ Zijpaneel: bank en controle ============ */
function SidePanel({ tab, setTab, ctx, A, lanesRef, onSelect, onPlan, onDrop }: { tab: 'bank' | 'check'; setTab: (t: 'bank' | 'check') => void; ctx: Ctx; A: Analysis; lanesRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string, kb?: boolean) => void; onPlan: (l: Lib) => void; onDrop: (l: Lib, m: number) => void }) {
  const { settings, lib, leaders } = useSpeltak();
  const { o, T0, T1, row, nn, readOnly } = ctx;
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const [float, setFloat] = useState<{ l: Lib; x: number; y: number } | null>(null);
  const ld = useRef<{ l: Lib; x0: number; y0: number; started: boolean; m: number | null } | null>(null);
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = ld.current; if (!d) return;
      if (!d.started && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
      d.started = true; setFloat({ l: d.l, x: ev.clientX, y: ev.clientY });
      const lanes = lanesRef.current, pr = document.getElementById('droprev'); if (!lanes || !pr) return;
      const r = lanes.getBoundingClientRect(), over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 10 && ev.clientY <= r.bottom + 10;
      if (over) {
        const dur = Math.min(d.l.dur, T1 - T0), m = Math.max(T0, Math.min(T1 - dur, T0 + Math.floor((ev.clientY - r.top) / row) * 5));
        pr.hidden = false; pr.style.top = (m - T0) / 5 * row + 'px'; pr.style.height = (dur / 5 * row - 3) + 'px'; pr.textContent = fmtT(m) + '–' + fmtT(m + dur); lanes.classList.add('dropping'); d.m = m;
      } else { pr.hidden = true; lanes.classList.remove('dropping'); d.m = null; }
      if (ev.clientY < 80) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 50) window.scrollBy(0, 14);
    };
    const up = () => {
      const d = ld.current; if (!d) return; ld.current = null; setFloat(null); document.body.style.userSelect = '';
      const lanes = lanesRef.current, pr = document.getElementById('droprev'); if (pr) pr.hidden = true; lanes?.classList.remove('dropping');
      if (d.started && d.m != null) onDrop(d.l, d.m);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [T0, T1, row, onDrop]);
  const tabs = <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'bank'} onClick={() => setTab('bank')}>Activiteitenbank</button><button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>Controle</button></div>;
  if (tab === 'bank') {
    const ql = q.toLowerCase(), items = lib.filter(l => (!cat || l.cat === cat) && (!ql || libSearchText(l).includes(ql))).sort(byTitle);
    return <>{tabs}<div className="pad stack">
      <div className="row"><input className="inp" type="search" placeholder="Zoek activiteit" aria-label="Zoek activiteit" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 140px' }} />
        <select className="inp" aria-label="Categorie" value={cat} onChange={e => setCat(e.target.value)} style={{ flex: '1 1 120px' }}><option value="">Alle categorieën</option>{settings.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
      <div className="libs">{items.length ? items.map(l => <div key={l.id} className="lib lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5" style={{ ['--c' as any]: catOf(settings, l.cat).color }}
        onPointerDown={ev => { if (readOnly || ev.button || (ev.target as HTMLElement).closest('button')) return; const grip = !!(ev.target as HTMLElement).closest('.lgrip'); if (ev.pointerType !== 'mouse' && !grip) return; ld.current = { l, x0: ev.clientX, y0: ev.clientY, started: false, m: null }; document.body.style.userSelect = 'none'; if (grip) ev.preventDefault(); }}>
        <span className="lgrip" title="Sleep naar de tijdlijn" />
        <div style={{ minWidth: 0 }}><div className="lt">{l.title || 'Naamloos'}</div><div className="lm">{fmtDur(l.dur)}{l.minLeaders > 0 ? ` · min. ${l.minLeaders} leiding` : ''}{l.location ? ' · ' + l.location : ''}</div>{l.short && <div className="ls">{l.short}</div>}</div>
        {!readOnly && <button className="btn sm" onClick={() => onPlan(l)} title="Op het eerste vrije moment inplannen">Inplannen</button>}
      </div>) : <p className="hint">{lib.length ? 'Geen activiteiten gevonden.' : 'Nog geen activiteiten.'}</p>}</div>
    </div>
      {float && <div className="drag-float" style={{ left: float.x, top: float.y }}>{(float.l.title || 'Naamloos') + ' · ' + fmtDur(float.l.dur)}</div>}</>;
  }
  const people = Object.entries(A.per).sort((a, b) => a[0].localeCompare(b[0], 'nl')), free = A.present.filter(n => !A.per[n]);
  const warns = A.issues.filter(i => i.lvl === 'warn'), tips = A.issues.filter(i => i.lvl !== 'warn');
  const issueList = (list: Analysis['issues']) => <ul className="issues">{list.map((i, k) => <li key={k} className={i.lvl}><i />{i.id ? <button className="linkbtn" onClick={ev => onSelect(i.id!, ev.detail === 0)}>{i.text}</button> : <span>{i.text}</span>}</li>)}</ul>;
  return <>{tabs}<div className="pad stack">
    {/* aandachtspunten (telt mee in de teller) en wat nog aangevuld kan worden apart: het niveau staat in de kop, niet alleen in de kleur van de stip */}
    <h3>Aandachtspunten</h3>
    {warns.length ? issueList(warns) : <p className="hint">{tips.length ? 'Geen aandachtspunten.' : 'Alles in orde.'}</p>}
    {tips.length > 0 && <><h3 className="gap-lg">Nog aanvullen</h3>{issueList(tips)}</>}
    {nn ? <p className="hint">Minimaal {minNeed(o)} leiding nodig: het onderdeel dat de meeste leiding vraagt bepaalt dit.</p> : <>
      <h3 className="gap-lg">Taken per leiding</h3>
      {people.length ? <ul className="who-list">{people.map(([n, arr]) => <li key={n}><b>{n}{A.present.includes(n) || !leaders.includes(n) ? '' : <> <span className="pill warn">afwezig</span></>}</b>
        <span className="what">{[...arr].sort((a, b) => (a._di || 0) - (b._di || 0) || a.start - b.start).map((x, k) => <span key={k}>{x._day ? x._day.slice(0, 2).toLowerCase() + ' ' : ''}{fmtT(x.start)}–{fmtT(x.start + x.dur)} {x.title || 'naamloos'}<br /></span>)}</span></li>)}</ul> : <p className="hint">Nog niemand ingedeeld.</p>}
      {free.length > 0 && <p className="hint">Zonder taak: {free.join(', ')}</p>}
    </>}
  </div></>;
}

/* ============ Onderdeel bewerken ============ */
function Editor({ b, ctx, upd, onClose, onDelete, onDup, saveLib }: { b: Block; ctx: Ctx; upd: (fn: () => void) => void; onClose: () => void; onDelete: () => void; onDup: () => void; saveLib: (l: Lib) => void }) {
  const { settings, leaders, lib, getL, entryOfOpk, can } = useSpeltak();
  const { o, T0, T1, nn, present, readOnly } = ctx;
  const maxDur = Math.max(5, T1 - b.start); const durs: number[] = []; for (let d = 5; d <= Math.max(maxDur, b.dur); d += 5) durs.push(d);
  const extras = b.names.filter(n => !leaders.includes(n)), L = b.libId ? getL(b.libId) : undefined;
  const [extraTxt, setExtraTxt] = useState(extras.join(', '));
  const setExtras = (txt: string, final: boolean) => {
    setExtraTxt(txt);
    const e = o.state === 'planned' ? entryOfOpk(o) : null, abs = e ? e.absent : [];
    const typed = splitNames(txt).filter(n => !leaders.includes(n)), blocked = typed.filter(n => abs.includes(n));
    if (blocked.length && final) toast(blocked.join(', ') + ' is afwezig en wordt niet ingedeeld.');
    upd(() => { b.names = [...b.names.filter(n => leaders.includes(n)), ...typed.filter(n => !abs.includes(n))]; });
  };
  const toLib = () => {
    if (!b.title.trim()) { toast('Geef het onderdeel eerst een naam.'); document.getElementById('bf-title')?.focus(); return; }
    withFreeName(b.title, {
      title: 'Andere naam kiezen', sub: `"${b.title.trim()}" staat al in de activiteitenbank. Geef de activiteit een andere naam.`, label: 'Titel van de activiteit', okLabel: 'Bewaren in activiteitenbank',
      suggest: freeName(lib, b.title), taken: n => nameTaken(lib, n),
      ok: name => { const l = { ...normLib({ id: uid() }), ...libFields(b), title: name }; saveLib(l); upd(() => { b.title = name; b.libId = l.id; }); toast('Opgeslagen in de activiteitenbank'); },
    });
  };
  const updLib = () => {
    if (!L) return;
    if (nameTaken(lib, b.title, L.id)) { toast(`"${b.title.trim()}" bestaat al in de activiteitenbank. Geef het onderdeel eerst een andere naam.`); return; }
    saveLib({ ...L, ...libFields(b) }); toast('Activiteitenbank bijgewerkt');
  };
  const ro = readOnly;
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><div><span className="eyebrow">Onderdeel</span><div className="mono muted" style={{ fontSize: 13 }}>{fmtT(b.start)} – {fmtT(b.start + b.dur)}</div></div>
      <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>{!ro && <button className="iconbtn danger" onClick={onDelete} title="Onderdeel verwijderen" aria-label="Onderdeel verwijderen"><Trash2 size={16} /></button>}<button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div></div>
    <Field label="Programma-onderdeel" htmlFor="bf-title"><input id="bf-title" value={b.title} readOnly={ro} onChange={e => upd(() => { b.title = e.target.value; })} placeholder="bijv. Kompasposten" /></Field>
    <div className="two">
      <Field label="Begin" className="timefield"><TimePicker value={b.start} from={T0} to={T1 - 5} extra disabled={ro} onChange={v => upd(() => { b.start = v; b.dur = Math.max(5, Math.min(b.dur, T1 - b.start)); })} /></Field>
      <Field label="Duur" htmlFor="bf-dur"><select id="bf-dur" value={b.dur} disabled={ro} onChange={e => upd(() => { b.dur = +e.target.value; })}>{durs.map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
    </div>
    <div className="two">{isFixed(b) ? <div className="field"><span className="lbl">Soort</span><span className="pill neutral" style={{ justifySelf: 'start' }}>{catOf(settings, b.cat).label}</span></div> : <CatSelect prefix="bf" value={b.cat} disabled={ro} onChange={id => upd(() => { b.cat = id; })} />}
      <Field label="Minimaal aantal leiding" htmlFor="bf-min"><NumInput id="bf-min" min={0} max={30} readOnly={ro} value={b.minLeaders} onChange={n => upd(() => { b.minLeaders = n; })} /></Field></div>
    <Field label="Locatie" htmlFor="bf-loc"><LocInput id="bf-loc" value={b.location} readOnly={ro} onChange={v => upd(() => { b.location = v; })} placeholder="bijv. Grasveld" /></Field>
    {nn ? <div className="field"><span className="lbl">Verantwoordelijk</span><span className="hint">Deel je in bij het inplannen.</span></div> : <div className="field"><span className="lbl" id="bf-who-l">Verantwoordelijk</span>
      <div className="row" style={{ gap: 6 }} role="group" aria-labelledby="bf-who-l">{leaders.length ? leaders.map(n => present.includes(n) ? <Chip key={n} on={b.names.includes(n)} disabled={ro} onClick={() => upd(() => { b.names = b.names.includes(n) ? b.names.filter(x => x !== n) : [...b.names, n]; })}>{n}</Chip>
        : <Chip key={n} className="absent" disabled title="Afwezig volgens de jaarplanning">{n} · afwezig</Chip>) : <span className="hint">Nog geen leidingteam.</span>}</div>
      <input className="inp" aria-label="Andere namen" value={extraTxt} readOnly={ro} onChange={e => setExtras(e.target.value, false)} onBlur={e => setExtras(e.target.value, true)} placeholder="Andere namen, gescheiden door komma's" />
      <span className="hint">{b.minLeaders ? `${b.names.length} van minimaal ${b.minLeaders} ingedeeld` : 'Geen minimum ingesteld'}</span></div>}
    <Field label="Korte beschrijving" htmlFor="bf-short"><textarea id="bf-short" rows={2} readOnly={ro} value={b.short} onChange={e => upd(() => { b.short = e.target.value; })} placeholder="Eén of twee zinnen; komt in de tijdlijn en op pagina 1" /></Field>
    <label className="toggle"><input type="checkbox" checked={b.pdfPage !== false} disabled={ro} onChange={e => upd(() => { b.pdfPage = e.target.checked; })} /><span><b>Uitlegpagina in de pdf</b></span></label>
    <Field label="Uitgebreide beschrijving" htmlFor="bf-desc"><textarea id="bf-desc" rows={6} readOnly={ro} value={b.desc} onChange={e => upd(() => { b.desc = e.target.value; })} placeholder="Hoe gaat het spel, wat is de opzet, waar let je op?" /></Field>
    <Field label="Voorbereiding" htmlFor="bf-prep"><textarea id="bf-prep" rows={3} readOnly={ro} value={b.prep} onChange={e => upd(() => { b.prep = e.target.value; })} placeholder="Wat moet er vooraf gebeuren?" /></Field>
    <Field label="Materiaal om te halen" htmlFor="bf-mat"><textarea id="bf-mat" rows={4} readOnly={ro} value={b.materials} onChange={e => upd(() => { b.materials = e.target.value; })} placeholder="Eén ding per regel" /></Field>
    {!ro && can('bank') && <div className="banknote">{L ? <><span>Uit de activiteitenbank</span><div className="row"><button className="btn sm" onClick={updLib}>Bank bijwerken</button><button className="btn sm ghost" onClick={toLib}>Als nieuwe bewaren</button></div></>
      : <div className="row"><button className="btn sm" onClick={toLib}><Bookmark size={14} />Bewaren in activiteitenbank</button></div>}</div>}
    {!ro && <div className="row"><button className="btn" onClick={onDup}><Copy size={16} />Dupliceren</button><button className="btn danger" onClick={onDelete}><Trash2 size={16} />Verwijderen</button></div>}
  </div>;
}
