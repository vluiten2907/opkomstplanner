import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Mail, Plus, Tent, Users } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { Strip, StatusPill, CatTags, PeopleChips, usePdf, PageTitle } from '../components/shared';
import { Dot } from '../components/ui';
import { addDays, cap, dayDiff, fmtLong, fmtRange, fmtShort, fmtT, fromISO, isoWeek, mon3, plural, todayISO, toISO, DAYS, MONTHS } from '../lib/time';
import { analyze, catOf, dayTitle, entryStatus, entryTimes, isKamp, letterDue, minNeed, newKamp, newOpk, opkCatList, rowDate, rowEnd, rowsIn, seasonLabel, seasonOf, seasonRange, type Opk, type Plan, type Row } from '../lib/model';

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
  const create = (kamp: boolean) => { const o = kamp ? newKamp(settings, 3) : newOpk(settings); saveOpk(o); nav(`/s/${sid}/bouwer/${o.id}`); };
  return <div className="stack pt-6 md:pt-8" style={{ gap: 20 }}>
    <PageTitle kicker={<>{settings.groupName && <span>{settings.groupName}</span>}<Link className="kicker-switch" to="/speltakken"><Users size={13} />Andere speltak</Link></>} title={S.sp?.name || settings.speltak || 'Overzicht'} sub={`${cap(fmtLong(today))}, week ${isoWeek(today)}`}>
      {can('build') && <><button className="btn" onClick={() => create(true)}><Tent size={16} />Weekendkamp</button><button className="btn primary" onClick={() => create(false)}><Plus size={16} />Nieuwe opkomst</button></>}
    </PageTitle>
    {empty && <section className="card pad stack setup"><h2>Welkom bij {settings.speltak || 'je speltak'}</h2>
      <p className="muted">Begin met de jaarplanning: vul per {DAYS[settings.opkDay]} het onderwerp in en wie de opkomst plant. Bouw daarna het programma in de opkomstbouwer, of nodig eerst je leidingteam uit.</p>
      <div className="row"><Link className="btn primary" to={`/s/${sid}/jaarplanning`}>Naar jaarplanning</Link>{S.isTL && <Link className="btn" to={`/s/${sid}/instellingen`}>Leiding uitnodigen</Link>}</div></section>}
    <div className="dash2">
      <div className="stack" style={{ gap: 20 }}>
        {next ? <Hero r={next} today={today} /> : <section className="card pad empty-hero"><h2>Er staat nog niets gepland</h2><p className="muted">Vul in de jaarplanning de onderwerpen en de planning per {DAYS[settings.opkDay]} in.</p><div className="row"><Link className="btn primary" to={`/s/${sid}/jaarplanning`}>Naar jaarplanning</Link></div></section>}
        <section className="card pad stack">
          <div className="row between"><h3>Daarna</h3><Link className="linkbtn" to={`/s/${sid}/jaarplanning`}>Hele jaarplanning</Link></div>
          {after.length ? <ul className="nextlist">{after.map(r => <NextItem key={r.key} r={r} />)}</ul> : <p className="hint">Nog niets verder gepland.</p>}
        </section>
      </div>
      <aside className="stack lg:mt-16" style={{ gap: 20 }}>
        {letters.length > 0 && <div className="notices">{letters.map(x => <Notice key={x.e.id} e={x.e} due={x.due} today={today} />)}</div>}
        <section className="card pad"><MiniCal today={today} /></section>
        <section className="card pad stack"><SeasonCounts today={today} /></section>
        <section className="card pad stack"><CatSpread today={today} /></section>
      </aside>
    </div>
  </div>;
}

function Notice({ e, due, today }: { e: Plan; due: string; today: string }) {
  const { getO, savePlan, sid } = useSpeltak();
  const nav = useNavigate();
  const left = dayDiff(today, due), o = e.opkId ? getO(e.opkId) : null;
  const title = (o && o.title) || e.topic || 'opkomst';
  const msg = left < 0 ? `${plural(-left, 'dag', 'dagen')} te laat` : left === 0 ? 'Vandaag versturen' : `Vóór ${fmtShort(due)}, nog ${plural(left, 'dag', 'dagen')}`;
  const sent = () => { savePlan({ ...e, letter: { ...e.letter, sent: true } }); toast('Brief gemarkeerd als verstuurd', { label: 'Ongedaan maken', fn: () => savePlan({ ...e, letter: { ...e.letter, sent: false } }) }); };
  return <div className={'notice' + (left < 0 ? ' late' : '')}><Mail size={18} />
    <div className="ntext"><b>Brief: {title}</b><span>{msg} · opkomst {fmtShort(e.date)}</span></div>
    <div className="row"><button className="btn sm ghost" onClick={() => nav(`/s/${sid}/jaarplanning?focus=${e.id}`)}>Bekijken</button><button className="btn sm primary" onClick={sent}>Verstuurd</button></div></div>;
}

function Hero({ r, today }: { r: Row; today: string }) {
  const { settings, getO, presentForEntry, sid, can } = useSpeltak();
  const nav = useNavigate(); const pdf = usePdf();
  const e = r.e, d = rowDate(r), o = e && e.opkId ? getO(e.opkId) : null;
  const [st, en] = entryTimes(settings, e, o || null), days = dayDiff(today, d);
  const when = d < today ? 'Bezig' : days === 0 ? 'Vandaag' : days === 1 ? 'Morgen' : `Over ${days} dagen`;
  const kamp = !!e && e.type === 'kamp';
  const title = (o && o.title) || (e && e.topic) || 'Nog geen onderwerp';
  const short = (o && o.short) || (e && e.note) || '';
  const planners = e ? e.planners : [], absent = e ? e.absent : [], present = presentForEntry(e, o);
  const dt = fromISO(d), need = o ? minNeed(o) : 0;
  const facts = [fmtRange(d, e && e.endDate, true), 'week ' + isoWeek(d), kamp ? `vertrek ${fmtT(st)} · terug ${fmtT(en)}` : `${fmtT(st)}–${fmtT(en)}`];
  if (o && !isKamp(o) && (o.prep || o.post)) facts.push(`leiding ${fmtT(o.start - (o.prep || 0))}–${fmtT(o.end + (o.post || 0))}`);
  if (o && need) facts.push(`minimaal ${need} leiding` + (present.length < need ? ` (${present.length} aanwezig)` : ''));
  if (o && o.location) facts.push(o.location);
  const gotoRow = () => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(r.key)}`);
  return <section className="card hero relative mt-10 md:ml-6">
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[18px]" aria-hidden="true"><span className="glow absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl opacity-40"></span></span>
    <div className="hero-top">
      <div className={'hero-date patch -mt-14 -rotate-6 md:-ml-10' + (kamp ? ' kamp' : '')}><span>{DAYS[dt.getDay()].slice(0, 2)}</span><b>{dt.getDate()}</b><span>{mon3(d)}</span></div>
      <div className="hero-main">
        <div className="row"><span className="eyebrow">{kamp ? 'Komend kamp' : 'Komende opkomst'}</span><span className="pill acc">{when}</span>{o && <StatusPill o={o} />}</div>
        <h2 className="hero-title">{title}</h2>
        {o && <CatTags o={o} />}
        <div className="facts">{facts.map(f => <span key={f}>{f}</span>)}</div>
        {short && <p className="hero-short">{short}</p>}
      </div>
    </div>
    <div className="people">
      <div><span className="lbl">Eindverantwoordelijke</span>{o && o.lead ? <div className="row" style={{ gap: 4 }}><PeopleChips list={[o.lead]} /></div> : o ? (can('build') ? <button className="linkbtn" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })}>Kiezen</button> : <span className="muted">Nog niet gekozen</span>) : <span className="muted">Nog geen opkomst</span>}</div>
      <div><span className="lbl">Planning door</span>{planners.length ? <div className="row" style={{ gap: 4 }}><PeopleChips list={planners} /></div> : can('plan') ? <button className="linkbtn" onClick={() => openModal({ kind: 'people', keyId: r.key, field: 'planners' })}>Leiding toewijzen</button> : <span className="muted">Nog niemand</span>}</div>
      <div><span className="lbl">Leiding aanwezig</span><span>{present.length ? present.join(', ') : <span className="muted">Nog geen leidingteam</span>}</span></div>
      <div><span className="lbl">Afwezig</span>{absent.length ? <div className="row" style={{ gap: 4 }}><PeopleChips list={absent} abs /></div> : <span className="muted">Niemand</span>}</div>
    </div>
    {o ? <>
      <Strip o={o} />
      <ul className="prog"><ProgList o={o} date={e ? e.date : null} /></ul>
      <div className="row"><button className="btn primary" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)}><ExternalLink size={16} />Openen</button>
        {can('build') && <button className="btn" onClick={() => openModal({ kind: 'takeover', oid: o.id, fresh: false })}><Users size={16} />Leiding indelen</button>}
        <button className="btn" onClick={() => pdf(o)}><Download size={16} />PDF maken</button><button className="btn ghost" onClick={gotoRow}>In jaarplanning</button></div>
    </> : <div className="empty"><span>{kamp ? 'Aan dit kamp is nog geen programma gekoppeld.' : 'Aan deze opkomst is nog geen programma gekoppeld.'}</span>
      <div className="row">{can('plan') && <button className="btn primary" onClick={() => openModal({ kind: 'link', keyId: r.key })}>Opkomst koppelen</button>}<button className="btn" onClick={gotoRow}>In jaarplanning</button></div></div>}
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
  const { getO, presentForEntry, leaders, sid } = useSpeltak();
  const nav = useNavigate();
  const e = r.e, d = rowDate(r), o = e && e.opkId ? getO(e.opkId) : null, st = entryStatus(e, o || null, 0);
  const title = (o && o.title) || (e && e.topic) || (st === 'off' ? 'Geen opkomst' : 'Nog geen onderwerp');
  const tags: React.ReactNode[] = [];
  if (st === 'off') tags.push(<span key="off" className="pill neutral">Geen opkomst</span>);
  else {
    if (st === 'kamp') tags.push(<span key="k" className="pill kamp">Kamp</span>);
    if (!e || !e.planners.length) tags.push(<span key="p" className="pill warn">Nog geen planner</span>);
    if (!o) tags.push(<span key="np" className="pill neutral">Geen programma</span>);
    else tags.push(st === 'warn' || analyze(o, presentForEntry(e, o), leaders).warn ? <span key="w" className="pill warn">Aandachtspunten</span> : <span key="g" className="pill good">Programma klaar</span>);
    if (e && e.letter.needed) tags.push(<span key="l" className={'pill ' + (e.letter.sent ? 'good' : 'warn')}>{e.letter.sent ? 'Brief verstuurd' : 'Brief'}</span>);
  }
  const sub = st === 'off' ? fmtRange(d, e && e.endDate) : `${fmtRange(d, e && e.endDate)} · ${e && e.planners.length ? 'planning: ' + e.planners.join(', ') : 'nog niemand toegewezen'}`;
  return <li><button className="nextitem lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5" onClick={() => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(r.key)}`)}>
    <span className="nd"><b>{fromISO(d).getDate()}</b><span>{mon3(d)}</span></span>
    <span className="ni"><b>{title}</b><span className="hint">{sub}</span></span>
    <span className="nt">{tags}</span></button></li>;
}

function MiniCal({ today }: { today: string }) {
  const { settings, plans, getO, sid } = useSpeltak();
  const nav = useNavigate();
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));
  const [y, m] = calMonth.split('-').map(Number);
  const first = toISO(new Date(y, m - 1, 1, 12));
  const from = addDays(first, -((fromISO(first).getDay() + 6) % 7));
  const marks: Record<string, { st: string; key: string; title: string; first: boolean; last: boolean }> = {};
  rowsIn(settings, plans, addDays(from, -10), addDays(from, 41)).forEach(r => {
    const d0 = rowDate(r), d1 = rowEnd(r), e = r.e, o = e && e.opkId ? getO(e.opkId) : null, st = entryStatus(e, o || null, 0);
    const title = `${fmtRange(d0, e && e.endDate)}: ${(o && o.title) || (e && e.topic) || (st === 'off' ? 'geen opkomst' : 'nog open')}`;
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
      weeks.push(mk ? <button key={d} className={cls} onClick={() => nav(`/s/${sid}/jaarplanning?focus=${encodeURIComponent(mk.key)}`)} title={mk.title} aria-label={mk.title}>{fromISO(d).getDate()}</button> : <span key={d} className={cls}>{fromISO(d).getDate()}</span>);
    }
  }
  return <div className="cal"><div className="cal-head"><button className="iconbtn" onClick={() => shift(-1)} aria-label="Vorige maand"><ChevronLeft size={16} /></button><b>{MONTHS[m - 1]} {y}</b><button className="iconbtn" onClick={() => shift(1)} aria-label="Volgende maand"><ChevronRight size={16} /></button></div>
    <div className="cal-grid"><span className="wd">wk</span>{['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(x => <span key={x} className="wd">{x}</span>)}{weeks}</div>
    {calMonth !== today.slice(0, 7) && <button className="linkbtn" onClick={() => setCalMonth(today.slice(0, 7))}>Naar deze maand</button>}</div>;
}

function SeasonCounts({ today }: { today: string }) {
  const { settings, plans, getO, sid } = useSpeltak();
  const Y = seasonOf(settings, today), R = seasonRange(settings, Y), rows = rowsIn(settings, plans, R.from, R.to);
  const c: Record<string, number> = { ok: 0, warn: 0, topic: 0, open: 0, kamp: 0, off: 0 };
  rows.forEach(r => { const o = r.e && r.e.opkId ? getO(r.e.opkId) : null; const st = entryStatus(r.e, o || null, 0); if (st !== 'open' || rowEnd(r) >= today) c[st]++; });
  const letters = plans.filter(e => e.letter.needed && !e.letter.sent && e.date >= today).length;
  const li = (cls: string, label: string, n: number) => <li key={cls}><i className={'legend-dot cday ' + cls} />{label}<b>{n}</b></li>;
  return <><div className="row between"><h3>Seizoen {seasonLabel(settings, Y)}</h3><Link className="linkbtn" to={`/s/${sid}/jaarplanning`}>Openen</Link></div>
    <ul className="counts">{li('ok', 'Programma klaar', c.ok)}{li('warn', 'Programma met aandachtspunten', c.warn)}{li('topic', 'Alleen onderwerp', c.topic)}{li('open', 'Nog open, vanaf vandaag', c.open)}{li('kamp', 'Kampen en weekenden', c.kamp)}{li('off', 'Geen opkomst', c.off)}
      <li><Mail size={14} />Brieven nog te versturen<b>{letters}</b></li></ul></>;
}

function CatSpread({ today }: { today: string }) {
  const { settings, plans, getO } = useSpeltak();
  const Y = seasonOf(settings, today), R = seasonRange(settings, Y), cnt: Record<string, number> = {};
  rowsIn(settings, plans, R.from, R.to).forEach(r => { const o = r.e && r.e.opkId ? getO(r.e.opkId) : null; if (!o) return; o.cats.forEach(c => cnt[c] = (cnt[c] || 0) + 1); });
  const list = opkCatList(settings), max = Math.max(1, ...Object.values(cnt));
  return <><h3>Activiteitengebieden</h3>
    <div className="bars wide">{list.map(c => <div key={c.id} className="barrow"><span className="nm" title={c.label}>{c.label}</span><div className="track"><div className="fill" style={{ width: `${(cnt[c.id] || 0) / max * 100}%`, background: `color-mix(in srgb, ${c.color} var(--keep), #fff)` }} /></div><span className="val">{cnt[c.id] || 0}</span></div>)}</div></>;
}
