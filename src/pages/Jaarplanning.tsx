import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Plus, SquarePen, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { StatusPill, PeopleChips, PageTitle } from '../components/shared';
import { Chip, Dot } from '../components/ui';
import { addDays, dayDiff, fmtLong, fmtNL, fmtRange, fmtShort, fmtT, isoWeek, parseNL, plural, todayISO, DAYS, MONTHS } from '../lib/time';
import { allBlocks, plannersOf, entryStatus, entryTimes, isKamp, letterDue, minNeed, opkCatOf, opkDaysIn, rowDate, rowEnd, rowsIn, seasonLabel, seasonOf, seasonRange, type Row, type Settings } from '../lib/model';

type Range = { from: string; to: string };
function presetRange(s: Settings, p: string): Range {
  const today = todayISO(), Y = seasonOf(s, today);
  if (p === 'prev') return seasonRange(s, Y - 1);
  if (p === 'season') return seasonRange(s, Y);
  if (p === 'next') return seasonRange(s, Y + 1);
  if (p === '3m') return { from: today, to: addDays(today, 91) };
  const y = today.slice(0, 4); return { from: y + '-01-01', to: y + '-12-31' };
}
const same = (a: Range, b: Range) => a.from === b.from && a.to === b.to;
const rowDomId = (k: string) => 'r-' + k.replace(/[^a-z0-9]/gi, '-');

export default function Jaarplanning() {
  const { settings, plans, can } = useSpeltak();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const [range, setRange] = useState<Range>(() => { try { const r = JSON.parse(sessionStorage.getItem('opk.range') || ''); if (r && r.from && r.to) return r; } catch {} return presetRange(settings, '3m'); });
  useEffect(() => { try { sessionStorage.setItem('opk.range', JSON.stringify(range)); } catch {} }, [range]);
  // focus op een rij vanuit het dashboard of de kalender
  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const e = plans.find(p => p.id === focus) || (focus.startsWith('s:') ? { date: focus.slice(2), endDate: '' } : null);
    if (e && (e.date < range.from || e.date > range.to)) { setRange(seasonRange(settings, seasonOf(settings, e.date))); return; }
    const t = setTimeout(() => {
      const el = document.getElementById(rowDomId(focus));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
      setParams({}, { replace: true });
    }, 80);
    return () => clearTimeout(t);
  }, [focus, range, plans.length]);

  const rows = rowsIn(settings, plans, range.from, range.to);
  const groups: Record<string, Row[]> = {};
  rows.forEach(r => { const k = rowDate(r).slice(0, 7); (groups[k] = groups[k] || []).push(r); });
  const cnt = { opk: 0, kamp: 0, off: 0, open: 0 };
  rows.forEach(r => { const st = entryStatus(r.e, null, 0); if (st === 'kamp') cnt.kamp++; else if (st === 'off') cnt.off++; else if (r.e && (r.e.opkId || r.e.topic)) cnt.opk++; else if (rowEnd(r) >= today) cnt.open++; });
  const Y = seasonOf(settings, range.from), isSeason = same(seasonRange(settings, Y), range);
  const presets: [string, string][] = [['prev', 'Vorig seizoen'], ['season', 'Dit seizoen'], ['next', 'Volgend seizoen'], ['3m', 'Komende 3 maanden'], ['year', 'Dit kalenderjaar']];
  const dayPlural = DAYS[settings.opkDay] + 'en';
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={isSeason ? 'Seizoen ' + seasonLabel(settings, Y) : 'Planning'} sub={`${fmtLong(range.from)} t/m ${fmtLong(range.to)} · ${opkDaysIn(settings, range.from, range.to).length} ${dayPlural}`}>
      {can('plan') && <button className="btn" onClick={() => openModal({ kind: 'extra' })}><Plus size={16} />Extra datum</button>}
    </PageTitle>
    <div className="card rangebar">
      <RangeInput label="Van" value={range.from} onChange={iso => { if (iso > range.to) { toast('De begindatum moet voor de einddatum liggen.'); return false; } setRange({ ...range, from: iso }); return true; }} />
      <RangeInput label="Tot en met" value={range.to} onChange={iso => { if (iso < range.from) { toast('De begindatum moet voor de einddatum liggen.'); return false; } setRange({ ...range, to: iso }); return true; }} />
      <div className="presets">{presets.map(([p, l]) => <Chip key={p} on={same(presetRange(settings, p), range)} onClick={() => setRange(presetRange(settings, p))}>{l}</Chip>)}</div>
      <div className="rangestats"><span className="stat">Gepland<b>{cnt.opk}</b></span><span className="stat">Kamp<b>{cnt.kamp}</b></span><span className="stat">Geen opkomst<b>{cnt.off}</b></span><span className="stat">Nog open<b>{cnt.open}</b></span></div>
    </div>
    {rows.length ? <div className="ptable">
      <div className="prow head"><span>Datum</span><span>Onderwerp</span><span>Opkomst</span><span>Planning door</span><span>Afwezig</span><span>Brief</span></div>
      {Object.entries(groups).map(([k, rs]) => <Fragment key={k}><div className="pmonth">{MONTHS[+k.slice(5) - 1]} {k.slice(0, 4)}</div>{rs.map(r => <PlanRow key={r.key} r={r} today={today} />)}</Fragment>)}
    </div> : <div className="empty">Er vallen geen {dayPlural} in dit tijdbereik.</div>}
  </div>;
}

function RangeInput({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => boolean }) {
  const [v, setV] = useState(fmtNL(value));
  useEffect(() => setV(fmtNL(value)), [value]);
  const commit = () => { const iso = parseNL(v); if (!iso) { toast('Typ de datum als dd-mm-jjjj, bijvoorbeeld 01-09-2026.'); setV(fmtNL(value)); return; } if (!onChange(iso)) setV(fmtNL(value)); };
  return <div className="field"><label>{label}</label><input value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="dd-mm-jjjj" inputMode="numeric" /></div>;
}

function TopicInput({ keyId, value, placeholder, label, disabled }: { keyId: string; value: string; placeholder: string; label: string; disabled: boolean }) {
  const { entryFor, savePlan, getO, saveOpk } = useSpeltak();
  const [v, setV] = useState(value); const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(value); }, [value]);
  const commit = (val: string) => { const en = { ...entryFor(keyId), topic: val }; const o = en.opkId ? getO(en.opkId) : null; if (o) saveOpk({ ...o, title: val }); savePlan(en); };
  return <input className="ptopic" value={v} disabled={disabled} placeholder={placeholder} aria-label={label}
    onFocus={() => { editing.current = true; }} onChange={e => { setV(e.target.value); commit(e.target.value); }} onBlur={() => { editing.current = false; }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function PlanRow({ r, today }: { r: Row; today: string }) {
  const { settings, getO, unlinkEntry, can, sid } = useSpeltak();
  const nav = useNavigate();
  const e = r.e, d = rowDate(r), type = e ? e.type : 'opkomst', o = e && e.opkId ? getO(e.opkId) : null;
  const [st, en] = entryTimes(settings, e, o || null), past = rowEnd(r) < today, moved = !!(e && e.slot && e.date !== e.slot);
  const sub = type === 'opkomst' ? `wk ${isoWeek(d)} · ${fmtT(st)}–${fmtT(en)}` : type === 'kamp' ? `wk ${isoWeek(d)} · kamp / weekend` : `wk ${isoWeek(d)}`;
  const plan = can('plan');
  const dateBtn = <button className="pdate" disabled={!plan} onClick={() => openModal({ kind: 'date', keyId: r.key })} title="Datum of soort aanpassen"><b>{fmtRange(d, e && e.endDate)}</b><span>{sub}</span>{moved && <span className="moved">verzet van {fmtShort(e!.slot!)}</span>}</button>;
  const topic = <TopicInput keyId={r.key} value={o ? o.title : (e ? e.topic : '')} disabled={!plan} placeholder={type === 'geen' ? 'Reden, bijv. Herfstvakantie' : 'Onderwerp, bijv. Pionieren'} label={'Onderwerp ' + fmtShort(d)} />;
  const cls = ['prow', type, past ? 'past' : ''].join(' ');
  if (type === 'geen') return <div className={cls} id={rowDomId(r.key)}>{dateBtn}<div className="pf"><span className="plabel">Reden</span><div className="pcell nowrap"><span className="pill neutral">Geen opkomst</span>{topic}</div></div></div>;
  const people = (f: 'planners' | 'absent', list: string[]) => <div className="pcell"><PeopleChips list={list} abs={f === 'absent'} />
    {plan && <button className="addbtn" onClick={() => openModal({ kind: 'people', keyId: r.key, field: f })} aria-label={f === 'planners' ? 'Planning door aanpassen' : 'Afwezigheid aanpassen'} title={f === 'planners' ? 'Wie plant deze opkomst?' : 'Wie is er afwezig?'}>{list.length ? <SquarePen size={14} /> : <Plus size={14} />}</button>}</div>;
  let lcls = 'brief', ltxt = 'Geen brief';
  if (e && e.letter.needed) {
    const due = letterDue(settings, e), left = dayDiff(today, due);
    if (e.letter.sent) { lcls += ' sent'; ltxt = 'Verstuurd'; } else if (left < 0) { lcls += ' late'; ltxt = 'Te laat: ' + fmtShort(due); } else { lcls += ' on'; ltxt = 'Vóór ' + fmtShort(due); }
  }
  return <div className={cls} id={rowDomId(r.key)}>{dateBtn}
    <div className="pf"><span className="plabel">Onderwerp</span>{topic}</div>
    <div className="pf"><span className="plabel">Opkomst</span>{o ? <div className="pcell">
      <button className="plink" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)} title="Opkomst openen"><b>{o.title || 'Naamloze opkomst'}</b><span className="hint">{isKamp(o) ? 'kamp · ' : ''}{plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}{minNeed(o) ? ' · min. ' + minNeed(o) : ''}</span>
        {o.cats.length > 0 && <span className="cdots">{o.cats.map(c => opkCatOf(settings, c)).filter(Boolean).map(c => <Dot key={c!.id} color={c!.color} />)}</span>}</button>
      <StatusPill o={o} />
      {can('build') && <button className="iconbtn" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })} title="Leiding indelen" aria-label="Leiding indelen"><SquarePen size={15} /></button>}
      {plan && <button className="iconbtn" onClick={() => { unlinkEntry(e!); toast('Ontkoppeld. De opkomst staat nu bij de concepten in de opkomstenbank.'); }} title="Ontkoppelen" aria-label="Opkomst ontkoppelen"><X size={15} /></button>}
    </div> : <div className="pcell">{plan ? <button className="btn sm" onClick={() => openModal({ kind: 'link', keyId: r.key })}><Plus size={14} />Koppelen</button> : <span className="hint">Nog geen programma</span>}</div>}</div>
    <div className="pf"><span className="plabel">Planning door</span>{people('planners', plannersOf(e, o))}</div>
    <div className="pf"><span className="plabel">Afwezig</span>{people('absent', e ? e.absent : [])}</div>
    <div className="pf"><span className="plabel">Brief</span><div className="pcell"><button className={lcls} disabled={!plan} onClick={() => openModal({ kind: 'letter', keyId: r.key })}><Mail size={14} />{ltxt}</button></div></div>
  </div>;
}
