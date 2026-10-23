import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Download, ExternalLink, Mail, Plus, SquarePen, Tent, Users } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast, undoAction } from '../store/toast';
import { openModal } from '../store/modal';
import { makeForEntry, markFresh } from '../store/fresh';
import { Strip, StatusPill, CatTags, PeopleChips, usePdf, PageTitle } from '../components/shared';
import { Dot, TimePicker } from '../components/ui';
import { addDays, cap, dayDiff, fmtLong, fmtRange, fmtShort, fmtT, fromISO, isoWeek, mon3, plural, todayISO, toISO, DAYS, MONTHS } from '../lib/time';
import { catOf, dayTitle, entryStatus, entryTimes, isKamp, letterDue, minNeed, newKamp, newOpk, opkCatList, plannersOf, changeOpkTime, progStatus, rowDate, rowEnd, rowsIn, seasonLabel, seasonOf, seasonRange, type Opk, type Plan, type Row } from '../lib/model';

export default function Dashboard() {
  const S = useSpeltak();
  const { settings, opks, lib, plans, sid, saveOpk, can } = S;
  const nav = useNavigate();
  const today = todayISO();
  const rows = rowsIn(settings, plans, today, addDays(today, 400)).filter(r => rowEnd(r) >= today);
  const next = rows.find(r => !r.e || r.e.type !== 'geen');
  const after = rows.filter(r => r !== next && (!next || rowDate(r) >= rowDate(next))).slice(0, 5);
  const letters = plans.filter(e => e.letter.needed && !e.letter.sent && e.type !== 'geen' && (e.endDate || e.date) >= today)
    .map(e => ({ e, due: letterDue(settings, e) })).filter(x => today >= addDays(x.due, -settings.letterNotice)).sort((a, b) => a.due.localeCompare(b.due));
  const empty = !opks.length && !lib.length && !plans.length;
  // nog helemaal niets ingevuld voor de komende data: één regel in plaats van vijf dezelfde lege rijen
  const allBlank = after.length > 0 && after.every(r => blankRow(r, S.opkOf(r.e)));
  const onDay = after.every(r => fromISO(rowDate(r)).getDay() === settings.opkDay);
  const blankLine = after.length === 1 ? `De volgende ${onDay ? DAYS[settings.opkDay] : 'opkomst'} is nog leeg.`
    : `De komende ${after.length} ${onDay ? DAYS[settings.opkDay] + 'en' : 'opkomsten'} zijn nog leeg.`;
  const create = (kamp: boolean) => { const o = kamp ? newKamp(settings, 3) : newOpk(settings); saveOpk(o); markFresh(o.id); nav(`/s/${sid}/bouwer/${o.id}`); };
  return <div className="stack pt-6 md:pt-8" style={{ gap: 20 }}>
    {/* de groepsnaam staat al in de kopbalk; de titel blijft kleiner dan die van de komende opkomst */}
    <PageTitle small kicker={S.practice ? undefined : <Link className="kicker-switch" to="/speltakken"><Users size={13} />Andere speltak</Link>} title={S.sp?.name || settings.speltak || 'Overzicht'} sub={`${cap(fmtLong(today))}, week ${isoWeek(today)}`}>
      {can('build') && <><button className="btn" onClick={() => create(true)}><Tent size={16} />Weekendkamp</button><button className="btn primary" onClick={() => create(false)}><Plus size={16} />Nieuwe opkomst</button></>}
    </PageTitle>
    <div className="dash2">
      {/* nieuwe speltak: eerst de welkomstkaart (met de opkomstdag die het seizoen bepaalt), nog geen lege kaart en lege rijen */}
      {empty ? <section className="card pad stack setup welcome"><h2>Welkom bij {settings.speltak || 'je speltak'}</h2>
        <p className="muted">Begin met de jaarplanning: vul per {DAYS[settings.opkDay]} het onderwerp in en wie de opkomst plant. Bouw daarna het programma in de opkomstbouwer, of nodig eerst je leidingteam uit.</p>
        <p className="setup-day"><CalendarClock aria-hidden="true" /><span>Opkomstdag: <b>{DAYS[settings.opkDay]} {fmtT(settings.defStart)}–{fmtT(settings.defEnd)}</b></span>{can('settings') && <Link to={`/s/${sid}/instellingen`}>Aanpassen</Link>}</p>
        <div className="row"><Link className="btn primary" to={`/s/${sid}/jaarplanning`}>Naar jaarplanning</Link>{S.isTL && <Link className="btn" to={`/s/${sid}/instellingen`}>Leiding uitnodigen</Link>}</div></section>
      : <div className="stack" style={{ gap: 20 }}>
        {next ? <Hero r={next} today={today} /> : <section className="card pad empty-hero"><h2>Er staat nog niets gepland</h2><p className="muted">Vul in de jaarplanning de onderwerpen en de planning per {DAYS[settings.opkDay]} in.</p><div className="row"><Link className="btn primary" to={`/s/${sid}/jaarplanning`}>Naar jaarplanning</Link></div></section>}
        <section className="card pad stack">
          <div className="row between"><h3>Daarna</h3>{!allBlank && <Link className="linkbtn" to={`/s/${sid}/jaarplanning`}>Hele jaarplanning</Link>}</div>
          {allBlank ? <p className="nextempty"><span className="muted">{blankLine}</span><Link className="linkbtn" to={`/s/${sid}/jaarplanning`}>Naar jaarplanning</Link></p>
            : after.length ? <ul className="nextlist">{after.map(r => <NextItem key={r.key} r={r} />)}</ul> : <p className="hint">Nog niets verder gepland.</p>}
        </section>
      </div>}
      {/* naast elkaar (vanaf 1081 px, zie .dash2) gelijk met de bovenkant van de kaart links: de komende opkomst heeft mt-10 (voor het insigne), de welkomstkaart en "nog niets gepland" niet */}
      <aside className={'stack' + (!empty && next ? ' min-[1081px]:mt-10' : '')} style={{ gap: 20 }}>
        {letters.length > 0 && <div className="notices">{letters.map(x => <Notice key={x.e.id} e={x.e} due={x.due} today={today} />)}</div>}
        <section id="dash-cal" className="card pad" aria-label="Kalender" tabIndex={-1}><MiniCal today={today} /></section>
        <section className="card pad stack"><SeasonCounts today={today} /></section>
        <CatSpread today={today} />
      </aside>
    </div>
  </div>;
}

function Notice({ e, due, today }: { e: Plan; due: string; today: string }) {
  const { opkOf, savePlan, sid, can, latest } = useSpeltak();
  const nav = useNavigate();
  const left = dayDiff(today, due), o = opkOf(e);
  const title = (o && o.title) || e.topic || 'opkomst';
  const msg = left < 0 ? `${plural(-left, 'dag', 'dagen')} te laat` : left === 0 ? 'Vandaag versturen' : `Vóór ${fmtShort(due)}, nog ${plural(left, 'dag', 'dagen')}`;
  // Ongedaan maken met de nieuwste stand van de rij: alleen "verstuurd" gaat terug, de rest blijft zoals hij nu is
  const unsent = () => { const cur = latest().plans.find(p => p.id === e.id); if (cur) latest().savePlan({ ...cur, letter: { ...cur.letter, sent: false } }); };
  const box = useRef<HTMLDivElement>(null);
  const sent = () => {
    // de melding verdwijnt: de focus naar de volgende brief (of de vorige), anders naar de kalender eronder, niet kwijt naar het begin
    const all = [...document.querySelectorAll<HTMLElement>('.notices .notice')], i = all.indexOf(box.current!), nx = all[i + 1] || all[i - 1];
    const had = !!box.current?.contains(document.activeElement) || document.activeElement === document.body;
    savePlan({ ...e, letter: { ...e.letter, sent: true } }); toast('Brief gemarkeerd als verstuurd', undoAction(unsent));
    if (had) setTimeout(() => { const to = (nx?.isConnected && nx.querySelector<HTMLElement>('button')) || document.getElementById('dash-cal'); to?.focus({ preventScroll: true }); to?.scrollIntoView?.({ block: 'nearest' }); }, 0);
  };
  // de brief op verstuurd zetten is een wijziging in de jaarplanning (zoals de briefknop daar): alleen met dat recht
  return <div ref={box} className={'notice' + (left < 0 ? ' late' : '')}><Mail size={18} />
    <div className="ntext"><b>Brief: {title}</b><span>{msg} · opkomst {fmtShort(e.date)}</span></div>
    <div className="row"><button className="btn sm ghost" onClick={() => nav(`/s/${sid}/jaarplanning?focus=${e.id}`)}>Bekijken</button>{can('plan') && <button className="btn sm primary" onClick={sent}>Verstuurd</button>}</div></div>;
}

/** Dubbelklik (of dubbel tikken op de telefoon) om iets op de kaart aan te passen. */
function useDoubleTap(on: (() => void) | null) {
  const last = useRef(0);
  if (!on) return {};
  return {
    onClick: () => { const t = Date.now(); if (t - last.current < 450) { last.current = 0; on(); } else last.current = t; },
    'data-editable': '', title: 'Dubbelklik om aan te passen',
  };
}

/**
 * Tekst die na een dubbelklik een invoerveld wordt. Enter of wegklikken slaat op, Esc annuleert.
 * Met Enter of Esc verdwijnt het veld: de focus gaat dan terug naar de knop (bijv. Locatie toevoegen) als die er weer staat,
 * anders naar wat erna komt op de kaart, niet kwijt naar het begin van de pagina.
 */
function InlineText({ value, onSave, enabled, label, multiline, render, className }: {
  value: string; onSave: ((v: string) => void) | null; enabled: boolean; label: string; multiline?: boolean; className?: string;
  render: (tap: Record<string, unknown>, start: (() => void) | null) => ReactNode;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const closed = useRef(false), was = useRef(false);
  // onzichtbare markeringen om wat render teruggeeft (dat kan van alles zijn, of niets): zo is te vinden wat er na het bewerken staat
  const m0 = useRef<HTMLSpanElement>(null), m1 = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (edit !== null) { was.current = true; return; }
    if (!was.current) return; was.current = false;
    // alleen als de focus echt weg is (wegklikken naar iets anders houdt die plek)
    const a = document.activeElement; if (a && a !== document.body && a.isConnected) return;
    const s = m0.current, e = m1.current; if (!s || !e) return;
    const scope = s.closest('.hero') || document.getElementById('inhoud'); if (!scope) return;
    const list = [...scope.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(x => x.getClientRects().length > 0);
    const own = list.find(x => s.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING && e.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING);
    const next = list.find(x => e.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    (own || next)?.focus({ preventScroll: true });
  }, [edit]);
  const start = enabled && onSave ? () => { closed.current = false; setEdit(value); } : null;
  const tap = useDoubleTap(start);
  if (edit === null) return <><span hidden ref={m0} />{render(tap, start)}<span hidden ref={m1} /></>;
  const done = (save: boolean) => {
    if (closed.current) return; closed.current = true;
    const v = edit.trim(); if (save && v !== value.trim() && onSave) onSave(v); setEdit(null);
  };
  const p = {
    className: 'inline-edit ' + (className || ''), value: edit, autoFocus: true, 'aria-label': label,
    onChange: (ev: { target: { value: string } }) => setEdit(ev.target.value), onBlur: () => done(true),
    onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); done(false); } else if (ev.key === 'Enter' && !(multiline && ev.shiftKey)) { ev.preventDefault(); done(true); } },
  };
  return multiline ? <textarea rows={2} {...p} /> : <input {...p} />;
}

/** Begin- en eindtijd aanpassen op de kaart; slaat direct op, sluit bij wegklikken, Enter of Esc. */
function TimeEdit({ st, en, onSet, onClose }: { st: number; en: number; onSet: (which: 'start' | 'end', v: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const down = (ev: PointerEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) onClose(); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' || ev.key === 'Enter') onClose(); };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return <span ref={ref} className="time-edit"><TimePicker value={st} from={360} to={1430} label="Begintijd" onChange={v => onSet('start', v)} /><span>–</span>
    <TimePicker value={en} from={365} to={1435} label="Eindtijd" onChange={v => onSet('end', v)} /><button className="btn sm" onClick={onClose}>Klaar</button></span>;
}

function Hero({ r, today }: { r: Row; today: string }) {
  const S = useSpeltak();
  const { settings, opkOf, presentForEntry, sid, can, canLink, saveOpk, savePlan, entryFor } = S;
  const nav = useNavigate(), loc = useLocation(); const pdf = usePdf();
  const [timeEdit, setTimeEdit] = useState(false);
  const e = r.e, d = rowDate(r), o = opkOf(e);
  const [st, en] = entryTimes(settings, e, o || null), days = dayDiff(today, d);
  const when = d < today ? 'Bezig' : days === 0 ? 'Vandaag' : days === 1 ? 'Morgen' : `Over ${days} dagen`;
  const kamp = !!e && e.type === 'kamp';
  const title = (o && o.title) || (e && e.topic) || '';
  const short = (o && o.short) || (e && e.note) || '';
  const planners = plannersOf(e, o), absent = e ? e.absent : [], present = presentForEntry(e, o);
  const dt = fromISO(d), need = o ? minNeed(o) : 0;
  // wie wat mag aanpassen: de opkomst zelf = opkomsten bouwen, de regel in de jaarplanning = jaarplanning
  const canO = !!o && can('build'), canE = !o && can('plan'), canEdit = canO || canE;
  const entry = () => entryFor(r.key);
  const saveTitle = (v: string) => {
    if (o) { saveOpk({ ...o, title: v }); if (e && can('plan')) savePlan({ ...e, topic: v }); }
    else savePlan({ ...entry(), topic: v });
  };
  const saveShort = (v: string) => { if (o) saveOpk({ ...o, short: v }); else savePlan({ ...entry(), note: v }); };
  const setTime = (which: 'start' | 'end', v: number) => {
    if (o) { const r = changeOpkTime(o, which, v); if (!r.opk) { toast(r.error); return; } if (r.note) toast(r.note); saveOpk(r.opk); return; }
    const x = entry(), s0 = x.start ?? settings.defStart, e0 = x.end ?? settings.defEnd;
    if (which === 'end' && v <= s0) { toast('De eindtijd moet na de begintijd liggen.'); return; }
    if (which === 'start') savePlan({ ...x, start: v, end: e0 <= v ? v + 60 : e0 }); else savePlan({ ...x, start: s0, end: v });
  };
  const timesEditable = !kamp && !isKamp(o) && canEdit;
  const timeTap = useDoubleTap(timesEditable ? () => setTimeEdit(true) : null);
  const facts: ReactNode[] = [<span key="d">{fmtRange(d, e && e.endDate, true)}</span>, <span key="w">week {isoWeek(d)}</span>,
    kamp ? <span key="t">vertrek {fmtT(st)} · terug {fmtT(en)}</span>
      : timeEdit ? <TimeEdit key="t" st={st} en={en} onSet={setTime} onClose={() => setTimeEdit(false)} />
      : <span key="t" {...timeTap}>{fmtT(st)}–{fmtT(en)}</span>];
  if (o && !isKamp(o) && (o.prep || o.post)) facts.push(<span key="l">leiding {fmtT(o.start - (o.prep || 0))}–{fmtT(o.end + (o.post || 0))}</span>);
  if (o && need) facts.push(<span key="n">minimaal {need} leiding{present.length < need ? ` (${present.length} aanwezig)` : ''}</span>);
  if (o && (o.location || canO)) facts.push(<InlineText key="loc" value={o.location} enabled={canO} label="Locatie" className="fact-edit" onSave={v => saveOpk({ ...o, location: v })}
    // leeg: een echte knop (één klik), gevuld: dubbelklik om aan te passen
    render={(tap, start) => o.location ? <span {...tap}>{o.location}</span> : start && <button className="linkbtn" onClick={start}>Locatie toevoegen</button>} />);
  const gotoRow = () => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(r.key)}`);
  const plannersTap = useDoubleTap(can('plan') ? () => openModal({ kind: 'people', keyId: r.key, field: 'planners' }) : null);
  const absentTap = useDoubleTap(can('plan') ? () => openModal({ kind: 'people', keyId: r.key, field: 'absent' }) : null);
  const presentTap = useDoubleTap(o && can('build') ? () => openModal({ kind: 'takeover', oid: o.id, fresh: false }) : null);
  return <section className="card hero relative mt-10 md:ml-6">
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[18px]" aria-hidden="true"><span className="glow absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl opacity-40"></span></span>
    <div className="hero-top">
      <div className={'hero-date patch -mt-14 -rotate-6 md:-ml-10' + (kamp ? ' kamp' : '')}><span>{DAYS[dt.getDay()].slice(0, 2)}</span><b>{dt.getDate()}</b><span>{mon3(d)}</span></div>
      <div className="hero-main">
        <div className="row hero-eyebrow"><span className="eyebrow">{kamp ? 'Komend kamp' : 'Komende opkomst'}</span><span className="pill acc">{when}</span>{o && <StatusPill o={o} />}</div>
        {/* nog geen onderwerp: kleine gedempte tekst (niet het grootste op de pagina), met een knop om het in te vullen */}
        <InlineText value={title} enabled={canEdit} label="Opkomst titel" className={'hero-title' + (title ? '' : ' none')} onSave={saveTitle}
          render={(tap, start) => title ? <h2 className="hero-title" {...tap}>{title}</h2>
            : <div className="hero-notopic"><h2 className="hero-title none" {...tap}>Onderwerp nog kiezen</h2>{start && <button className="btn sm" onClick={start}><SquarePen size={14} />Invullen</button>}</div>} />
        {o && <CatTags o={o} />}
        <div className="facts">{facts}</div>
        <InlineText value={short} enabled={canEdit} label="Korte omschrijving" className="hero-short" multiline onSave={saveShort}
          render={(tap, start) => short ? <p className="hero-short" {...tap}>{short}</p> : start ? <button className="hero-short hero-add-short" onClick={start}>Korte omschrijving toevoegen</button> : null} />
        {/* opmerking uit de jaarplanning naast de omschrijving van de opkomst (zonder omschrijving staat de opmerking al hierboven) */}
        {o && o.short && e && e.note.trim() && <p className="hero-note"><b>Opmerking:</b> {e.note.trim()}</p>}
      </div>
    </div>
    <div className="people">
      <div {...plannersTap}><span className="lbl">Planning door</span>{planners.length ? <div className="row" style={{ gap: 4 }}><PeopleChips list={planners} /></div> : can('plan') ? <button className="linkbtn" onClick={() => openModal({ kind: 'people', keyId: r.key, field: 'planners' })}>Leiding toewijzen</button> : <span className="muted">Nog niemand</span>}</div>
      <div {...presentTap}><span className="lbl">Leiding aanwezig</span><span>{present.length ? present.join(', ') : <span className="muted">Nog geen leidingteam</span>}</span></div>
      <div {...absentTap}><span className="lbl">Afwezig</span>{absent.length ? <div className="row" style={{ gap: 4 }}><PeopleChips list={absent} abs /></div> : <span className="muted">Niemand</span>}</div>
    </div>
    {o ? <>
      <Strip o={o} />
      <ul className="prog"><ProgList o={o} date={e ? e.date : null} /></ul>
      <div className="row"><button className="btn primary" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)}><ExternalLink size={16} />Openen</button>
        {can('build') && <button className="btn" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })}><Users size={16} />Leiding indelen</button>}
        <button className="btn" onClick={() => pdf(o)}><Download size={16} />PDF maken</button><button className="btn ghost" onClick={gotoRow}>In jaarplanning</button></div>
    </> : <div className="empty"><span>{kamp ? 'Aan dit kamp is nog geen programma gekoppeld.' : 'Aan deze opkomst is nog geen programma gekoppeld.'}</span>
      {/* met het recht Opkomsten meteen een programma maken (zoals Maken in de opkomstbouwer); koppelen aan iets uit de bank of een concept kan ernaast */}
      <div className="row">{canLink && can('build') ? <><button className="btn primary" onClick={() => makeForEntry(S, r.key, kamp, nav, loc.pathname + loc.search)}><Plus size={16} />Programma maken</button>
        <button className="btn" onClick={() => openModal({ kind: 'link', keyId: r.key })}>Koppelen</button></>
        : canLink && <button className="btn primary" onClick={() => openModal({ kind: 'link', keyId: r.key })}>Opkomst koppelen</button>}<button className={'btn' + (canLink && can('build') ? ' ghost' : '')} onClick={gotoRow}>In jaarplanning</button></div></div>}
  </section>;
}

export function ProgList({ o, date }: { o: Opk; date: string | null }) {
  const { settings } = useSpeltak();
  const li = (b: Opk['blocks'][0]) => <li key={b.id}><span className="mono">{fmtT(b.start)}</span><Dot color={catOf(settings, b.cat).color} />
    <span><b>{b.title || 'Naamloos'}</b>{b.location && <small>{b.location}</small>}</span>
    <span className="who">{b.names.length ? b.names.join(', ') : <span className="muted">nog niemand</span>}</span></li>;
  const sorted = (list: Opk['blocks']) => [...list].sort((a, b) => a.start - b.start);
  if (isKamp(o)) return <>{o.days.map((d, i) => <Fragment key={d.id}><li className="dayhead"><b>{dayTitle(o, i, date ? addDays(date, i) : null)}</b><span className="hint">{fmtT(d.start)}–{fmtT(d.end)}</span></li>{sorted(d.blocks).map(li)}</Fragment>)}</>;
  const band = (t: number, txt: string) => <li key={txt} className="band"><span className="mono">{fmtT(t)}</span><i /><span>{txt}</span><span /></li>;
  return <>{o.prep ? band(o.start - o.prep, `Voorbereiding leiding · ${o.prep} min`) : null}{sorted(o.blocks).map(li)}{o.post ? band(o.end, `Nabespreking leiding · ${o.post} min`) : null}</>;
}

function NextItem({ r }: { r: Row }) {
  const { opkOf, leaders, sid, presentForEntry } = useSpeltak();
  const nav = useNavigate();
  const e = r.e, d = rowDate(r), o = opkOf(e), st = entryStatus(e, o, leaders);
  // stand van het programma los van de soort rij: ook een kamp kan nog leeg zijn of aandachtspunten hebben
  const ps = o ? progStatus(o, presentForEntry(e, o), leaders) : null;
  const title = (o && o.title) || (e && e.topic) || (st === 'off' ? 'Geen opkomst' : 'Nog geen onderwerp');
  const planners = plannersOf(e, o);
  const tags: React.ReactNode[] = [];
  if (st === 'off') tags.push(<span key="off" className="pill neutral">Geen opkomst</span>);
  else {
    if (st === 'kamp') tags.push(<span key="k" className="pill kamp">Kamp</span>);
    if (!planners.length) tags.push(<span key="p" className="pill warn">Nog geen planner</span>);
    if (!o) tags.push(<span key="np" className="pill neutral">Geen programma</span>);
    else tags.push(ps === 'leeg' ? <span key="g" className="pill neutral">Nog leeg</span> : ps === 'warn' ? <span key="g" className="pill warn">Aandachtspunten</span> : <span key="g" className="pill good">Programma klaar</span>);
    if (e && e.letter.needed) tags.push(<span key="l" className={'pill ' + (e.letter.sent ? 'good' : 'warn')}>{e.letter.sent ? 'Brief verstuurd' : 'Brief'}</span>);
  }
  const note = e ? e.note.trim() : '';
  const sub = (st === 'off' ? fmtRange(d, e && e.endDate) : `${fmtRange(d, e && e.endDate)} · ${planners.length ? 'planning: ' + planners.join(', ') : 'nog niemand toegewezen'}`) + (note ? ' · ' + note : '');
  return <li><button className="nextitem lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5" onClick={() => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(r.key)}`)}>
    <span className="nd"><b>{fromISO(d).getDate()}</b><span>{mon3(d)}</span></span>
    <span className="ni"><b>{title}</b><span className="hint">{sub}</span></span>
    <span className="nt">{tags}</span></button></li>;
}

const STATUS_WORD: Record<ReturnType<typeof entryStatus>, string> = { ok: 'programma klaar', warn: 'aandachtspunten', leeg: 'programma nog leeg', topic: 'alleen onderwerp', open: 'nog open', kamp: 'kamp', off: 'geen opkomst' };

function MiniCal({ today }: { today: string }) {
  const { settings, plans, opkOf, leaders, sid } = useSpeltak();
  const nav = useNavigate();
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));
  const [y, m] = calMonth.split('-').map(Number);
  const first = toISO(new Date(y, m - 1, 1, 12));
  const from = addDays(first, -((fromISO(first).getDay() + 6) % 7));
  const marks: Record<string, { st: string; key: string; title: string; first: boolean; last: boolean }> = {};
  rowsIn(settings, plans, addDays(from, -10), addDays(from, 41)).forEach(r => {
    const d0 = rowDate(r), d1 = rowEnd(r), e = r.e, o = opkOf(e), st = entryStatus(e, o, leaders);
    // de status staat ook in de naam (schermlezer, en als tip bij de muis): niet alleen de kleur zegt het
    const name = (o && o.title) || (e && e.topic) || '';
    const title = `${fmtRange(d0, e && e.endDate)} · ${STATUS_WORD[st]}${name ? ': ' + name : ''}`;
    for (let d = d0; d <= d1; d = addDays(d, 1)) marks[d] = { st, key: r.key, title, first: d === d0, last: d === d1 };
  });
  const shift = (n: number) => setCalMonth(toISO(new Date(y, m - 1 + n, 1, 12)).slice(0, 7));
  const weeks: React.ReactNode[] = [];
  for (let w = 0; w < 6; w++) {
    const ws = addDays(from, w * 7);
    if (w >= 4 && fromISO(ws).getMonth() !== m - 1) break;
    weeks.push(<span key={'w' + w} className="wk">{isoWeek(ws)}</span>);
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), mk = marks[d];
      const cls = ['cday', fromISO(d).getMonth() !== m - 1 ? 'other' : '', mk ? mk.st : '', d === today ? 'today' : '', mk && mk.first ? 'first' : '', mk && mk.last ? 'last' : ''].join(' ');
      const now = d === today ? 'date' as const : undefined;
      weeks.push(mk ? <button key={d} className={cls} onClick={() => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(mk.key)}`)} title={mk.title + (now ? ' (vandaag)' : '')} aria-label={mk.title} aria-current={now}>{fromISO(d).getDate()}</button> : <span key={d} className={cls} aria-current={now} title={now ? 'Vandaag' : undefined}>{fromISO(d).getDate()}</span>);
    }
  }
  return <div className="cal"><div className="cal-head"><button className="iconbtn" onClick={() => shift(-1)} aria-label="Vorige maand"><ChevronLeft size={16} /></button><b>{MONTHS[m - 1]} {y}</b><button className="iconbtn" onClick={() => shift(1)} aria-label="Volgende maand"><ChevronRight size={16} /></button></div>
    <div className="cal-grid"><span className="wd">wk</span>{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(x => <span key={x} className="wd">{x}</span>)}{weeks}</div>
    {calMonth !== today.slice(0, 7) && <button className="linkbtn" onClick={() => setCalMonth(today.slice(0, 7))}>Naar deze maand</button>}</div>;
}

function SeasonCounts({ today }: { today: string }) {
  const { settings, plans, opkOf, leaders, sid } = useSpeltak();
  const Y = seasonOf(settings, today), R = seasonRange(settings, Y), rows = rowsIn(settings, plans, R.from, R.to);
  const c: Record<ReturnType<typeof entryStatus>, number> = { ok: 0, warn: 0, leeg: 0, topic: 0, open: 0, kamp: 0, off: 0 };
  rows.forEach(r => { const st = entryStatus(r.e, opkOf(r.e), leaders); if (st !== 'open' || rowEnd(r) >= today) c[st]++; });
  const letters = plans.filter(e => e.letter.needed && !e.letter.sent && e.date >= today).length;
  const li = (cls: string, label: string, n: number) => <li key={cls}><i className={'legend-dot cday ' + cls} />{label}<b>{n}</b></li>;
  return <><div className="row between"><h3>Seizoen {seasonLabel(settings, Y)}</h3><Link className="linkbtn" to={`/s/${sid}/jaarplanning`}>Openen</Link></div>
    <ul className="counts">{li('ok', 'Programma klaar', c.ok)}{li('warn', 'Programma met aandachtspunten', c.warn)}{li('leeg', 'Programma nog leeg', c.leeg)}{li('topic', 'Alleen onderwerp', c.topic)}{li('open', 'Nog open, vanaf vandaag', c.open)}{li('kamp', 'Kampen en weekenden', c.kamp)}{li('off', 'Geen opkomst', c.off)}
      <li><Mail size={14} />Brieven nog te versturen<b>{letters}</b></li></ul></>;
}

function CatSpread({ today }: { today: string }) {
  const { settings, plans, opkOf } = useSpeltak();
  const Y = seasonOf(settings, today), R = seasonRange(settings, Y), cnt: Record<string, number> = {};
  rowsIn(settings, plans, R.from, R.to).forEach(r => { const o = opkOf(r.e); if (!o) return; o.cats.forEach(c => cnt[c] = (cnt[c] || 0) + 1); });
  const list = opkCatList(settings), max = Math.max(1, ...Object.values(cnt));
  // nog geen enkele opkomst met een categorie: geen rij nullen laten zien
  if (!list.some(c => cnt[c.id])) return null;
  return <section className="card pad stack catspread"><h3>Activiteitengebieden</h3>
    <div className="bars wide">{list.map(c => <div key={c.id} className="barrow"><span className="bl" title={c.label}>{c.label}</span><div className="track"><div className="fill" style={{ width: `${(cnt[c.id] || 0) / max * 100}%`, ['--c' as any]: c.color }} /></div><span className="val">{cnt[c.id] || 0}</span></div>)}</div></section>;
}

/** Een datum waar nog niets voor is ingevuld: geen onderwerp, planner, programma, afwezigen, brief of notitie. */
function blankRow(r: Row, o: Opk | undefined | null) {
  const e = r.e;
  if (o) return false;
  if (!e) return true;
  return e.type === 'opkomst' && !e.topic.trim() && !e.note.trim() && !e.opkId && !plannersOf(e, null).length && !e.absent.length && !e.letter.needed;
}
