import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tent, Trash2, SquarePen } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { Modal, TimePicker, Field, Chip, ConfirmBtn, useMedia } from './ui';
import { PickOpk } from './shared';
import { addDays, clone, fmtLong, fmtNL, fmtRange, parseNL, tidyNL, fromISO, DAYS, fmtT, fmtDur, isoWeek, plural, todayISO } from '../lib/time';
import { analyze, blockFromLib, byTitle, catOf, changeOpkTime, dayTitle, entryTimes, firstFree, fitsTopic, fixedBlocks, isKamp, kampLength, kampStart, lanesLayout, minNeed, newEntry, newKamp, newOpk, opkDaysIn, opkSearchText, plannersOf, PREP_OPTS, prepLabel, relabelDays, rowsIn, syncKamp, type Opk, type Plan, type Block, type Day, rowDate } from '../lib/model';
import { Ticks, PrepZones, blkGeom, blkLabel, lanesStyle } from './timeline';
import type { NameSpec } from '../store/modal';

const NO_UNLINK = 'Hier hangt een opkomst aan. Ontkoppelen kan alleen met het recht Opkomsten of Banken.';
const NO_UNLINK_LEAD = 'Deze naam staat in de opkomst zelf. Weghalen kan alleen met het recht Opkomsten of Banken.';

/* ---------- Datum en soort ---------- */
export function DateModal({ keyId, onClose, onSaved }: { keyId: string; onClose: () => void; onSaved?: (e: Plan) => void }) {
  const { settings, peekEntry, entryFor, unlinkEntry, savePlan, deletePlan, opkOf, saveOpk, can } = useSpeltak();
  const e = peekEntry(keyId), slot = keyId.startsWith('s:') ? keyId.slice(2) : (e && e.slot);
  const d0 = e ? e.date : slot!, linked = opkOf(e);
  const [st0, en0] = entryTimes(settings, e, linked || null);
  const canOpk = can('build') || can('bank');
  const [type, setType] = useState<Plan['type']>(e ? e.type : 'opkomst');
  const [date, setDate] = useState(fmtNL(d0)); const [end, setEnd] = useState(e ? fmtNL(e.endDate) : '');
  const [st, setSt] = useState(st0); const [en, setEn] = useState(en0); const [note, setNote] = useState(e ? e.note : '');
  const base = slot || d0, mon = addDays(base, -((fromISO(base).getDay() + 6) % 7)), fri = addDays(mon, 4), sat = addDays(mon, 5), sun = addDays(mon, 6);
  // de vaste dag als eigen knop alleen als hij nog niet bij vrijdag, zaterdag of zondag staat
  const quick: [string, string, string][] = [...([5, 6, 0].includes(settings.opkDay) ? [] : [[DAYS[settings.opkDay] + ' (standaard)', base, ''] as [string, string, string]]),
    ['Vrijdag', fri, ''], ['Zaterdag', sat, ''], ['Zondag', sun, ''], ['Weekend vr–zo', fri, sun], ['Weekend za–zo', sat, sun]];
  const save = () => {
    const iso = parseNL(date), endIso = end.trim() ? parseNL(end) : '';
    if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; }
    if (end.trim() && !endIso) { toast('Typ "tot en met" als dd-mm-jjjj, of laat het leeg.'); return; }
    if (endIso && endIso < iso) { toast('"Tot en met" moet na de datum liggen.'); return; }
    if (!linked && type === 'opkomst' && !endIso && en <= st) { toast('De eindtijd moet na de begintijd liggen.'); return; }
    const en2 = { ...entryFor(keyId) };
    if (!linked) { en2.start = st; en2.end = en; }
    en2.type = type; en2.date = iso; en2.endDate = endIso && endIso !== iso ? endIso : ''; en2.note = note.trim();
    if (en2.type === 'geen' && en2.opkId) {
      if (!canOpk) { toast(NO_UNLINK); return; }
      unlinkEntry(en2); en2.opkId = null; toast('De gekoppelde opkomst staat nu bij de concepten.');
    }
    // verzet kamp: dagen die een weekdag heten volgen de nieuwe datum
    if (linked && en2.opkId && isKamp(linked) && can('build')) { const c = clone(linked); if (relabelDays(c, iso)) saveOpk(c); }
    savePlan(en2); onSaved?.(en2); onClose();
  };
  const clear = () => { if (!e) { onClose(); return; } if (e.opkId && !canOpk) { toast(NO_UNLINK); return; } if (e.opkId) unlinkEntry(e); deletePlan(e.id); onClose(); toast('Rij leeggemaakt'); };
  return <Modal title="Datum en soort" sub={slot ? 'Vaste ' + DAYS[settings.opkDay] + ': ' + fmtLong(slot) : 'Extra datum'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label="Datum" htmlFor="md-date"><input id="md-date" value={date} onChange={e => setDate(e.target.value)} onBlur={() => setDate(tidyNL(date))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="md-end"><input id="md-end" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => setEnd(tidyNL(end))} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
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
  const { settings, savePlan, peekEntry, entryFor } = useSpeltak();
  const [type, setType] = useState<Plan['type']>('opkomst'); const [date, setDate] = useState(''); const [end, setEnd] = useState(''); const [topic, setTopic] = useState('');
  const geen = type === 'geen', day = DAYS[settings.opkDay];
  const save = () => {
    const iso = parseNL(date), endIso = end.trim() ? parseNL(end) : '';
    if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; }
    if ((end.trim() && !endIso) || (endIso && endIso < iso)) { toast('Controleer "tot en met".'); return; }
    // Geen opkomst (bijv. een vakantie): de vaste opkomstdagen in die periode zelf op Geen opkomst, geen aparte rij ernaast.
    // Een dag met een opkomst of kamp blijft zoals hij is (nooit vanzelf ontkoppelen); een opkomst die naar een datum
    // buiten de periode is verzet, valt er niet onder.
    const to = endIso || iso, slots = geen ? opkDaysIn(settings, iso, to) : [];
    if (slots.length) {
      const done: Plan[] = []; let skipped = 0;
      slots.forEach(d => {
        const cur = peekEntry('s:' + d);
        if (cur && (cur.date < iso || cur.date > to)) return;
        if (cur && (cur.opkId || cur.type === 'kamp')) { skipped++; return; }
        const en = { ...entryFor('s:' + d), type: 'geen' as const };
        if (topic.trim()) en.topic = topic.trim();
        savePlan(en); done.push(en);
      });
      const msg = done.length ? `${plural(done.length, day, day + 'en')} op Geen opkomst gezet` : 'Niets aangepast';
      toast(msg + (skipped ? `. ${plural(skipped, 'datum', 'data')} met een opkomst of kamp overgeslagen.` : ''), undefined, skipped ? 6000 : undefined);
      if (done.length) onCreated(done[0]);
      onClose(); return;
    }
    const e = newEntry(null, iso); e.endDate = endIso && endIso !== iso ? endIso : ''; e.type = type; e.topic = topic.trim();
    savePlan(e); onCreated(e); onClose();
  };
  return <Modal title="Extra datum" sub={'Voor een opkomst, kamp of activiteit buiten de vaste ' + day + 'en, of een periode zonder opkomst.'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label={geen ? 'Van' : 'Datum'} htmlFor="xd-date"><input id="xd-date" value={date} onChange={e => setDate(e.target.value)} onBlur={() => setDate(tidyNL(date))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="xd-end"><input id="xd-end" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => setEnd(tidyNL(end))} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
    {geen && <p className="hint">Alle {day}en in deze periode worden Geen opkomst. Een {day} met een opkomst of kamp blijft staan.</p>}
    <Field label={geen ? 'Reden' : 'Onderwerp'} htmlFor="xd-topic"><input id="xd-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder={geen ? 'bijv. Herfstvakantie' : 'bijv. Groepsweekend'} /></Field>
    <div className="row"><button className="btn primary" onClick={save}>Toevoegen</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}

/* ---------- Planning door / afwezig ---------- */
export function PeopleModal({ keyId, field, onClose }: { keyId: string; field: 'planners' | 'absent'; onClose: () => void }) {
  const { leaders, peekEntry, entryFor, savePlan, dropAbsent, opkOf, saveOpk, can } = useSpeltak();
  const [, bump] = useState(0);
  const [extra, setExtra] = useState('');
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const o = opkOf(e);
  const list = e ? (field === 'planners' ? plannersOf(e, o) : e[field]) : []; const names = [...new Set([...leaders, ...list])];
  const toggle = (n: string) => {
    const en = { ...entryFor(keyId) }, off = list.includes(n);
    // een oude eindverantwoordelijke staat in de opkomst zelf: weghalen schrijft de opkomst, dus alleen met Opkomsten of Banken
    if (field === 'planners' && off && o && o.lead === n && !(can('build') || can('bank'))) { toast(NO_UNLINK_LEAD); return; }
    en[field] = off ? en[field].filter(x => x !== n) : [...en[field], n];
    if (field === 'planners' && off && o && o.lead === n) saveOpk({ ...o, lead: '' }); // oude eindverantwoordelijke telt als planner
    if (field === 'absent') dropAbsent(en); savePlan(en); bump(x => x + 1);
  };
  const add = () => { const v = extra.trim(); if (!v) return; const en = { ...entryFor(keyId) }; if (!en[field].includes(v)) en[field] = [...en[field], v]; if (field === 'absent') dropAbsent(en); savePlan(en); setExtra(''); bump(x => x + 1); };
  return <Modal title={field === 'planners' ? 'Wie plant deze opkomst?' : 'Wie is er afwezig?'} sub={fmtRange(d, e && e.endDate, true)} onClose={onClose}>
    {names.length ? <div className="row" style={{ gap: 6 }}>{names.map(n => <Chip key={n} on={list.includes(n)} onClick={() => toggle(n)}>{n}</Chip>)}</div> : <p className="hint">Nog geen leidingteam.</p>}
    <div className="row"><input className="inp" value={extra} onChange={e => setExtra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Andere naam" aria-label="Andere naam" style={{ flex: '1 1 160px' }} /><button className="btn" onClick={add}>Toevoegen</button></div>
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
    <Field label="Brief versturen vóór" hint={`Standaard ${settings.letterDays} dagen voor de opkomst: ${fmtNL(def)}.`}><input value={due} onChange={e => setDue(e.target.value)} onBlur={() => setDue(tidyNL(due))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
    <label className="toggle"><input type="checkbox" checked={sent} onChange={e => setSent(e.target.checked)} /><span><b>De brief is verstuurd</b></span></label>
    <div className="row"><button className="btn primary" onClick={save}>Opslaan</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}

/* ---------- Opkomst koppelen aan een datum ---------- */
export function LinkModal({ keyId, onClose, onTakeover }: { keyId: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { settings, opks, peekEntry, entryFor, linkOpk, offerPlanTimes, saveOpk, sid } = useSpeltak();
  const nav = useNavigate();
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const [q, setQ] = useState('');
  // zoeken in titel, beschrijving, locatie en onderdelen; wat bij het onderwerp van de datum past komt bovenaan
  const topic = (e && e.topic) || '', ql = q.trim().toLowerCase();
  const fit = (o: Opk) => fitsTopic(o, topic), hit = (o: Opk) => !ql || opkSearchText(o).includes(ql);
  const top = (list: Opk[]) => [...list.filter(fit), ...list.filter(o => !fit(o))];
  const allBank = opks.filter(o => o.state === 'bank'), allDrafts = opks.filter(o => o.state === 'draft');
  const bank = top(allBank.filter(hit).sort(byTitle)), drafts = top(allDrafts.filter(hit).sort((a, b) => b.updatedAt - a.updatedAt));
  const fitTag = (o: Opk) => fit(o) ? <span className="pill good">Past bij onderwerp</span> : undefined;
  const isKampRow = e && e.type === 'kamp';
  const newOne = (kamp: boolean) => {
    const en = { ...entryFor(keyId) };
    let o: Opk;
    // kamp: dagen vanaf de datum in de jaarplanning, zonder "tot en met" t/m zondag
    if (kamp) o = newKamp(settings, kampLength(en.date, en.endDate), en.date, en.type === 'kamp' ? en.start : null, en.type === 'kamp' ? en.end : null);
    else {
      o = newOpk(settings);
      // eigen tijden uit de jaarplanning (bijv. een ochtendopkomst) gaan mee; vaste blokken schuiven mee
      if (en.type === 'opkomst' && en.start != null && en.end != null && en.end > en.start) { o.start = en.start; o.end = en.end; o.blocks = fixedBlocks(settings, en.start, en.end); }
    }
    o.title = en.topic; saveOpk(o); linkOpk(o, en, false, true); onClose(); nav(`/s/${sid}/bouwer/${o.id}`);
  };
  return <Modal title="Opkomst koppelen" sub={fmtRange(d, e && e.endDate, true) + (topic.trim() ? ' · ' + topic.trim() : '')} onClose={onClose}>
    <div className="row"><button className={'btn' + (isKampRow ? '' : ' primary')} onClick={() => newOne(false)}><Plus size={16} />Nieuwe opkomst</button><button className={'btn' + (isKampRow ? ' primary' : '')} onClick={() => newOne(true)}><Tent size={16} />Weekendkamp</button></div>
    {allBank.length + allDrafts.length > 0 && <input className="inp" type="search" value={q} onChange={ev => setQ(ev.target.value)} placeholder="Zoek op titel, beschrijving of onderdeel" aria-label="Zoek opkomst" />}
    <h3 className="gap-lg">Uit de opkomstenbank</h3>
    {bank.length ? <div className="picklist">{bank.map(o => <PickOpk key={o.id} o={o} label="Kiezen" kicker={fitTag(o)} onPick={() => { const en = { ...entryFor(keyId) }; const linked = linkOpk(o, en, true, false); onClose(); onTakeover(linked.id, true); offerPlanTimes(linked, en); }} />)}</div>
      : <div className="empty">{allBank.length ? 'Niets gevonden in de opkomstenbank.' : 'De opkomstenbank is nog leeg.'}</div>}
    {(drafts.length > 0 || (ql && allDrafts.length > 0)) && <><h3 className="gap-lg">Concepten</h3>{drafts.length ? <div className="picklist">{drafts.map(o => <PickOpk key={o.id} o={o} label="Kiezen" kicker={fitTag(o)} onPick={() => { const en = { ...entryFor(keyId) }; linkOpk(o, en, false, true); onClose(); if (!offerPlanTimes(o, en, 'Gekoppeld.')) toast('Gekoppeld', { label: 'Opkomst openen', fn: () => nav(`/s/${sid}/bouwer/${o.id}`) }); }} />)}</div>
      : <p className="hint">Geen concepten gevonden.</p>}</>}
  </Modal>;
}

/* ---------- Opkomst inplannen op een datum ---------- */
export function ToPlanModal({ oid, onClose, onTakeover }: { oid: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { settings, plans, getO, entryFor, entryForDate, linkOpk, offerPlanTimes, sid } = useSpeltak();
  const nav = useNavigate();
  const o = getO(oid)!; const today = todayISO();
  const rows = rowsIn(settings, plans, today, addDays(today, 240)).filter(r => !r.e || (r.e.type !== 'geen' && !r.e.opkId)).slice(0, 24);
  const [custom, setCustom] = useState('');
  // Vanuit de bouwer blijft de ingedeelde leiding staan; alleen uit de bank komt een kopie zonder namen.
  const keep = o.state !== 'bank';
  // een kamp loopt over meer dagen: toon het bereik zoals het wordt ingepland (vr–zo op de vaste zaterdag, zie linkOpk)
  const shown = (d: string, end: string | null | undefined) => {
    if (!isKamp(o) || end) return fmtRange(d, end, true);
    const s = kampStart(o, d); return fmtRange(s, o.days.length > 1 ? addDays(s, o.days.length - 1) : '', true);
  };
  const go = (e: Plan) => {
    if (e.opkId) { toast('Op die datum staat al een opkomst. Ontkoppel die eerst in de jaarplanning.'); return; }
    const fromBank = o.state === 'bank';
    // linkOpk past de rij aan (een kamp krijgt bijv. een andere begindatum en een einddatum): de melding volgt de aangepaste rij
    const en = { ...e };
    const linked = linkOpk(o, en, o.state !== 'draft', keep);
    onClose();
    if (fromBank) { onTakeover(linked.id, true); offerPlanTimes(linked, en); return; }
    const msg = 'Ingepland op ' + fmtRange(en.date, en.endDate, true);
    if (offerPlanTimes(linked, en, msg + '.')) return;
    if (linked !== o) toast(msg + '. Er is een kopie gemaakt.', { label: 'Kopie openen', fn: () => nav(`/s/${sid}/bouwer/${linked.id}`) }); else toast(msg);
  };
  return <Modal title="Inplannen" sub={o.state === 'bank' ? 'Er wordt een kopie ingepland zonder namen; de opkomst in de bank blijft zoals hij is.' : 'Kies een datum waar nog geen opkomst aan gekoppeld is. De ingedeelde leiding gaat mee.'} onClose={onClose}>
    {rows.length ? <div className="picklist">{rows.map(r => { const e = r.e, d = rowDate(r); return <div key={r.key} className="pick"><div className="info"><b>{shown(d, e && e.endDate)}</b>
      <span className="hint">{e && e.topic ? e.topic + ' · ' : ''}{e && e.planners.length ? 'planning: ' + e.planners.join(', ') : 'nog niemand toegewezen'}</span></div>
      <button className="btn sm primary" onClick={() => go(entryFor(r.key))}>Hier inplannen</button></div>; })}</div> : <p className="hint">Geen vrije data gevonden in de komende maanden.</p>}
    <div className="row"><input className="inp" value={custom} onChange={e => setCustom(e.target.value)} onBlur={() => setCustom(tidyNL(custom))} placeholder="Andere datum: dd-mm-jjjj" aria-label="Andere datum" inputMode="numeric" style={{ flex: '1 1 180px' }} /><button className="btn" onClick={() => { const iso = parseNL(custom); if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; } go(entryForDate(iso)); }}>Op deze datum</button></div>
  </Modal>;
}

/* ---------- Opkomst overnemen: planning door, leiding per activiteit, programma ---------- */
export function Takeover({ oid, fresh, onClose }: { oid: string; fresh: boolean; onClose: () => void }) {
  const { settings, leaders, lib, getO, latestO, saveOpk, entryOfOpk, presentForEntry, sid, savePlan } = useSpeltak();
  const nav = useNavigate();
  const [, bump] = useState(0);
  const [libId, setLibId] = useState(''); const [libDay, setLibDay] = useState(0);
  // alle hooks vóór het stoppen hieronder: de opkomst kan elders verwijderd worden terwijl dit venster open staat
  const [selId, setSelId] = useState<string | null>(null);
  // aanraakscherm: de namen zijn daar groter (beter te raken), dus de tijdlijn iets hoger zodat er evenveel in een onderdeel passen
  const coarse = useMedia('(pointer: coarse)');
  const o = getO(oid); if (!o) return null;
  const e = entryOfOpk(o), present = e ? presentForEntry(e, o) : [...leaders];
  const A = analyze(o, present, leaders), need = minNeed(o);
  const upd = (fn: (o: Opk) => void) => { fn(o); if (isKamp(o)) syncKamp(o); saveOpk({ ...o }); bump(x => x + 1); };
  const containers = isKamp(o) ? o.days.map((d, i) => ({ d, label: dayTitle(o, i, e ? addDays(e.date, i) : null), lo: d.start, hi: d.end })) : [{ d: o as unknown as Day, label: '', lo: o.start - (o.prep || 0), hi: o.end + (o.post || 0) }];
  const toggle = (b: Block, n: string) => upd(() => { b.names = b.names.includes(n) ? b.names.filter(x => x !== n) : [...b.names, n]; });
  const delBlock = (C: typeof containers[0], b: Block) => {
    const at = C.d.blocks.indexOf(b), dayId = isKamp(o) ? C.d.id : null;
    upd(() => { C.d.blocks = C.d.blocks.filter(x => x !== b); }); setSelId(null);
    toast(`"${b.title || 'Naamloos onderdeel'}" verwijderd`, { label: 'Ongedaan maken', fn: () => {
      // de nieuwste versie van de opkomst (na het opslaan is dat een nieuw object), ook als dit venster al dicht is
      const cur = latestO(oid); if (!cur) return;
      const list = dayId ? cur.days.find(d => d.id === dayId)?.blocks : cur.blocks;
      if (!list || list.some(x => x.id === b.id)) return;
      list.splice(Math.min(at, list.length), 0, b); if (isKamp(cur)) syncKamp(cur); saveOpk({ ...cur });
    } });
  };
  /* Compacte tijdlijn: onderdelen die tegelijk zijn staan naast elkaar, net als in de bouwer. */
  const ROW = coarse ? 26 : 20;
  const timeline = (C: typeof containers[0]) => {
    const T0 = C.lo, T1 = C.hi, pos = lanesLayout(C.d.blocks);
    return <div className="tl tk-tl">
      <Ticks T0={T0} T1={T1} row={ROW} />
      <div className="lanes" style={lanesStyle(T0, T1, ROW)}>
        <PrepZones o={o} T0={T0} row={ROW} />
        {C.d.blocks.filter(b => b.start + b.dur > T0 && b.start < T1).map(b => {
          const g = blkGeom(pos[b.id], b, T0, ROW, b.id === selId), c = catOf(settings, b.cat);
          const short = !!b.minLeaders && b.names.length < b.minLeaders, extra = b.names.filter(n => !leaders.includes(n));
          return <div key={b.id} className={g.cls.join(' ')} role="button" tabIndex={0} aria-label={blkLabel(b)}
            style={{ ['--c' as any]: c.color, ...g.style }}
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
            {/* alleen bij het gekozen onderdeel: zo tik je op een telefoon niet per ongeluk op de prullenbak in plaats van op een naam */}
            {b.id === selId && <button className="bdel" onClick={ev => { ev.stopPropagation(); delBlock(C, b); }} title="Onderdeel verwijderen" aria-label="Onderdeel verwijderen"><Trash2 size={14} /></button>}
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
        <div className="row"><button className="btn sm ghost" onClick={() => delBlock(C, b)}><Trash2 size={14} />Verwijderen</button><button className="btn sm ghost" onClick={() => setSelId(null)}>Sluiten</button></div></div>;
    }
    return null;
  };
  const addLib = () => {
    const l = lib.find(x => x.id === libId) || lib[0]; if (!l) return;
    const C = containers[libDay] || containers[0], dur = Math.min(l.dur, C.d.end - C.d.start);
    // eerste vrije moment; is er geen gat dat lang genoeg is, dan aan het begin
    const at = firstFree(C.d, dur) ?? C.d.start;
    const nb = blockFromLib(l, at); nb.dur = dur; upd(() => { C.d.blocks.push(nb); }); toast(`${l.title || 'Activiteit'} toegevoegd om ${fmtT(at)}`);
  };
  const setTime = (which: 'start' | 'end', v: number) => {
    const r = changeOpkTime(o, which, v);
    if (!r.opk) { toast(r.error); return; }
    const c = r.opk; upd(() => { o.start = c.start; o.end = c.end; o.blocks = c.blocks; });
    if (r.note) toast(r.note);
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
        <Field label="Begintijd"><TimePicker value={o.start} onChange={v => setTime('start', v)} from={360} to={1430} /></Field>
        <Field label="Eindtijd"><TimePicker value={o.end} onChange={v => setTime('end', v)} from={365} to={1435} /></Field>
        <Field label="Voorbereiding"><select value={o.prep} onChange={ev => upd(() => { o.prep = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
        <Field label="Nabespreking"><select value={o.post} onChange={ev => upd(() => { o.post = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
      </>}
    </div>
    {e && <div className="field"><span className="lbl">Planning door</span><div className="row" style={{ gap: 6 }}>{[...new Set([...present, ...plannersOf(e, o)])].map(n => <Chip key={n} on={plannersOf(e, o).includes(n)} onClick={() => togglePlanner(n)}>{n}</Chip>)}</div></div>}
    <div className="row" style={{ gap: 6 }}><span className="stat">Minimaal leiding<b>{need}</b></span><span className={'stat' + (need > present.length ? ' warnc' : '')}>Aanwezig<b>{present.length}</b></span><span className={'stat' + (A.warn ? ' warnc' : '')}>Aandachtspunten<b>{A.warn}</b></span></div>
    {A.warn > 0 && <ul className="issues">{A.issues.filter(i => i.lvl === 'warn').slice(0, 6).map((i, k) => <li key={k} className="warn"><i /><span>{i.text}</span></li>)}</ul>}
    <p className="hint">Klik op een naam om die in te delen. Klik op een onderdeel om de tijd aan te passen of het weg te halen.</p>
    <div className="tk-prog">{containers.map(C => <div key={C.d.id} className="stack" style={{ gap: 8 }}>
      {C.label && <h3 className="tk-day">{C.label} <span className="hint">{fmtT(C.d.start)}–{fmtT(C.d.end)}</span></h3>}
      {C.d.blocks.length ? timeline(C) : <p className="hint">Nog geen onderdelen.</p>}
    </div>)}</div>
    {selEdit()}
    {lib.length > 0 && <div className="row"><select className="inp" aria-label="Activiteit om toe te voegen" value={libId || lib[0].id} onChange={e => setLibId(e.target.value)} style={{ flex: '1 1 220px' }}>{[...lib].sort(byTitle).map(l => <option key={l.id} value={l.id}>{l.title || 'Naamloos'} · {fmtDur(l.dur)}</option>)}</select>
      {isKamp(o) && <select className="inp" aria-label="Dag" value={libDay} onChange={e => setLibDay(+e.target.value)} style={{ flex: '0 1 160px' }}>{o.days.map((d, i) => <option key={d.id} value={i}>{d.label}</option>)}</select>}
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
    <Field label={spec.label} htmlFor="nm-name"><input id="nm-name" value={name} autoFocus aria-invalid={!!err} aria-describedby="nm-err" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /></Field>
    {/* altijd aanwezig, alleen de tekst verandert: zo leest een schermlezer de fout voor tijdens het typen */}
    <span className="sb-err" id="nm-err" aria-live="polite">{err}</span>
    <div className="row"><button className="btn primary" disabled={!!err} onClick={ok}>{spec.okLabel}</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}
