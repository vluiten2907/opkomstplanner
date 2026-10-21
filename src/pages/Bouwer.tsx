import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bookmark, CalendarDays, Copy, Download, Plus, Tent, Trash2, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { Strip, PickOpk, usePdf, PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field, TimePicker } from '../components/ui';
import { cap, clone, fmtDur, fmtRange, fmtT, isoWeek, plural, splitLines, splitNames, uid, DAYS } from '../lib/time';
import { addDaysSafe, allBlocks, analyze, analyzeOne, blockFromLib, byTitle, catOf, copyOpk, dayTitle, isFixed, isKamp, lanesLayout, minNeed, newKamp, newOpk, normBlock, normDay, normLib, normOpk, opkCatList, prepLabel, setOpkTime, syncKamp, LIB_FIELDS, PREP_OPTS, SWATCHES, type Analysis, type Block, type Day, type Lib, type Opk } from '../lib/model';

/* ============ Startscherm ============ */
export default function Bouwer() {
  const { oid } = useParams();
  const { opks, settings, saveOpk, sid, can, getO } = useSpeltak();
  const nav = useNavigate();
  const o = oid ? getO(oid) : undefined;
  if (oid && o) return <Builder key={o.id} o={o} />;
  const bank = opks.filter(x => x.state === 'bank').sort(byTitle), drafts = opks.filter(x => x.state === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const create = (kamp: boolean) => { const n = kamp ? newKamp(settings, 3) : newOpk(settings); saveOpk(n); nav(`/s/${sid}/bouwer/${n.id}`); };
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title="Opkomstbouwer" />
    {oid && !o && <div className="ctx">Deze opkomst bestaat niet (meer).</div>}
    {can('build') && <div className="row"><button className="btn primary" onClick={() => create(false)}><Plus size={16} />Nieuwe opkomst</button><button className="btn" onClick={() => create(true)}><Tent size={16} />Weekendkamp</button></div>}
    {drafts.length > 0 && <><h2>Concepten</h2><div className="picklist">{drafts.map(x => <PickOpk key={x.id} o={x} label="Openen" onPick={() => nav(`/s/${sid}/bouwer/${x.id}`)} />)}</div></>}
    {bank.length > 0 && <><h2>Uit de opkomstenbank</h2><div className="picklist">{bank.map(x => <PickOpk key={x.id} o={x} label="Openen" onPick={() => nav(`/s/${sid}/bouwer/${x.id}`)} />)}</div></>}
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

function Builder({ o }: { o: Opk }) {
  const S = useSpeltak();
  const { settings, leaders, lib, saveOpk, savePlan, saveLib, entryOfOpk, presentFor, getO, sid, can, dropAbsent } = S;
  const nav = useNavigate(); const pdf = usePdf();
  const [, bump] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'bank' | 'check'>('bank');
  const lanesRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const readOnly = !can('build') && !(o.state === 'bank' && can('bank'));
  const kamp = isKamp(o), row = useRowHeight(kamp);
  const di = Math.min(dayIdx, o.days.length - 1);
  const D = kamp ? o.days[di] : o;
  const T0 = kamp ? D.start : o.start - (o.prep || 0), T1 = kamp ? D.end : o.end + (o.post || 0);
  const e = o.state === 'planned' ? entryOfOpk(o) : null, src = o.srcId ? getO(o.srcId) : undefined;
  const nn = o.state === 'bank', present = presentFor(o);
  const ctx: Ctx = { o, D, T0, T1, row, nn, present, readOnly };
  const upd = (fn: () => void) => { if (readOnly) return; fn(); if (kamp) syncKamp(o); saveOpk({ ...o }); bump(x => x + 1); };
  const A = kamp ? analyzeOne(D as Day, present, leaders, nn) : analyze(o, present, leaders);
  const whole = kamp ? analyze(o, present, leaders) : A;
  const sel = selId ? allBlocks(o).find(b => b.id === selId) || null : null;
  useEffect(() => { if (selId && !sel) setSelId(null); }, [selId, sel]);
  const select = (id: string | null) => {
    if (id && kamp) { const k = o.days.findIndex(d => d.blocks.some(b => b.id === id)); if (k >= 0 && k !== di) setDayIdx(k); }
    setSelId(id); if (id && sideRef.current) sideRef.current.scrollTop = 0;
  };
  const deleteBlock = (id: string) => {
    const list = kamp ? (o.days.find(d => d.blocks.some(x => x.id === id)) || { blocks: [] as Block[] }).blocks : o.blocks;
    const i = list.findIndex(b => b.id === id); if (i < 0) return;
    const [b] = list.splice(i, 1); if (selId === id) setSelId(null);
    upd(() => {});
    toast(`"${b.title || 'Naamloos onderdeel'}" verwijderd`, { label: 'Ongedaan maken', fn: () => { list.splice(Math.min(i, list.length), 0, b); saveOpk({ ...o }); bump(x => x + 1); } });
  };
  const firstFree = (dur: number) => { const bl = [...D.blocks].sort((a, b) => a.start - b.start); let t = D.start; for (const b of bl) { if (b.start - t >= dur) return t; t = Math.max(t, b.start + b.dur); } return D.end - t >= dur ? t : null; };
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
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (ev.key === 'Escape' && selId) { setSelId(null); return; }
      const onBlk = document.activeElement?.classList.contains('blk');
      if ((ev.key === 'Delete' || (ev.key === 'Backspace' && (tag === 'BODY' || onBlk))) && selId && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.querySelector('.modal')) { ev.preventDefault(); deleteBlock(selId); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });
  const pill = o.state === 'bank' ? <span className="pill good">In opkomstenbank</span> : o.state === 'planned' ? <span className="pill acc">Ingepland</span> : <span className="pill neutral">Concept</span>;
  const toBank = () => {
    if (!allBlocks(o).length && !o.title) { toast('Geef de opkomst eerst een titel of een onderdeel.'); return; }
    if (o.state === 'draft') { upd(() => { o.state = 'bank'; o.lead = ''; allBlocks(o).forEach(b => b.names = []); }); toast('Opgeslagen in de opkomstenbank, zonder namen van leiding'); return; }
    const b = copyOpk(o); b.state = 'bank'; b.srcId = null; b.lead = ''; allBlocks(b).forEach(x => x.names = []);
    saveOpk(b); upd(() => { o.srcId = b.id; }); toast('Kopie opgeslagen in de opkomstenbank, zonder leiding');
  };
  const dup = () => { const c = copyOpk(o); c.state = 'draft'; c.srcId = null; c.title = (o.title || 'Opkomst') + ' (kopie)'; saveOpk(c); nav(`/s/${sid}/bouwer/${c.id}`); toast('Kopie gemaakt'); };
  const updBank = () => {
    if (!src) return; const fresh = normOpk(clone(o)); allBlocks(fresh).forEach(b => b.names = []);
    saveOpk({ ...src, cats: [...o.cats], kind: fresh.kind, title: o.title, short: o.short, group: o.group, location: o.location, start: o.start, end: o.end, prep: o.prep, post: o.post, blocks: fresh.blocks, days: fresh.days });
    toast('Opkomstenbank bijgewerkt');
  };
  const pdfBtn = <button className="btn primary" onClick={() => pdf(o)}><Download size={16} />PDF maken</button>;
  const actions = readOnly ? pdfBtn : o.state === 'draft' ? <><button className="btn" onClick={toBank}><Bookmark size={16} />In bank</button><button className="btn" onClick={() => openModal({ kind: 'toplan', oid: o.id })}><CalendarDays size={16} />Inplannen</button>{pdfBtn}</>
    : o.state === 'bank' ? <><button className="btn" onClick={dup}><Copy size={16} />Kopie</button><button className="btn" onClick={() => openModal({ kind: 'toplan', oid: o.id })}><CalendarDays size={16} />Inplannen</button>{pdfBtn}</>
      : <><button className="btn" onClick={toBank}><Bookmark size={16} />In bank</button><button className="btn" onClick={() => nav(`/s/${sid}/jaarplanning?focus=${e ? e.id : ''}`)}><CalendarDays size={16} />Jaarplanning</button>{pdfBtn}</>;
  const w = whole.warn;
  return <div className="stack pt-5 md:pt-7" style={{ gap: 16 }}>
    <section className="plan-head">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0, display: 'grid', gap: 2 }}>
          <div className="row"><span className="eyebrow">{kamp ? 'Weekendkampplanner' : 'Opkomstbouwer'}</span>{kamp && <span className="pill kamp">Kamp</span>}{pill}{readOnly && <span className="pill neutral">Alleen lezen</span>}</div>
          <input id="om-title" value={o.title} readOnly={readOnly} onChange={ev => upd(() => { o.title = ev.target.value; if (e) savePlan({ ...e, topic: ev.target.value }); })} aria-label="Opkomst titel" placeholder={kamp ? 'Titel van het kamp' : 'Opkomst titel'} />
        </div>
        <div className="row">{actions}<button className="btn ghost" onClick={() => nav(`/s/${sid}/bouwer`)} title="Nieuwe opkomst of weekendkamp"><Plus size={16} />Nieuw</button></div>
      </div>
      {o.state === 'planned' && e && <div className="ctx">{!readOnly && <button className="btn sm" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })}>Leiding indelen</button>}<span>eindverantwoordelijke: <b>{o.lead || 'nog niet gekozen'}</b></span>Ingepland op <b>{fmtRange(e.date, e.endDate, true)}</b><span>week {isoWeek(e.date)}</span><span>planning: {e.planners.length ? e.planners.join(', ') : 'nog niemand'}</span>
        {src && can('bank') && <span>uit de opkomstenbank: {src.title || 'naamloos'} · <ConfirmBtn className="linkbtn" label="bank bijwerken met deze versie" confirm="Klik nogmaals: bank overschrijven" onConfirm={updBank} /></span>}</div>}
      <div className="card">
        <div className="meta">
          <Field label="Korte beschrijving" htmlFor="om-short" className="wide"><textarea id="om-short" rows={2} value={o.short} readOnly={readOnly} onChange={ev => upd(() => { o.short = ev.target.value; })} placeholder="Waar gaat deze opkomst over? Komt op het dashboard en in de bank." /></Field>
          <div className="field wide"><span className="lbl">Categorieën van de {kamp ? 'activiteit' : 'opkomst'}</span>
            <div className="row" style={{ gap: 6 }}>{opkCatList(settings).map(c => <Chip key={c.id} on={o.cats.includes(c.id)} disabled={readOnly} onClick={() => upd(() => { o.cats = o.cats.includes(c.id) ? o.cats.filter(x => x !== c.id) : [...o.cats, c.id]; })}><Dot color={c.color} />{c.label}</Chip>)}</div></div>
          <Field label="Speltak / groep" htmlFor="om-group"><input id="om-group" value={o.group} readOnly={readOnly} onChange={ev => upd(() => { o.group = ev.target.value; })} placeholder="bijv. Scouts" /></Field>
          <Field label="Locatie" htmlFor="om-loc"><input id="om-loc" value={o.location} readOnly={readOnly} onChange={ev => upd(() => { o.location = ev.target.value; })} placeholder="bijv. Clubhuis" /></Field>
          {!kamp && <>
            <Field label="Begintijd" className="timefield"><TimePicker value={o.start} from={360} to={1430} onChange={v => upd(() => { const m = setOpkTime(o, 'start', v); if (m) toast(m); })} /></Field>
            <Field label="Eindtijd" className="timefield"><TimePicker value={o.end} from={365} to={1435} onChange={v => { const m = setOpkTime(o, 'end', v); if (m) { toast(m); return; } upd(() => {}); }} /></Field>
            <Field label="Voorbereiding" hint={o.prep ? 'Leiding om ' + fmtT(o.start - o.prep) : 'Geen tijd vooraf'}><select value={o.prep} disabled={readOnly} onChange={ev => upd(() => { o.prep = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' vooraf' : ''}</option>)}</select></Field>
            <Field label="Nabespreking" hint={o.post ? 'Klaar om ' + fmtT(o.end + o.post) : 'Geen tijd achteraf'}><select value={o.post} disabled={readOnly} onChange={ev => upd(() => { o.post = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' achteraf' : ''}</option>)}</select></Field>
          </>}
        </div>
        {kamp && <DaysBar o={o} di={di} setDayIdx={setDayIdx} upd={upd} date={e ? e.date : null} readOnly={readOnly} />}
        {e && <div className="present"><span className="lbl" style={{ marginRight: 6 }}>Aanwezige leiding</span>
          {leaders.length ? leaders.map(n => <Chip key={n} on={!e.absent.includes(n)} disabled={!can('plan')} onClick={() => { const en = { ...e, absent: e.absent.includes(n) ? e.absent.filter(x => x !== n) : [...e.absent, n] }; dropAbsent(en); savePlan(en); }}>{n}</Chip>) : <span className="hint">Nog geen leidingteam.</span>}
          {present.filter(n => !leaders.includes(n)).map(n => <Chip key={n} on disabled title="Met de hand ingedeeld">{n}</Chip>)}</div>}
      </div>
    </section>
    <div className="card"><div className="summary">
      {kamp && <span className="stat">Dag<b>{(D as Day).label}</b></span>}
      <span className="stat">Duur<b>{fmtDur(A.total)}</b></span><span className="stat">Ingepland<b>{fmtDur(A.planned)}</b></span>
      <span className="stat">Nog vrij<b>{A.free ? fmtDur(A.free) : '0 min'}</b></span><span className="stat">Onderdelen<b>{D.blocks.length}</b></span>
      <span className="stat">Minimaal leiding<b>{minNeed(o)}</b></span>
      {!nn && <span className={'stat' + (minNeed(o) > A.present.length ? ' warnc' : '')}>Leiding{o.state === 'planned' ? ' aanwezig' : ''}<b>{A.present.length}</b></span>}
      <button className={'stat' + (w ? ' warnc' : '')} style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => { setSelId(null); setSideTab('check'); }}>Aandachtspunten{kamp ? ' (kamp)' : ''}<b>{w}</b></button>
    </div><div style={{ padding: '0 16px 16px' }}><Strip o={D as Day} /></div></div>
    <div className="plan-main">
      <section className="card" aria-label="Tijdlijn">
        <div className="tl-head"><span /><div className="cols3"><span>Programma-onderdeel</span><span className="cl">Locatie</span><span>{nn ? 'Minimaal leiding' : 'Verantwoordelijk'}</span></div></div>
        <div className="tl-scroll"><Timeline ctx={ctx} A={A} selId={selId} lanesRef={lanesRef} onSelect={select} onDelete={deleteBlock} onAdd={addAt} onChange={() => upd(() => {})} /></div>
        <div className="tl-foot">{readOnly ? 'Je kunt deze opkomst bekijken, maar niet aanpassen.' : 'Klik in de tijdlijn om iets toe te voegen.'}</div>
      </section>
      <aside ref={sideRef} className={'card side sheet' + (sel ? ' editing' : '')} aria-label="Zijpaneel">
        {sel ? <Editor key={sel.id} b={sel} ctx={ctx} upd={upd} onClose={() => setSelId(null)} onDelete={() => deleteBlock(sel.id)} onDup={() => {
          const fits = sel.start + 2 * sel.dur <= T1; const c = { ...clone(sel), id: uid(), start: fits ? sel.start + sel.dur : sel.start };
          upd(() => { D.blocks.push(c); }); select(c.id); toast(fits ? 'Kopie direct erna gezet' : 'Kopie op dezelfde tijd gezet');
        }} saveLib={saveLib} />
          : <SidePanel tab={sideTab} setTab={t => { setSideTab(t); if (window.matchMedia('(max-width: 900px)').matches) sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} ctx={ctx} A={whole} lanesRef={lanesRef} onSelect={select}
            onPlan={l => { const f = firstFree(Math.min(l.dur, D.end - D.start)); const b = insertLib(l, f == null ? D.start : f); toast(f == null ? 'Geen vrij moment lang genoeg; gezet op ' + fmtT(b.start) : 'Ingepland om ' + fmtT(b.start)); }}
            onDrop={(l, m) => { const b = insertLib(l, m); toast('Ingepland om ' + fmtT(b.start)); }} />}
      </aside>
      <div className={'scrim' + (sel ? ' on' : '')} onClick={() => setSelId(null)} />
    </div>
  </div>;
}

/* ============ Dagen (kamp) ============ */
function DaysBar({ o, di, setDayIdx, upd, date, readOnly }: { o: Opk; di: number; setDayIdx: (i: number) => void; upd: (fn: () => void) => void; date: string | null; readOnly: boolean }) {
  const { settings, saveOpk } = useSpeltak();
  const d = o.days[di];
  const addDay = () => {
    const last = o.days[o.days.length - 1], li = DAYS.findIndex(x => x.toLowerCase() === (last.label || '').toLowerCase());
    const nd = normDay({ label: li >= 0 ? cap(DAYS[(li + 1) % 7]) : 'Dag ' + (o.days.length + 1), start: 480, end: 1380 }, o.days.length);
    upd(() => { o.days.push(nd); }); setDayIdx(o.days.length - 1);
  };
  const copyDay = () => { const nd = normDay(clone(d), di); nd.id = uid(); nd.label = d.label + ' (kopie)'; nd.blocks.forEach(b => b.id = uid()); upd(() => { o.days.splice(di + 1, 0, nd); }); setDayIdx(di + 1); toast('Dag gekopieerd met alle onderdelen'); };
  const delDay = () => {
    if (o.days.length < 2) return; const [rm] = o.days.splice(di, 1); const at = di;
    setDayIdx(Math.max(0, di - 1)); upd(() => {});
    toast(`${rm.label} verwijderd`, { label: 'Ongedaan maken', fn: () => { o.days.splice(at, 0, rm); syncKamp(o); saveOpk({ ...o }); setDayIdx(at); } });
  };
  const meals = () => {
    const pauze = settings.categories.find(c => /eten|maaltijd/i.test(c.label)) || settings.categories.find(c => /pauze/i.test(c.label));
    const list: [string, number, number][] = [['Ontbijt', 510, 30], ['Lunch', 750, 45], ['Avondeten', 1050, 60]]; let n = 0;
    upd(() => { list.forEach(([title, st, dur]) => { if (st < d.start || st + dur > d.end || d.blocks.some(b => b.title.toLowerCase() === title.toLowerCase())) return; d.blocks.push(normBlock({ title, start: st, dur, cat: pauze ? pauze.id : '', minLeaders: 1, pdfPage: false })); n++; }); });
    toast(n ? plural(n, 'maaltijd', 'maaltijden') + ' toegevoegd' : 'Geen maaltijden toegevoegd: ze staan er al of vallen buiten de tijden van deze dag.');
  };
  return <div className="daysbar">
    <div className="daytabs" role="tablist">{o.days.map((x, j) => <button key={x.id} className="daytab" role="tab" aria-selected={j === di} onClick={() => setDayIdx(j)}><b>{dayTitle(o, j, date ? addDaysSafe(date, j) : null)}</b><span>{fmtT(x.start)}–{fmtT(x.end)} · {x.blocks.length}</span></button>)}
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
function Timeline({ ctx, A, selId, lanesRef, onSelect, onDelete, onAdd, onChange }: { ctx: Ctx; A: Analysis; selId: string | null; lanesRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string) => void; onDelete: (id: string) => void; onAdd: (m: number) => void; onChange: () => void }) {
  const { settings } = useSpeltak();
  const { o, D, T0, T1, row, nn, readOnly } = ctx;
  const [, bump] = useState(0);
  const [ghost, setGhost] = useState<number | null>(null);
  const drag = useRef<{ b: Block; mode: 'move' | 'resize'; y0: number; s0: number; d0: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const H = (T1 - T0) / 5 * row, long = T1 - T0 > 480;
  const minuteAt = (clientY: number, dur = 5) => { const rect = lanesRef.current!.getBoundingClientRect(); const m = T0 + Math.floor((clientY - rect.top) / row) * 5; return Math.max(T0, Math.min(T1 - dur, m)); };
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dy = ev.clientY - d.y0; if (!d.moved && Math.abs(dy) < 4) return;
      d.moved = true; const steps = Math.round(dy / row) * 5;
      if (d.mode === 'move') d.b.start = Math.max(T0, Math.min(T1 - d.d0, d.s0 + steps)); else d.b.dur = Math.max(5, Math.min(T1 - d.b.start, d.d0 + steps));
      bump(x => x + 1);
    };
    const up = () => { const d = drag.current; if (!d) return; drag.current = null; document.body.style.userSelect = ''; if (d.moved) { suppress.current = true; setTimeout(() => { suppress.current = false; }, 0); onChange(); } bump(x => x + 1); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [T0, T1, row, onChange]);
  const ticks: ReactNode[] = [];
  for (let m = T0; m <= T1; m += 5) { if (m % (long ? 30 : 15) !== 0 && m !== T0 && m !== T1) continue; ticks.push(<span key={m} className={'tick' + (m % 60 === 0 ? ' hour' : '')} style={{ top: (m - T0) / 5 * row }}>{fmtT(m)}</span>); }
  const off = ((T0 % 15) / 5) * row, pos = lanesLayout(D.blocks);
  const startDrag = (ev: React.PointerEvent, b: Block, mode: 'move' | 'resize', handle: boolean) => {
    if (readOnly || ev.button) return;
    if (ev.pointerType !== 'mouse' && !handle) return;
    drag.current = { b, mode, y0: ev.clientY, s0: b.start, d0: b.dur, moved: false };
    document.body.style.userSelect = 'none';
    if (handle) ev.preventDefault();
  };
  return <div className="tl">
    <div className="ticks" style={{ height: H }}>{ticks}</div>
    <div ref={lanesRef} className="lanes" style={{ height: H, ['--row' as any]: row + 'px', backgroundPosition: `0 ${off ? -off : 0}px` }}
      onPointerMove={ev => { if (ev.target === ev.currentTarget && ev.pointerType === 'mouse' && !readOnly) setGhost(minuteAt(ev.clientY)); else if (ghost != null) setGhost(null); }}
      onPointerLeave={() => setGhost(null)}
      onClick={ev => { if (suppress.current || readOnly) return; const t = ev.target as HTMLElement; if (t === ev.currentTarget || t.classList.contains('slotghost')) onAdd(minuteAt(ev.clientY)); }}>
      {!isKamp(o) && o.prep ? <div className="zone" style={{ top: 0, height: o.prep / 5 * row }}><span>Voorbereiding leiding · {o.prep} min</span></div> : null}
      {!isKamp(o) && o.post ? <div className="zone" style={{ top: (o.end - T0) / 5 * row, height: o.post / 5 * row }}><span>Nabespreking leiding · {o.post} min</span></div> : null}
      {D.blocks.filter(b => b.start + b.dur > T0 && b.start < T1).map(b => {
        const p = pos[b.id], top = (b.start - T0) / 5 * row, h = b.dur / 5 * row - 3, c = catOf(settings, b.cat);
        const cls = ['blk', h < 46 ? 'short' : '', h < 24 ? 'tiny' : '', h < 92 ? 'mid' : '', b.id === selId ? 'sel' : '', p.n > 1 ? 'overlap' : '', drag.current?.b === b && drag.current.moved ? 'dragging' : ''].join(' ');
        const under = b.minLeaders && b.names.length < b.minLeaders, mats = splitLines(b.materials).length;
        return <div key={b.id} className={cls} tabIndex={0} role="button" aria-label={`${b.title || 'Naamloos onderdeel'}, ${fmtT(b.start)} tot ${fmtT(b.start + b.dur)}`}
          style={{ ['--c' as any]: c.color, top: top + 1.5, height: h, left: `calc(${p.lane / p.n * 100}% + 4px)`, width: `calc(${100 / p.n}% - 8px)` }}
          onPointerDown={ev => { const t = ev.target as HTMLElement; if (t.closest('.bdel')) return; const rs = !!t.closest('.rs'), grip = !!t.closest('.grip'); startDrag(ev, b, rs ? 'resize' : 'move', rs || grip); }}
          onClick={ev => { ev.stopPropagation(); if (suppress.current) return; onSelect(b.id); }}
          onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(b.id); } }}>
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
          {!readOnly && <button className="bdel" onClick={ev => { ev.stopPropagation(); onDelete(b.id); }} title="Onderdeel verwijderen" aria-label="Onderdeel verwijderen"><Trash2 size={14} /></button>}
          {!readOnly && <div className="rs" title="Sleep om de duur te wijzigen" />}
        </div>;
      })}
      {ghost != null && !drag.current && <div className="slotghost" style={{ top: (ghost - T0) / 5 * row }}>+ {fmtT(ghost)}</div>}
      <div className="droprev" id="droprev" hidden />
    </div>
  </div>;
}

/* ============ Zijpaneel: bank en controle ============ */
function SidePanel({ tab, setTab, ctx, A, lanesRef, onSelect, onPlan, onDrop }: { tab: 'bank' | 'check'; setTab: (t: 'bank' | 'check') => void; ctx: Ctx; A: Analysis; lanesRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string) => void; onPlan: (l: Lib) => void; onDrop: (l: Lib, m: number) => void }) {
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
    const ql = q.toLowerCase(), items = lib.filter(l => (!cat || l.cat === cat) && (!ql || (l.title + ' ' + l.short + ' ' + l.location).toLowerCase().includes(ql))).sort(byTitle);
    return <>{tabs}<div className="pad stack">
      <div className="row"><input className="inp" type="search" placeholder="Zoek activiteit" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 140px' }} />
        <select className="inp" value={cat} onChange={e => setCat(e.target.value)} style={{ flex: '1 1 120px' }}><option value="">Alle categorieën</option>{settings.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
      <div className="libs">{items.length ? items.map(l => <div key={l.id} className="lib lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5" style={{ ['--c' as any]: catOf(settings, l.cat).color }}
        onPointerDown={ev => { if (readOnly || ev.button || (ev.target as HTMLElement).closest('button')) return; const grip = !!(ev.target as HTMLElement).closest('.lgrip'); if (ev.pointerType !== 'mouse' && !grip) return; ld.current = { l, x0: ev.clientX, y0: ev.clientY, started: false, m: null }; document.body.style.userSelect = 'none'; if (grip) ev.preventDefault(); }}>
        <span className="lgrip" title="Sleep naar de tijdlijn" />
        <div style={{ minWidth: 0 }}><div className="lt">{l.title || 'Naamloos'}</div><div className="lm">{fmtDur(l.dur)} · min. {l.minLeaders} leiding{l.location ? ' · ' + l.location : ''}</div>{l.short && <div className="ls">{l.short}</div>}</div>
        {!readOnly && <button className="btn sm" onClick={() => onPlan(l)} title="Op het eerste vrije moment inplannen">Inplannen</button>}
      </div>) : <p className="hint">{lib.length ? 'Geen activiteiten gevonden.' : 'Nog geen activiteiten.'}</p>}</div>
    </div>
      {float && <div className="drag-float" style={{ left: float.x, top: float.y }}>{(float.l.title || 'Naamloos') + ' · ' + fmtDur(float.l.dur)}</div>}</>;
  }
  const people = Object.entries(A.per).sort((a, b) => a[0].localeCompare(b[0], 'nl')), free = A.present.filter(n => !A.per[n]);
  return <>{tabs}<div className="pad stack">
    <h3>Aandachtspunten</h3>
    {A.issues.length ? <ul className="issues">{A.issues.map((i, k) => <li key={k} className={i.lvl}><i />{i.id ? <button className="linkbtn" onClick={() => onSelect(i.id!)}>{i.text}</button> : <span>{i.text}</span>}</li>)}</ul> : <p className="hint">Alles in orde.</p>}
    {nn ? <p className="hint">Minimaal {minNeed(o)} leiding nodig: het onderdeel dat de meeste leiding vraagt bepaalt dit.</p> : <>
      <h3 className="gap-lg">Taken per leiding</h3>
      {people.length ? <ul className="who-list">{people.map(([n, arr]) => <li key={n}><b>{n}{A.present.includes(n) || !leaders.includes(n) ? '' : <> <span className="pill warn">afwezig</span></>}</b>
        <span className="what">{[...arr].sort((a, b) => (a._di || 0) - (b._di || 0) || a.start - b.start).map((x, k) => <span key={k}>{x._day ? x._day.slice(0, 2).toLowerCase() + ' ' : ''}{fmtT(x.start)}–{fmtT(x.start + x.dur)} {x.title || 'naamloos'}<br /></span>)}</span></li>)}</ul> : <p className="hint">Nog niemand ingedeeld.</p>}
      {free.length > 0 && <p className="hint">Zonder taak: {free.join(', ')}</p>}
    </>}
  </div></>;
}

/* ============ Onderdeel bewerken ============ */
export function CatSelect({ value, onChange, prefix }: { value: string; onChange: (id: string) => void; prefix: string }) {
  const { settings, saveSettings, can } = useSpeltak();
  const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState('');
  const add = () => {
    const v = name.trim(); if (!v) return;
    const c = { id: uid(), label: v, color: SWATCHES[settings.categories.length % SWATCHES.length] };
    saveSettings({ categories: [...settings.categories, c] }); onChange(c.id); setNewOpen(false); setName(''); toast('Categorie toegevoegd');
  };
  return <Field label="Categorie" htmlFor={prefix + '-cat'}>
    <select id={prefix + '-cat'} value={newOpen ? '__new' : value} onChange={ev => { if (ev.target.value === '__new') { setNewOpen(true); return; } setNewOpen(false); onChange(ev.target.value); }}>
      {settings.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      {(!value || !settings.categories.some(c => c.id === value)) && <option value={value}>Zonder categorie</option>}
      {can('settings') && <option value="__new">+ Nieuwe categorie…</option>}
      {newOpen && !can('settings') && null}
    </select>
    {newOpen && <div className="newcat"><input className="inp" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Naam nieuwe categorie" autoFocus /><button className="btn sm" onClick={add}>Toevoegen</button></div>}
  </Field>;
}

export function LocInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { settings, lib } = useSpeltak();
  const locs = useMemo(() => { const s = new Set(settings.locations); lib.forEach(l => l.location && s.add(l.location)); return [...s]; }, [settings.locations, lib]);
  return <><input id={id} value={value} list={id + '-list'} onChange={e => onChange(e.target.value)} placeholder={placeholder} /><datalist id={id + '-list'}>{locs.map(l => <option key={l} value={l} />)}</datalist></>;
}

function Editor({ b, ctx, upd, onClose, onDelete, onDup, saveLib }: { b: Block; ctx: Ctx; upd: (fn: () => void) => void; onClose: () => void; onDelete: () => void; onDup: () => void; saveLib: (l: Lib) => void }) {
  const { settings, leaders, getL, entryOfOpk, can } = useSpeltak();
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
    const l = normLib({ id: uid() }); LIB_FIELDS.forEach(k => { (l as any)[k] = (b as any)[k]; }); saveLib(l); upd(() => { b.libId = l.id; }); toast('Opgeslagen in de activiteitenbank');
  };
  const updLib = () => { if (!L) return; const l = { ...L }; LIB_FIELDS.forEach(k => { (l as any)[k] = (b as any)[k]; }); saveLib(l); toast('Activiteitenbank bijgewerkt'); };
  const ro = readOnly;
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><div><span className="eyebrow">Onderdeel</span><div className="mono muted" style={{ fontSize: 13 }}>{fmtT(b.start)} – {fmtT(b.start + b.dur)}</div></div>
      <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>{!ro && <button className="iconbtn danger" onClick={onDelete} title="Onderdeel verwijderen" aria-label="Onderdeel verwijderen"><Trash2 size={16} /></button>}<button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div></div>
    <Field label="Programma-onderdeel" htmlFor="bf-title"><input id="bf-title" value={b.title} readOnly={ro} onChange={e => upd(() => { b.title = e.target.value; })} placeholder="bijv. Kompasposten" /></Field>
    <div className="two">
      <Field label="Begin" className="timefield"><TimePicker value={b.start} from={T0} to={T1 - 5} extra onChange={v => upd(() => { b.start = v; b.dur = Math.max(5, Math.min(b.dur, T1 - b.start)); })} /></Field>
      <Field label="Duur" htmlFor="bf-dur"><select id="bf-dur" value={b.dur} disabled={ro} onChange={e => upd(() => { b.dur = +e.target.value; })}>{durs.map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
    </div>
    <div className="two">{isFixed(b) ? <div className="field"><span className="lbl">Soort</span><span className="pill neutral" style={{ justifySelf: 'start' }}>{catOf(settings, b.cat).label}</span></div> : <CatSelect prefix="bf" value={b.cat} onChange={id => upd(() => { b.cat = id; })} />}
      <Field label="Minimaal aantal leiding" htmlFor="bf-min"><input id="bf-min" type="number" min={0} max={30} readOnly={ro} value={b.minLeaders} onChange={e => upd(() => { b.minLeaders = Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)); })} /></Field></div>
    <Field label="Locatie" htmlFor="bf-loc"><LocInput id="bf-loc" value={b.location} onChange={v => upd(() => { b.location = v; })} placeholder="bijv. Grasveld" /></Field>
    {nn ? <div className="field"><span className="lbl">Verantwoordelijk</span><span className="hint">Deel je in bij het inplannen.</span></div> : <div className="field"><span className="lbl">Verantwoordelijk</span>
      <div className="row" style={{ gap: 6 }}>{leaders.length ? leaders.map(n => present.includes(n) ? <Chip key={n} on={b.names.includes(n)} disabled={ro} onClick={() => upd(() => { b.names = b.names.includes(n) ? b.names.filter(x => x !== n) : [...b.names, n]; })}>{n}</Chip>
        : <Chip key={n} className="absent" disabled title="Afwezig volgens de jaarplanning">{n} · afwezig</Chip>) : <span className="hint">Nog geen leidingteam.</span>}</div>
      <input className="inp" value={extraTxt} readOnly={ro} onChange={e => setExtras(e.target.value, false)} onBlur={e => setExtras(e.target.value, true)} placeholder="Andere namen, gescheiden door komma's" />
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
