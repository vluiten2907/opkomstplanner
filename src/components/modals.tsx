import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tent, Trash2, SquarePen } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { Modal, TimePicker, Field, Chip, ConfirmBtn } from './ui';
import { PickOpk } from './shared';
import { addDays, fmtLong, fmtNL, fmtRange, parseNL, fromISO, DAYS, fmtT, fmtDur, isoWeek, todayISO } from '../lib/time';
import { analyze, blockFromLib, byTitle, catOf, dayTitle, entryTimes, isKamp, lanesLayout, minNeed, newKamp, newOpk, plannersOf, PREP_OPTS, prepLabel, rowsIn, setOpkTime, syncKamp, type Opk, type Plan, type Block, type Day, rowDate } from '../lib/model';
import { uid } from '../lib/time';
import type { NameSpec } from '../store/modal';

/* ---------- Datum en soort ---------- */
export function DateModal({ keyId, onClose, onSaved }: { keyId: string; onClose: () => void; onSaved?: (e: Plan) => void }) {
  const { settings, peekEntry, entryFor, unlinkEntry, savePlan, deletePlan, getO } = useSpeltak();
  const e = peekEntry(keyId), slot = keyId.startsWith('s:') ? keyId.slice(2) : (e && e.slot);
  const d0 = e ? e.date : slot!, linked = e && e.opkId ? getO(e.opkId) : null;
  const [st0, en0] = entryTimes(settings, e, linked || null);
  const [type, setType] = useState<Plan['type']>(e ? e.type : 'opkomst');
  const [date, setDate] = useState(fmtNL(d0)); const [end, setEnd] = useState(e ? fmtNL(e.endDate) : '');
  const [st, setSt] = useState(st0); const [en, setEn] = useState(en0); const [note, setNote] = useState(e ? e.note : '');
  const base = slot || d0, mon = addDays(base, -((fromISO(base).getDay() + 6) % 7)), fri = addDays(mon, 4), sat = addDays(mon, 5), sun = addDays(mon, 6);
  const quick: [string, string, string][] = [[DAYS[settings.opkDay] + ' (standaard)', base, ''], ['Vrijdag', fri, ''], ['Zaterdag', sat, ''], ['Zondag', sun, ''], ['Weekend vr–zo', fri, sun], ['Weekend za–zo', sat, sun]];
  const save = () => {
    const iso = parseNL(date), endIso = end.trim() ? parseNL(end) : '';
    if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; }
    if (end.trim() && !endIso) { toast('Typ "tot en met" als dd-mm-jjjj, of laat het leeg.'); return; }
    if (endIso && endIso < iso) { toast('"Tot en met" moet na de datum liggen.'); return; }
    if (!linked && type === 'opkomst' && !endIso && en <= st) { toast('De eindtijd moet na de begintijd liggen.'); return; }
    const en2 = { ...entryFor(keyId) };
    if (!linked) { en2.start = st; en2.end = en; }
    en2.type = type; en2.date = iso; en2.endDate = endIso && endIso !== iso ? endIso : ''; en2.note = note.trim();
    if (en2.type === 'geen' && en2.opkId) { unlinkEntry(en2); en2.opkId = null; toast('De gekoppelde opkomst staat nu bij de concepten.'); }
    savePlan(en2); onSaved?.(en2); onClose();
  };
  const clear = () => { if (!e) { onClose(); return; } if (e.opkId) unlinkEntry(e); deletePlan(e.id); onClose(); toast('Rij leeggemaakt'); };
  return <Modal title="Datum en soort" sub={slot ? 'Vaste ' + DAYS[settings.opkDay] + ': ' + fmtLong(slot) : 'Extra datum'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label="Datum" htmlFor="md-date"><input id="md-date" value={date} onChange={e => setDate(e.target.value)} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="md-end"><input id="md-end" value={end} onChange={e => setEnd(e.target.value)} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
    <Field label="Snel kiezen"><div className="row" style={{ gap: 6 }}>{quick.map(([l, a, b]) => <Chip key={l} onClick={() => { setDate(fmtNL(a)); setEnd(b ? fmtNL(b) : ''); if (b && type === 'opkomst') setType('kamp'); if (!b && type === 'kamp') setType('opkomst'); }}>{l}</Chip>)}</div></Field>
    {linked ? <p className="hint">De tijden komen uit de gekoppelde opkomst: {fmtT(st0)}–{fmtT(en0)}.</p>
      : <div className="two"><Field label="Begintijd / vertrek"><TimePicker value={st} onChange={setSt} /></Field><Field label="Eindtijd / terug"><TimePicker value={en} onChange={setEn} /></Field></div>}
    <Field label="Opmerking" htmlFor="md-note"><textarea id="md-note" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="bijv. vertrek bij het clubhuis" /></Field>
    <div className="row between"><div className="row"><button className="btn primary" onClick={save}>Opslaan</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
      {e && <ConfirmBtn label="Rij leegmaken" confirm="Klik nogmaals om leeg te maken" onConfirm={clear} />}</div>
  </Modal>;
}

/* ---------- Extra datum ---------- */
export function ExtraModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: Plan) => void }) {
  const { settings, savePlan } = useSpeltak();
  const [type, setType] = useState<Plan['type']>('opkomst'); const [date, setDate] = useState(''); const [end, setEnd] = useState(''); const [topic, setTopic] = useState('');
  const save = () => {
    const iso = parseNL(date), endIso = end.trim() ? parseNL(end) : '';
    if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; }
    if ((end.trim() && !endIso) || (endIso && endIso < iso)) { toast('Controleer "tot en met".'); return; }
    const e: Plan = { id: uid(), slot: null, date: iso, endDate: endIso && endIso !== iso ? endIso : '', type, topic: topic.trim(), start: null, end: null, planners: [], absent: [], letter: { needed: false, due: '', sent: false }, opkId: null, note: '', updatedAt: Date.now() };
    savePlan(e); onCreated(e); onClose();
  };
  return <Modal title="Extra datum" sub={'Voor een opkomst, kamp of activiteit buiten de vaste ' + DAYS[settings.opkDay] + 'en.'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label="Datum"><input value={date} onChange={e => setDate(e.target.value)} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field><Field label="Tot en met"><input value={end} onChange={e => setEnd(e.target.value)} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
    <Field label="Onderwerp"><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="bijv. Groepsweekend" /></Field>
    <div className="row"><button className="btn primary" onClick={save}>Toevoegen</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}

/* ---------- Planning door / afwezig ---------- */
export function PeopleModal({ keyId, field, onClose }: { keyId: string; field: 'planners' | 'absent'; onClose: () => void }) {
  const { leaders, peekEntry, entryFor, savePlan, dropAbsent, getO, saveOpk } = useSpeltak();
  const [, bump] = useState(0);
  const [extra, setExtra] = useState('');
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const o = e && e.opkId ? getO(e.opkId) : null;
  const list = e ? (field === 'planners' ? plannersOf(e, o) : e[field]) : []; const names = [...new Set([...leaders, ...list])];
  const toggle = (n: string) => {
    const en = { ...entryFor(keyId) }, off = list.includes(n);
    en[field] = off ? en[field].filter(x => x !== n) : [...en[field], n];
    if (field === 'planners' && off && o && o.lead === n) saveOpk({ ...o, lead: '' }); // oude eindverantwoordelijke telt als planner
    if (field === 'absent') dropAbsent(en); savePlan(en); bump(x => x + 1);
  };
  const add = () => { const v = extra.trim(); if (!v) return; const en = { ...entryFor(keyId) }; if (!en[field].includes(v)) en[field] = [...en[field], v]; if (field === 'absent') dropAbsent(en); savePlan(en); setExtra(''); bump(x => x + 1); };
  return <Modal title={field === 'planners' ? 'Wie plant deze opkomst?' : 'Wie is er afwezig?'} sub={fmtRange(d, e && e.endDate, true)} onClose={onClose}>
    {names.length ? <div className="row" style={{ gap: 6 }}>{names.map(n => <Chip key={n} on={list.includes(n)} onClick={() => toggle(n)}>{n}</Chip>)}</div> : <p className="hint">Nog geen leidingteam.</p>}
    <div className="row"><input className="inp" value={extra} onChange={e => setExtra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Andere naam" style={{ flex: '1 1 160px' }} /><button className="btn" onClick={add}>Toevoegen</button></div>
    <div className="row"><button className="btn primary" onClick={onClose}>Klaar</button></div>
  </Modal>;
}

/* ---------- Brief ---------- */
export function LetterModal({ keyId, onClose }: { keyId: string; onClose: () => void }) {
  const { settings, peekEntry, entryFor, savePlan } = useSpeltak();
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const L = e ? e.letter : { needed: false, due: '', sent: false }, def = addDays(d, -settings.letterDays);
  const [needed, setNeeded] = useState(L.needed); const [due, setDue] = useState(fmtNL(L.due || def)); const [sent, setSent] = useState(L.sent);
  const save = () => {
    const iso = due.trim() ? parseNL(due) : '';
    if (due.trim() && !iso) { toast('Typ de verzenddatum als dd-mm-jjjj.'); return; }
    const en = { ...entryFor(keyId) }; en.letter = { needed, due: iso && iso !== addDays(en.date, -settings.letterDays) ? iso : '', sent };
    savePlan(en); onClose();
  };
  return <Modal title="Brief" sub={fmtRange(d, e && e.endDate, true)} onClose={onClose}>
    <label className="toggle"><input type="checkbox" checked={needed} onChange={e => setNeeded(e.target.checked)} /><span><b>Er moet een brief uit</b><br /><span className="hint">Het dashboard meldt dit vanaf {settings.letterNotice} dagen voor de verzenddatum.</span></span></label>
    <Field label="Brief versturen vóór" hint={`Standaard ${settings.letterDays} dagen voor de opkomst: ${fmtNL(def)}.`}><input value={due} onChange={e => setDue(e.target.value)} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
    <label className="toggle"><input type="checkbox" checked={sent} onChange={e => setSent(e.target.checked)} /><span><b>De brief is verstuurd</b></span></label>
    <div className="row"><button className="btn primary" onClick={save}>Opslaan</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}

/* ---------- Opkomst koppelen aan een datum ---------- */
export function LinkModal({ keyId, onClose, onTakeover }: { keyId: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { settings, opks, peekEntry, entryFor, linkOpk, saveOpk, sid } = useSpeltak();
  const nav = useNavigate();
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const bank = opks.filter(o => o.state === 'bank').sort(byTitle), drafts = opks.filter(o => o.state === 'draft').sort((a, b) => b.updatedAt - a.updatedAt);
  const isKampRow = e && e.type === 'kamp';
  const newOne = (kamp: boolean) => {
    const en = { ...entryFor(keyId) };
    let o: Opk;
    if (kamp) { const n = en.endDate ? Math.min(7, Math.round((fromISO(en.endDate).getTime() - fromISO(en.date).getTime()) / 864e5) + 1) : 3; o = newKamp(settings, n, en.endDate ? en.date : null, en.type === 'kamp' ? en.start : null, en.type === 'kamp' ? en.end : null); }
    else o = newOpk(settings);
    o.title = en.topic; saveOpk(o); linkOpk(o, en, false, true); onClose(); nav(`/s/${sid}/bouwer/${o.id}`);
  };
  return <Modal title="Opkomst koppelen" sub={fmtRange(d, e && e.endDate, true)} onClose={onClose}>
    <div className="row"><button className={'btn' + (isKampRow ? '' : ' primary')} onClick={() => newOne(false)}><Plus size={16} />Nieuwe opkomst</button><button className={'btn' + (isKampRow ? ' primary' : '')} onClick={() => newOne(true)}><Tent size={16} />Weekendkamp</button></div>
    <h3 className="gap-lg">Uit de opkomstenbank</h3>
    {bank.length ? <div className="picklist">{bank.map(o => <PickOpk key={o.id} o={o} label="Kiezen" onPick={() => { const en = { ...entryFor(keyId) }; const linked = linkOpk(o, en, true, false); onClose(); onTakeover(linked.id, true); }} />)}</div> : <div className="empty">De opkomstenbank is nog leeg.</div>}
    {drafts.length > 0 && <><h3 className="gap-lg">Concepten</h3><div className="picklist">{drafts.map(o => <PickOpk key={o.id} o={o} label="Kiezen" onPick={() => { const en = { ...entryFor(keyId) }; linkOpk(o, en, false, true); onClose(); toast('Gekoppeld', { label: 'Opkomst openen', fn: () => nav(`/s/${sid}/bouwer/${o.id}`) }); }} />)}</div></>}
  </Modal>;
}

/* ---------- Opkomst inplannen op een datum ---------- */
export function ToPlanModal({ oid, onClose, onTakeover }: { oid: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { settings, plans, getO, entryFor, entryForDate, linkOpk, sid } = useSpeltak();
  const nav = useNavigate();
  const o = getO(oid)!; const today = todayISO();
  const rows = rowsIn(settings, plans, today, addDays(today, 240)).filter(r => !r.e || (r.e.type !== 'geen' && !r.e.opkId)).slice(0, 24);
  const [custom, setCustom] = useState('');
  // Vanuit de bouwer blijft de ingedeelde leiding staan; alleen uit de bank komt een kopie zonder namen.
  const keep = o.state !== 'bank';
  const go = (e: Plan) => {
    if (e.opkId) { toast('Op die datum staat al een opkomst. Ontkoppel die eerst in de jaarplanning.'); return; }
    const fromBank = o.state === 'bank';
    const linked = linkOpk(o, { ...e }, o.state !== 'draft', keep);
    onClose();
    if (fromBank) { onTakeover(linked.id, true); return; }
    const msg = 'Ingepland op ' + fmtRange(e.date, e.endDate, true);
    if (linked !== o) toast(msg + '. Er is een kopie gemaakt.', { label: 'Kopie openen', fn: () => nav(`/s/${sid}/bouwer/${linked.id}`) }); else toast(msg);
  };
  return <Modal title="Inplannen" sub={o.state === 'bank' ? 'Er wordt een kopie ingepland zonder namen; de opkomst in de bank blijft zoals hij is.' : 'Kies een datum waar nog geen opkomst aan gekoppeld is. De ingedeelde leiding en eindverantwoordelijke gaan mee.'} onClose={onClose}>
    {rows.length ? <div className="picklist">{rows.map(r => { const e = r.e, d = rowDate(r); return <div key={r.key} className="pick"><div className="info"><b>{fmtRange(d, e && e.endDate, true)}</b>
      <span className="hint">{e && e.topic ? e.topic + ' · ' : ''}{e && e.planners.length ? 'planning: ' + e.planners.join(', ') : 'nog niemand toegewezen'}</span></div>
      <button className="btn sm primary" onClick={() => go(entryFor(r.key))}>Hier inplannen</button></div>; })}</div> : <p className="hint">Geen vrije data gevonden in de komende maanden.</p>}
    <div className="row"><input className="inp" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Andere datum: dd-mm-jjjj" inputMode="numeric" style={{ flex: '1 1 180px' }} /><button className="btn" onClick={() => { const iso = parseNL(custom); if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; } go(entryForDate(iso)); }}>Op deze datum</button></div>
  </Modal>;
}

/* ---------- Opkomst overnemen: planning door, leiding per activiteit, programma ---------- */
export function Takeover({ oid, fresh, onClose }: { oid: string; fresh: boolean; onClose: () => void }) {
  const { settings, leaders, lib, getO, saveOpk, entryOfOpk, presentForEntry, sid, savePlan } = useSpeltak();
  const nav = useNavigate();
  const [, bump] = useState(0);
  const [libId, setLibId] = useState(''); const [libDay, setLibDay] = useState(0);
  const o = getO(oid); if (!o) return null;
  const e = entryOfOpk(o), present = e ? presentForEntry(e, o) : [...leaders];
  const A = analyze(o, present, leaders), need = minNeed(o);
  const upd = (fn: (o: Opk) => void) => { fn(o); if (isKamp(o)) syncKamp(o); saveOpk({ ...o }); bump(x => x + 1); };
  const containers = isKamp(o) ? o.days.map((d, i) => ({ d, label: dayTitle(o, i, e ? addDays(e.date, i) : null), lo: d.start, hi: d.end })) : [{ d: o as unknown as Day, label: '', lo: o.start - (o.prep || 0), hi: o.end + (o.post || 0) }];
  const [selId, setSelId] = useState<string | null>(null);
  const toggle = (b: Block, n: string) => upd(() => { b.names = b.names.includes(n) ? b.names.filter(x => x !== n) : [...b.names, n]; });
  /* Compacte tijdlijn: onderdelen die tegelijk zijn staan naast elkaar, net als in de bouwer. */
  const ROW = 20;
  const timeline = (C: typeof containers[0]) => {
    const T0 = C.lo, T1 = C.hi, H = (T1 - T0) / 5 * ROW, pos = lanesLayout(C.d.blocks), long = T1 - T0 > 480;
    const ticks: React.ReactNode[] = [];
    for (let m = T0; m <= T1; m += 5) { if (m % (long ? 30 : 15) !== 0 && m !== T0 && m !== T1) continue; ticks.push(<span key={m} className={'tick' + (m % 60 === 0 ? ' hour' : '')} style={{ top: (m - T0) / 5 * ROW }}>{fmtT(m)}</span>); }
    const off = ((T0 % 15) / 5) * ROW;
    return <div className="tl tk-tl">
      <div className="ticks" style={{ height: H }}>{ticks}</div>
      <div className="lanes" style={{ height: H, ['--row' as any]: ROW + 'px', backgroundPosition: `0 ${off ? -off : 0}px` }}>
        {!isKamp(o) && o.prep ? <div className="zone" style={{ top: 0, height: o.prep / 5 * ROW }}><span>Voorbereiding leiding · {o.prep} min</span></div> : null}
        {!isKamp(o) && o.post ? <div className="zone" style={{ top: (o.end - T0) / 5 * ROW, height: o.post / 5 * ROW }}><span>Nabespreking leiding · {o.post} min</span></div> : null}
        {C.d.blocks.filter(b => b.start + b.dur > T0 && b.start < T1).map(b => {
          const p = pos[b.id], top = (b.start - T0) / 5 * ROW, h = b.dur / 5 * ROW - 3, c = catOf(settings, b.cat);
          const short = !!b.minLeaders && b.names.length < b.minLeaders, extra = b.names.filter(n => !leaders.includes(n));
          const cls = ['blk', h < 46 ? 'short' : '', h < 24 ? 'tiny' : '', h < 92 ? 'mid' : '', b.id === selId ? 'sel' : '', p.n > 1 ? 'overlap' : ''].join(' ');
          return <div key={b.id} className={cls} role="button" tabIndex={0} aria-label={`${b.title || 'Naamloos onderdeel'}, ${fmtT(b.start)} tot ${fmtT(b.start + b.dur)}`}
            style={{ ['--c' as any]: c.color, top: top + 1.5, height: h, left: `calc(${p.lane / p.n * 100}% + 4px)`, width: `calc(${100 / p.n}% - 8px)` }}
            onClick={() => setSelId(b.id === selId ? null : b.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelId(b.id === selId ? null : b.id); } }}>
            <div className="cols3">
              <div className="c1"><div className="t">{b.title || 'Naamloos onderdeel'}</div>
                <div className="when">{fmtT(b.start)}–{fmtT(b.start + b.dur)} · {fmtDur(b.dur)}</div>
                {b.short && <div className="sh">{b.short}</div>}
                <div className="locin">{b.location}</div>
                <div className="tags">{b.minLeaders ? <span className={'tag ' + (short ? 'bad' : 'ok')}>{b.names.length}/{b.minLeaders} leiding</span> : null}</div></div>
              <div className="cl">{b.location || <span className="nobody">–</span>}</div>
              <div className="c2"><div className="names tk-names" onClick={ev => ev.stopPropagation()}>
                {leaders.map(n => present.includes(n)
                  ? <button key={n} type="button" className={'nm' + (b.names.includes(n) ? ' on' : ' off') + (A.clashes.has(b.id + '|' + n) ? ' clash' : '')} aria-pressed={b.names.includes(n)} onClick={() => toggle(b, n)}>{n}</button>
                  : b.names.includes(n) ? <button key={n} type="button" className="nm clash" title="Afwezig" onClick={() => toggle(b, n)}>{n}</button> : null)}
                {extra.map(n => <span key={n} className="nm">{n}</span>)}
              </div></div>
            </div>
            <button className="bdel" onClick={ev => { ev.stopPropagation(); upd(() => { C.d.blocks = C.d.blocks.filter(x => x !== b); }); if (selId === b.id) setSelId(null); toast(`"${b.title || 'Onderdeel'}" verwijderd`); }} title="Onderdeel verwijderen" aria-label="Onderdeel verwijderen"><Trash2 size={14} /></button>
          </div>;
        })}
      </div>
    </div>;
  };
  const selEdit = () => {
    for (const C of containers) {
      const b = C.d.blocks.find(x => x.id === selId); if (!b) continue;
      const durs: number[] = []; for (let d = 5; d <= Math.max(C.hi - b.start, b.dur); d += 5) durs.push(d);
      return <div className="tk-sel"><b>{b.title || 'Naamloos onderdeel'}</b>
        <Field label="Begin"><TimePicker value={b.start} onChange={v => upd(() => { b.start = v; b.dur = Math.max(5, Math.min(b.dur, C.hi - b.start)); })} from={C.lo} to={C.hi - 5} extra /></Field>
        <Field label="Duur"><select className="inp" value={b.dur} onChange={ev => upd(() => { b.dur = +ev.target.value; })}>{durs.map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
        <button className="btn sm ghost" onClick={() => setSelId(null)}>Sluiten</button></div>;
    }
    return null;
  };
  const addLib = () => {
    const l = lib.find(x => x.id === libId) || lib[0]; if (!l) return;
    const C = containers[libDay] || containers[0], bl = [...C.d.blocks].sort((x, y) => x.start - y.start), dur = Math.min(l.dur, C.d.end - C.d.start);
    let t = C.d.start, at: number | null = null;
    for (const x of bl) { if (x.start - t >= dur) { at = t; break; } t = Math.max(t, x.start + x.dur); }
    if (at == null) at = C.d.end - t >= dur ? t : C.d.start;
    const nb = blockFromLib(l, at); nb.dur = dur; upd(() => { C.d.blocks.push(nb); }); toast(`${l.title || 'Activiteit'} toegevoegd om ${fmtT(at!)}`);
  };
  const togglePlanner = (n: string) => {
    if (!e) return; const on = plannersOf(e, o).includes(n);
    if (on && o.lead === n) upd(() => { o.lead = ''; });
    savePlan({ ...e, planners: on ? e.planners.filter(x => x !== n) : [...e.planners, n] });
  };
  const sub = e ? `${fmtRange(e.date, e.endDate, true)} · week ${isoWeek(e.date)}${e.absent.length ? ' · afwezig: ' + e.absent.join(', ') : ''}` : '';
  return <Modal title={fresh ? 'Opkomst overnemen' : 'Leiding indelen'} sub={sub} onClose={onClose} wide>
    <div className="tk-head">
      <Field label="Opkomst titel"><input value={o.title} onChange={ev => upd(() => { o.title = ev.target.value; if (e) savePlan({ ...e, topic: ev.target.value }); })} /></Field>
      {!isKamp(o) && <>
        <Field label="Begintijd"><TimePicker value={o.start} onChange={v => upd(() => { const m = setOpkTime(o, 'start', v); if (m) toast(m); })} from={360} to={1430} /></Field>
        <Field label="Eindtijd"><TimePicker value={o.end} onChange={v => { const m = setOpkTime(o, 'end', v); if (m && m.startsWith('De eindtijd')) { toast(m); return; } upd(() => {}); }} from={365} to={1435} /></Field>
        <Field label="Voorbereiding"><select value={o.prep} onChange={ev => upd(() => { o.prep = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
        <Field label="Nabespreking"><select value={o.post} onChange={ev => upd(() => { o.post = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
      </>}
    </div>
    {e && <div className="field"><span className="lbl">Planning door</span><div className="row" style={{ gap: 6 }}>{[...new Set([...present, ...plannersOf(e, o)])].map(n => <Chip key={n} on={plannersOf(e, o).includes(n)} onClick={() => togglePlanner(n)}>{n}</Chip>)}</div></div>}
    <div className="row" style={{ gap: 6 }}><span className="stat">Minimaal leiding<b>{need}</b></span><span className={'stat' + (need > present.length ? ' warnc' : '')}>Aanwezig<b>{present.length}</b></span><span className={'stat' + (A.warn ? ' warnc' : '')}>Aandachtspunten<b>{A.warn}</b></span></div>
    {A.warn > 0 && <ul className="issues">{A.issues.filter(i => i.lvl === 'warn').slice(0, 6).map((i, k) => <li key={k} className="warn"><i /><span>{i.text}</span></li>)}</ul>}
    <p className="hint">Klik op een naam om die in te delen. Klik op een onderdeel om de tijd aan te passen.</p>
    <div className="tk-prog">{containers.map(C => <div key={C.d.id} className="stack" style={{ gap: 8 }}>
      {C.label && <h3 className="tk-day">{C.label} <span className="hint">{fmtT(C.d.start)}–{fmtT(C.d.end)}</span></h3>}
      {C.d.blocks.length ? timeline(C) : <p className="hint">Nog geen onderdelen.</p>}
    </div>)}</div>
    {selEdit()}
    {lib.length > 0 && <div className="row"><select className="inp" value={libId || lib[0].id} onChange={e => setLibId(e.target.value)} style={{ flex: '1 1 220px' }}>{[...lib].sort(byTitle).map(l => <option key={l.id} value={l.id}>{l.title || 'Naamloos'} · {fmtDur(l.dur)}</option>)}</select>
      {isKamp(o) && <select className="inp" value={libDay} onChange={e => setLibDay(+e.target.value)} style={{ flex: '0 1 160px' }}>{o.days.map((d, i) => <option key={d.id} value={i}>{d.label}</option>)}</select>}
      <button className="btn" onClick={addLib}><Plus size={16} />Activiteit toevoegen</button></div>}
    <div className="row between"><button className="btn ghost" onClick={() => { onClose(); nav(`/s/${sid}/bouwer/${o.id}`); }}><SquarePen size={16} />Volledige bouwer</button><button className="btn primary" onClick={onClose}>Klaar</button></div>
  </Modal>;
}

/* ---------- Naam kiezen (uniek in de bank) ---------- */
export function NameModal({ spec, onClose }: { spec: NameSpec; onClose: () => void }) {
  const [name, setName] = useState(spec.initial);
  const err = !name.trim() ? 'Geef een titel op.' : spec.taken(name) ? 'Deze naam bestaat al in de bank. Kies een andere naam.' : '';
  const ok = () => { if (err) return; onClose(); spec.ok(name.trim()); };
  return <Modal title={spec.title} sub={spec.sub} onClose={onClose}>
    <Field label={spec.label} htmlFor="nm-name"><input id="nm-name" value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /></Field>
    {err && <span className="sb-err">{err}</span>}
    <div className="row"><button className="btn primary" disabled={!!err} onClick={ok}>{spec.okLabel}</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}
