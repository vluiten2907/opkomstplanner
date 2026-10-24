import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Tent, Trash2, SquarePen, Users } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast, undoAction } from '../store/toast';
import { Modal, TimePicker, Field, Chip, ConfirmBtn, scrollCalm, useMedia } from './ui';
import { PickOpk, copySharedToBank } from './shared';
import { addDays, clone, fmtLong, fmtNL, fmtRange, fmtShort, parseNL, parseRange, tidyNL, fromISO, DAYS, fmtT, fmtDur, isoWeek, plural, todayISO } from '../lib/time';
import { analyze, blockFromLib, byTitle, catOf, changeOpkTime, dayTitle, defaultTimes, entryTimes, ownTimes, firstFree, fitsTopic, isBlankPlan, isKamp, kampBase, kampMismatch, opkOnKamp, kampMismatchNote, kampStart, lanesLayout, minNeed, newEntry, opkDaysIn, opkSearchText, plannersOf, PREP_OPTS, prepLabel, relabelDays, rowsIn, shownEnd, syncKamp, type Opk, type Plan, type Block, type Day, rowDate } from '../lib/model';
import { Ticks, PrepZones, blkGeom, blkLabel, byTime, focusSoon, lanesStyle, useKeepFocus } from './timeline';
import { openModal, type NameSpec } from '../store/modal';
import { makeForEntry, plannedUndo } from '../store/fresh';
import type { Gedeeld } from '../store/groepsbank';

const NO_UNLINK = 'Hier hangt een opkomst aan. Ontkoppelen kan alleen met het recht Opkomsten of Banken.';
const NO_UNLINK_LEAD = 'Deze naam staat in de opkomst zelf. Weghalen kan alleen met het recht Opkomsten of Banken.';

/* ---------- Datum en soort ---------- */
export function DateModal({ keyId, onClose, onSaved }: { keyId: string; onClose: () => void; onSaved?: (e: Plan) => void }) {
  const { settings, peekEntry, entryFor, unlinkEntry, savePlan, deletePlan, opkOf, saveOpk, can, latest } = useSpeltak();
  const e = peekEntry(keyId), slot = keyId.startsWith('s:') ? keyId.slice(2) : (e && e.slot);
  const d0 = e ? e.date : slot!, linked = opkOf(e);
  const [st0, en0] = entryTimes(settings, e, linked || null);
  const canOpk = can('build') || can('bank');
  const [type, setType] = useState<Plan['type']>(e ? e.type : 'opkomst');
  const [date, setDate] = useState(fmtNL(d0)); const [end, setEnd] = useState(e ? fmtNL(e.endDate) : '');
  const [st, setSt] = useState(st0); const [en, setEn] = useState(en0); const [note, setNote] = useState(e ? e.note : '');
  // Rij zonder eigen tijden: zolang je de tijden niet zelf aanpast, volgen ze de soort en de datums
  // (een kamp vertrekt standaard 's avonds en is de laatste dag 's middags terug, net als een nieuw weekendkamp).
  // Eigen tijden zijn alleen tijden die afwijken van de standaard: een oudere rij met de standaardtijden opgeslagen volgt ook de soort.
  const [touched, setTouched] = useState(false);
  const own = ownTimes(settings, e);
  // "tot en met" zonder jaartal telt vanaf de datum (zoals bij opslaan)
  const dRef = parseNL(date) || d0;
  const [stV, enV] = linked || own || touched ? [st, en] : defaultTimes(settings, type, dRef, (end.trim() && parseNL(end, dRef)) || '');
  const base = slot || d0, mon = addDays(base, -((fromISO(base).getDay() + 6) % 7)), fri = addDays(mon, 4), sat = addDays(mon, 5), sun = addDays(mon, 6);
  // de vaste dag als eigen knop alleen als hij nog niet bij vrijdag, zaterdag of zondag staat
  const quick: [string, string, string][] = [...([5, 6, 0].includes(settings.opkDay) ? [] : [[DAYS[settings.opkDay] + ' (standaard)', base, ''] as [string, string, string]]),
    ['Vrijdag', fri, ''], ['Zaterdag', sat, ''], ['Zondag', sun, ''], ['Weekend vr–zo', fri, sun], ['Weekend za–zo', sat, sun]];
  // Kamp / weekend zonder "tot en met" op een vrijdag, zaterdag of zondag: meteen het weekend vr–zo (zoals een nieuw weekendkamp),
  // zodat je ziet wat er gemaakt wordt. Niet op een andere dag (dan valt de rij buiten zijn vaste dag) en niet bij een gekoppelde opkomst.
  // Weer een andere soort terwijl die datums nog zo staan: de datums van daarvoor terug.
  const autoRange = useRef<{ date: string; end: string; was: [string, string] } | null>(null);
  const pickType = (v: Plan['type']) => {
    setType(v);
    const a = autoRange.current;
    if (v !== 'kamp') { if (a && a.date === date && a.end === end) { setDate(a.was[0]); setEnd(a.was[1]); } autoRange.current = null; return; }
    if (type === 'kamp' || linked || end.trim()) return;
    const wd = fromISO(dRef).getDay();
    if (![5, 6, 0].includes(wd)) return;
    const m = addDays(dRef, -((wd + 6) % 7)), nd = fmtNL(addDays(m, 4)), ne = fmtNL(addDays(m, 6));
    autoRange.current = { date: nd, end: ne, was: [date, end] };
    setDate(nd); setEnd(ne);
  };
  // leeg "tot en met": wat dat betekent (een kamp loopt dan t/m de eerstvolgende zondag, zie kampLength)
  const impliedEnd = type === 'kamp' && !linked ? shownEnd({ type, date: dRef, endDate: '', opkId: null }) : '';
  const endHint = impliedEnd ? 'leeg = t/m ' + DAYS[fromISO(impliedEnd).getDay()] : 'leeg = één dag';
  const save = () => {
    const r = parseRange(date, end);
    if ('error' in r) { toast(r.error); return; }
    const { iso, endIso } = r;
    if (!linked && type === 'opkomst' && !endIso && enV <= stV) { toast('De eindtijd moet na de begintijd liggen.'); return; }
    const en2 = { ...entryFor(keyId) };
    en2.type = type; en2.date = iso; en2.endDate = endIso && endIso !== iso ? endIso : ''; en2.note = note.trim();
    // Alleen echt eigen tijden opslaan (zelf aangepast, of al eigen). De standaardtijden niet: anders blijft een rij die tijden houden
    // als je later de soort of de standaard verandert (een kamp met opkomsttijden, of een opkomst die 19:00–15:00 duurt).
    if (!linked) {
      const [ds, de] = defaultTimes(settings, en2.type, en2.date, en2.endDate), mine = (touched || own) && (stV !== ds || enV !== de);
      en2.start = mine ? stV : null; en2.end = mine ? enV : null;
    }
    // Geen opkomst op een gekoppelde rij: de opkomst gaat naar de concepten, met Ongedaan maken (zie relinkGeen)
    let unlinked: (() => void) | null = null;
    if (en2.type === 'geen' && en2.opkId) {
      if (!canOpk) { toast(NO_UNLINK); return; }
      const back = clone(e!), oid = en2.opkId;
      unlinkEntry(en2); en2.opkId = null; unlinked = () => relinkGeen(back, oid);
    }
    // verzet kamp: dagen die een weekdag heten volgen de nieuwe datum; past de lengte niet meer bij de rij, dan een melding
    const misfit = linked && en2.opkId ? kampMismatchNote(linked, en2.date, en2.endDate, en2.type) : '';
    if (linked && en2.opkId && isKamp(linked) && can('build')) { const c = clone(linked); if (relabelDays(c, iso)) saveOpk(c); }
    savePlan(en2); onSaved?.(en2); onClose();
    if (unlinked) toast('De gekoppelde opkomst staat nu bij de concepten.', undoAction(unlinked));
    else if (misfit) toast(misfit, undefined, 8000);
  };
  // Ongedaan maken na Geen opkomst: soort, datums en onderwerp terug en de opkomst weer gekoppeld, met de nieuwste stand.
  // Alleen als de rij nog Geen opkomst is zonder opkomst, en de opkomst nog een concept is dat nergens anders aan hangt (zoals restoreRow).
  const relinkGeen = (back: Plan, oid: string) => {
    const L = latest(), cur = L.plans.find(p => p.id === back.id), c = L.getO(oid);
    if (!cur || cur.type !== 'geen' || cur.opkId || !c || c.state !== 'draft' || L.plans.some(p => p.opkId === oid)) { toast('Kan niet meer terug: de datum of de opkomst is intussen veranderd.'); return; }
    L.savePlan({ ...cur, type: back.type, date: back.date, endDate: back.endDate, topic: back.topic, opkId: oid });
    L.saveOpk({ ...c, state: 'planned' });
    toast('Teruggezet');
  };
  const clear = () => {
    if (!e) { onClose(); return; }
    if (e.opkId && !canOpk) { toast(NO_UNLINK); return; }
    // vóór het ontkoppelen bewaren (dat zet het onderwerp op de titel van de opkomst)
    const back = clone(e), oid = e.opkId;
    if (e.opkId) unlinkEntry(e);
    deletePlan(e.id); onClose();
    toast('Rij leeggemaakt', undoAction(() => restoreRow(back, oid)));
  };
  // Ongedaan maken: de rij terug met hetzelfde id, met de nieuwste stand. Is er intussen een nieuwe rij voor dezelfde dag
  // (bijv. door in de lege rij te klikken), dan alleen terug als die nog leeg is. De opkomst gaat weer vast als hij nog een vrij concept is.
  const restoreRow = (back: Plan, oid: string | null) => {
    const L = latest();
    if (L.plans.some(p => p.id === back.id)) return;
    const twin = back.slot ? L.plans.find(p => p.slot === back.slot) : null;
    if (twin && !isBlankPlan(twin)) { toast('Kan niet meer terug: op die datum staat intussen iets anders.'); return; }
    if (twin) L.deletePlan(twin.id);
    const cur = oid ? L.getO(oid) : undefined, relink = !!cur && cur.state === 'draft' && !L.plans.some(p => p.opkId === cur.id);
    L.savePlan({ ...back, opkId: relink ? cur!.id : null });
    if (relink) L.saveOpk({ ...cur!, state: 'planned' });
    toast('Rij teruggezet');
  };
  return <Modal title="Datum en soort" sub={slot ? 'Vaste ' + DAYS[settings.opkDay] + ': ' + fmtLong(slot) : 'Extra datum'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => pickType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label="Datum" htmlFor="md-date"><input id="md-date" value={date} onChange={e => setDate(e.target.value)} onBlur={() => setDate(tidyNL(date))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="md-end"><input id="md-end" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => setEnd(tidyNL(end, parseNL(date)))} placeholder={endHint} inputMode="numeric" /></Field></div>
    <Field label="Snel kiezen"><div className="row" style={{ gap: 6 }}>{quick.map(([l, a, b]) => <Chip key={l} onClick={() => { setDate(fmtNL(a)); setEnd(b ? fmtNL(b) : ''); if (b && type === 'opkomst') setType('kamp'); if (!b && type === 'kamp') setType('opkomst'); }}>{l}</Chip>)}</div></Field>
    {linked && type === 'geen' ? <p className="hint">De gekoppelde opkomst gaat naar de concepten.</p>
      : linked ? <p className="hint">De tijden komen uit de gekoppelde opkomst: {fmtT(st0)}–{fmtT(en0)}.</p>
      : <div className="two"><Field label="Begintijd / vertrek"><TimePicker value={stV} onChange={v => { setSt(v); setEn(enV); setTouched(true); }} /></Field><Field label="Eindtijd / terug"><TimePicker value={enV} onChange={v => { setSt(stV); setEn(v); setTouched(true); }} /></Field></div>}
    <Field label="Opmerking" htmlFor="md-note"><textarea id="md-note" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="bijv. vertrek bij het clubhuis" /></Field>
    <div className="row between"><div className="row"><button className="btn primary" onClick={save}>Opslaan</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
      {e && <ConfirmBtn label="Rij leegmaken" confirm="Klik nogmaals om leeg te maken" onConfirm={clear} />}</div>
  </Modal>;
}

/* ---------- Extra datum ---------- */
export function ExtraModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: Plan) => void }) {
  const { settings, savePlan, peekEntry, entryFor, latest } = useSpeltak();
  const [type, setType] = useState<Plan['type']>('opkomst'); const [date, setDate] = useState(''); const [end, setEnd] = useState(''); const [topic, setTopic] = useState('');
  const geen = type === 'geen', day = DAYS[settings.opkDay];
  const save = () => {
    const r = parseRange(date, end);
    if ('error' in r) { toast(r.error); return; }
    const { iso, endIso } = r;
    // Geen opkomst (bijv. een vakantie): de vaste opkomstdagen in die periode zelf op Geen opkomst, geen aparte rij ernaast.
    // Een dag met een opkomst, kamp of onderwerp blijft zoals hij is (nooit vanzelf ontkoppelen of een onderwerp overschrijven);
    // een dag die al Geen opkomst is, krijgt wel de nieuwe reden. Een opkomst die naar een datum buiten de periode is verzet, valt er niet onder.
    const to = endIso || iso, slots = geen ? opkDaysIn(settings, iso, to) : [];
    if (slots.length) {
      const done: Plan[] = [], before: (Plan | null)[] = []; let skipped = 0;
      slots.forEach(d => {
        const cur = peekEntry('s:' + d);
        if (cur && (cur.date < iso || cur.date > to)) return;
        if (cur && (cur.opkId || cur.type === 'kamp' || (cur.type !== 'geen' && cur.topic.trim()))) { skipped++; return; }
        const en = { ...entryFor('s:' + d), type: 'geen' as const };
        if (topic.trim()) en.topic = topic.trim();
        savePlan(en); done.push(en); before.push(cur ? clone(cur) : null);
      });
      // Ongedaan maken: soort en reden terug zoals ze waren; een rij die hiervoor nog niet bestond, weer weg.
      // Met de nieuwste stand van elke rij, en alleen als hij intussen niet opnieuw is aangepast.
      const undo = () => {
        const L = latest();
        done.forEach((en, i) => {
          const now = L.plans.find(p => p.id === en.id), was = before[i];
          if (!now || now.type !== 'geen' || now.topic !== en.topic) return;
          if (was) L.savePlan({ ...now, type: was.type, topic: was.topic });
          else if (!now.opkId && !now.planners.length && !now.absent.length && !now.note.trim() && !now.letter.needed) L.deletePlan(now.id);
          else L.savePlan({ ...now, type: 'opkomst', topic: '' });
        });
      };
      const msg = done.length ? `${plural(done.length, day, day + 'en')} op Geen opkomst gezet` : 'Niets aangepast';
      toast(msg + (skipped ? `. ${plural(skipped, 'datum', 'data')} met een opkomst, onderwerp of kamp overgeslagen.` : ''), done.length ? undoAction(undo) : undefined, skipped ? 8000 : undefined);
      if (done.length) onCreated(done[0]);
      onClose(); return;
    }
    // Valt er een vaste dag in die nog leeg is (bijv. een opkomst op een lege zaterdag, of een weekend vr–zo), dan wordt dát de rij
    // (zoals Weekend vr–zo in Datum en soort), geen tweede, lege rij voor dezelfde zaterdag ernaast. Een dag met inhoud blijft staan.
    const last = endIso && endIso !== iso ? endIso : '';
    const free = opkDaysIn(settings, iso, last || iso).find(d => { const cur = peekEntry('s:' + d); return !cur || isBlankPlan(cur); });
    const e = free ? { ...entryFor('s:' + free) } : newEntry(null, iso);
    e.date = iso; e.endDate = last; e.type = type; e.topic = topic.trim();
    savePlan(e); onCreated(e); onClose();
  };
  return <Modal title="Extra datum" sub={'Voor een opkomst, kamp of activiteit buiten de vaste ' + day + 'en, of een periode zonder opkomst.'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label={geen ? 'Van' : 'Datum'} htmlFor="xd-date"><input id="xd-date" value={date} onChange={e => setDate(e.target.value)} onBlur={() => setDate(tidyNL(date))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="xd-end"><input id="xd-end" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => setEnd(tidyNL(end, parseNL(date)))} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
    {geen && <p className="hint">Alle {day}en in deze periode worden Geen opkomst. Een {day} met een opkomst, onderwerp of kamp blijft staan.</p>}
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
    {names.length ? <div className="row" style={{ gap: 6 }} role="group" aria-label={field === 'planners' ? 'Planning door' : 'Afwezig'}>{names.map(n => <Chip key={n} on={list.includes(n)} onClick={() => toggle(n)}>{n}</Chip>)}</div> : <p className="hint">Nog geen leidingteam.</p>}
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
export function LinkModal({ keyId, q0, back, onClose, onTakeover }: { keyId: string; q0?: string; back?: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const S = useSpeltak();
  const { opks, peekEntry, sid, sp, can, canLink, shared, latest } = S;
  const nav = useNavigate(), loc = useLocation();
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const [q, setQ] = useState(q0 || '');
  // terug uit Andere naam kiezen: de focus op Kiezen bij de groepsopkomst waar je vandaan kwam (staat hij er niet meer, dan het zoekveld)
  useEffect(() => { if (back) focusSoon(`.modal .pick[data-pick="${CSS.escape('g:' + back)}"] button`, '.modal input[type=search]'); }, [back]);
  // zoeken in titel, beschrijving, locatie en onderdelen; wat bij het onderwerp van de datum past staat bovenaan in een eigen groep
  const topic = (e && e.topic) || '', ql = q.trim().toLowerCase();
  const fit = (o: Opk) => fitsTopic(o, topic), hit = (o: Opk) => !ql || opkSearchText(o).includes(ql);
  const allBank = opks.filter(o => o.state === 'bank'), allDrafts = opks.filter(o => o.state === 'draft');
  const bankHits = allBank.filter(hit).sort(byTitle), draftHits = allDrafts.filter(hit).sort((a, b) => b.updatedAt - a.updatedAt);
  const bank = bankHits.filter(o => !fit(o)), drafts = draftHits.filter(o => !fit(o));
  // groepsbank: wat andere speltakken delen (kopiëren naar de eigen bank hoort bij Banken). Al gekopieerd? Dan staat hij hierboven bij de eigen bank.
  const copied = new Set(allBank.map(o => o.fromShared).filter(Boolean));
  const allGroup = sp?.gid && canLink && can('bank') ? (shared || []).filter(g => g.sid !== sid && !copied.has(g.id)) : [];
  const groupHits = allGroup.filter(g => !ql || (opkSearchText(g.opk) + ' ' + g.speltakName.toLowerCase()).includes(ql)).sort((a, b) => byTitle(a.opk, b.opk));
  const group = groupHits.filter(g => !fit(g.opk));
  // past bij het onderwerp: eerst de concepten (vaak al voor deze datum gemaakt), dan uit de eigen bank, dan uit de groep; elk zegt waar het vandaan komt
  type Fit = { o: Opk; from: 'draft' | 'bank' } | { o: Opk; from: 'group'; g: Gedeeld };
  const fits: Fit[] = [...draftHits.filter(fit).map(o => ({ o, from: 'draft' as const })), ...bankHits.filter(fit).map(o => ({ o, from: 'bank' as const })),
    ...groupHits.filter(g => fit(g.opk)).map(g => ({ o: g.opk, from: 'group' as const, g }))];
  const fitsGroup = fits.some(f => f.from === 'group');
  const isKampRow = e && e.type === 'kamp';
  // net als Maken in de opkomstbouwer: details open, en een melding met Ongedaan maken
  const newOne = (kamp: boolean) => { onClose(); makeForEntry(S, keyId, kamp, nav, loc.pathname + loc.search); };
  // een nieuwe (lege) opkomst maken en die in de bouwer uitwerken hoort bij Opkomsten; uit de bank of een concept koppelen kan ook zonder
  const build = can('build');
  const openOpk = (id: string) => () => nav(`/s/${sid}/bouwer/${id}`);
  // uit de bank: een kopie zonder namen inplannen (met Opkomsten daarna Opkomst overnemen); een concept: dat concept zelf koppelen
  const pickBank = (o: Opk) => { onClose(); linkBankCopy(S, o, keyId, onTakeover, id => openOpk(id)()); };
  const pickDraft = (o: Opk) => { onClose(); linkDraft(S, o, keyId); };
  // uit de groep: eerst een kopie in de eigen bank (met een vrije naam), dan een kopie daarvan inplannen, zonder namen (zoals uit de eigen bank)
  // (het venster voor een andere naam kan ertussen hebben gestaan: L is de nieuwste stand). Ongedaan maken haalt alleen de ingeplande kopie weg.
  // Alleen de kopie in de bank krijgt zo nodig een andere naam (uniek in de bank); de ingeplande opkomst (en dus het onderwerp van de rij) houdt de eigen titel.
  // Annuleren in Andere naam kiezen: terug naar dit venster, met dezelfde zoekterm en de focus op deze Kiezen.
  const pickShared = (g: Gedeeld) => {
    const t = g.opk.title.trim();
    copySharedToBank(g, allBank, 'Kopiëren en inplannen', latest, (copy, note, L) => {
      onClose();
      linkBankCopy(L, { ...copy, title: t || copy.title }, keyId, onTakeover, id => openOpk(id)(), `"${copy.title || 'Opkomst'}" staat nu ook in jullie opkomstenbank.` + (note ? ' ' + note : ''));
    }, {
      label: 'Naam in jullie opkomstenbank', sub: t ? `"${t}" staat al in jullie opkomstenbank. De ingeplande opkomst houdt de naam ${t}.` : undefined,
      back: () => openModal({ kind: 'link', keyId, q, back: g.id }),
    });
  };
  const fromGroup = (g: Gedeeld) => <span className="pk-from"><Users size={13} aria-hidden="true" />Uit de groep · {g.speltakName || 'Speltak'}</span>;
  const copyHint = <p className="hint">Kiezen bij een opkomst uit de groep zet ook een kopie in jullie opkomstenbank.</p>;
  // alles uit de groep staat al bij Past bij: geen eigen kop (en geen "Niets gevonden in de groep")
  const groupBlock = group.length > 0 || (ql && allGroup.length > 0 && !groupHits.length) ? <><h3 className="gap-lg">Uit de groep</h3>
    {group.length ? <div className="picklist">{group.map(g => <PickOpk key={g.id} pickId={'g:' + g.id} o={g.opk} cats={g.catDefs} label="Kiezen" primary={false}
      kicker={<span className="pk-from"><Users size={13} aria-hidden="true" />{g.speltakName || 'Speltak'}</span>} onPick={() => pickShared(g)} />)}</div>
      : <p className="hint">Niets gevonden in de groep.</p>}
    {/* staat er al bij Past bij */}
    {!fitsGroup && copyHint}</> : null;
  return <Modal title="Opkomst koppelen" sub={fmtRange(d, shownEnd(e), true) + (topic.trim() ? ' · ' + topic.trim() : '')} onClose={onClose}>
    {/* past er iets bij het onderwerp, dan is dat de hoofdknop (Kiezen bij het eerste); anders Nieuwe opkomst of Weekendkamp */}
    {build ? <div className="row"><button className={'btn' + (!fits.length && !isKampRow ? ' primary' : '')} onClick={() => newOne(false)}><Plus size={16} />Nieuwe opkomst</button><button className={'btn' + (!fits.length && isKampRow ? ' primary' : '')} onClick={() => newOne(true)}><Tent size={16} />Weekendkamp</button></div>
      : <p className="hint">Kies een opkomst uit de bank of een concept. Een nieuwe opkomst maken kan met het recht Opkomsten.</p>}
    {allBank.length + allDrafts.length + allGroup.length > 0 && <input className="inp" type="search" value={q} onChange={ev => setQ(ev.target.value)} placeholder="Zoek op titel, beschrijving of onderdeel" aria-label="Zoek opkomst" />}
    {fits.length > 0 && <><h3 className="gap-lg">Past bij {topic.trim()}</h3>
      <div className="picklist">{fits.map((f, i) => f.from === 'group'
        ? <PickOpk key={'g:' + f.g.id} pickId={'g:' + f.g.id} o={f.o} cats={f.g.catDefs} label="Kiezen" primary={i === 0} kicker={fromGroup(f.g)} onPick={() => pickShared(f.g)} />
        : <PickOpk key={f.o.id} o={f.o} label="Kiezen" primary={i === 0} kicker={<span className="pk-from">{f.from === 'draft' ? 'Concept' : 'Uit de opkomstenbank'}</span>}
          onPick={() => f.from === 'draft' ? pickDraft(f.o) : pickBank(f.o)} />)}</div>
      {fitsGroup && copyHint}</>}
    {/* eigen bank nog leeg, de groep niet: de groep eerst */}
    {!allBank.length && groupBlock}
    {/* alles uit de bank staat al bij Past bij: geen lege kop */}
    {!(bankHits.length && !bank.length) && <><h3 className="gap-lg">Uit de opkomstenbank</h3>
      {bank.length ? <div className="picklist">{bank.map(o => <PickOpk key={o.id} o={o} label="Kiezen" primary={false} onPick={() => pickBank(o)} />)}</div>
        : <div className="empty">{allBank.length ? 'Niets gevonden in de opkomstenbank.' : 'De opkomstenbank is nog leeg.'}</div>}</>}
    {allBank.length > 0 && groupBlock}
    {(drafts.length > 0 || (ql && allDrafts.length > 0 && !draftHits.length)) && <><h3 className="gap-lg">Concepten</h3>{drafts.length ? <div className="picklist">{drafts.map(o => <PickOpk key={o.id} o={o} label="Kiezen" primary={false} onPick={() => pickDraft(o)} />)}</div>
      : <p className="hint">Geen concepten gevonden.</p>}</>}
  </Modal>;
}

type SpeltakCtx = ReturnType<typeof useSpeltak>;

/** Een concept zelf koppelen aan een rij in de jaarplanning (Kiezen in Koppelen, Gebruiken in de opkomstbouwer); met Ongedaan maken (zie plannedUndo). */
export function linkDraft(S: SpeltakCtx, o: Opk, keyId: string) {
  // vóór het koppelen: bestond de rij al, hoe was hij, en de titel (een lege titel krijgt het onderwerp)
  const created = !S.peekEntry(keyId), en = { ...S.entryFor(keyId) }, before = { ...en }, title0 = o.title;
  S.linkOpk(o, en, false, true);
  const undo = plannedUndo(S, { rowId: en.id, before, created, oid: o.id, kind: 'draft', title0 });
  const note = kampMismatchNote(o, en.date, en.endDate, en.type);
  // het onderwerp van de datum wordt de titel van het concept: zeg wat er stond (zoals bij Inplannen), Ongedaan maken zet het terug
  const t0 = before.topic.trim(), was = t0 && t0 !== (title0.trim() || t0) ? ` Onderwerp was "${t0}".` : '';
  if (!S.offerPlanTimes(o, en, 'Gekoppeld.' + was)) toast(was || note ? 'Gekoppeld.' + was + (note ? ' ' + note : '') : 'Gekoppeld', undoAction(undo), was || note ? 9000 : undefined);
}

/** Een kopie uit de bank (zonder namen) inplannen op een rij in de jaarplanning (Kiezen in Koppelen, Gebruiken in de opkomstbouwer). */
/**
 * Gebruiken bij een datum zonder programma (dashboard en opkomstbouwer, zie fitFor): een passend concept wordt zelf gekoppeld,
 * uit de bank komt een kopie zonder namen met Opkomst overnemen, net als Kiezen in Koppelen.
 */
export function applyFit(S: SpeltakCtx, x: Opk, keyId: string, nav: (to: string) => void) {
  if (x.state === 'draft') linkDraft(S, x, keyId);
  else linkBankCopy(S, x, keyId, (id, fresh) => openModal({ kind: 'takeover', oid: id, fresh }), id => nav(`/s/${S.sid}/bouwer/${id}`));
}
export function linkBankCopy(S: SpeltakCtx, o: Opk, keyId: string, onTakeover: (oid: string, fresh: boolean) => void, open: (oid: string) => void, pre = '') {
  const created = !S.peekEntry(keyId), en = { ...S.entryFor(keyId) }, before = { ...en }, linked = S.linkOpk(o, en, true, false);
  afterBankCopy(S, linked, en, before, created, onTakeover, open, pre);
}

/**
 * Kopie uit de bank net ingepland (zonder namen): met het recht Opkomsten meteen "Opkomst overnemen" (leiding indelen) en een melding
 * met Ongedaan maken: de kopie weer weg en de rij zoals hij was (onderwerp, soort, datum), net als bij een concept.
 * Zonder Opkomsten alleen een melding met Bekijken: een ingeplande opkomst weghalen hoort bij Opkomsten (zo dwingen de regels het af).
 * `before`: de rij vóór het inplannen. `pre`: zin vooraf in de melding (bijv. dat er ook een kopie in de eigen bank staat).
 */
function afterBankCopy(S: SpeltakCtx, linked: Opk, en: Plan, before: Plan, created: boolean, onTakeover: (oid: string, fresh: boolean) => void, open: (oid: string) => void, pre = '') {
  // alleen de ingeplande kopie gaat weg (de opkomst in de bank, of de kopie uit de groep, blijft); niet meer na leiding indelen in Opkomst overnemen
  const undo = plannedUndo(S, { rowId: before.id, before, created, oid: linked.id, kind: 'copy' });
  const note = kampMismatchNote(linked, en.date, en.endDate, en.type);
  const msg = `${pre ? pre + ' ' : ''}Ingepland op ${fmtRange(en.date, en.endDate, true)} (zonder namen).`;
  const ms = note || pre ? 10000 : 8000;
  if (S.can('build')) {
    onTakeover(linked.id, true);
    // pas als Opkomst overnemen open staat: dan hoort de melding (en Ctrl+Z) bij dat venster. Wijken de tijden af, dan die melding (zoals bij een concept).
    setTimeout(() => { if (!S.offerPlanTimes(linked, en, pre)) toast(msg + (note ? ' ' + note : ''), undoAction(undo), ms); }, 0);
    return;
  }
  toast(`${msg} Leiding indelen doet iemand met het recht Opkomsten.${note ? ' ' + note : ''}`, { label: 'Bekijken', fn: () => open(linked.id) }, ms);
}

/* ---------- Opkomst inplannen op een datum ---------- */
export function ToPlanModal({ oid, onClose, onTakeover }: { oid: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const S = useSpeltak();
  const { settings, plans, getO, peekEntry, entryFor, entryForDate, linkOpk, offerPlanTimes, sid } = S;
  const nav = useNavigate();
  const [custom, setCustom] = useState('');
  // alle hooks vóór het stoppen hieronder: de opkomst kan elders verwijderd worden terwijl dit venster open staat
  const o = getO(oid); if (!o) return null;
  const today = todayISO();
  const rows = rowsIn(settings, plans, today, addDays(today, 240)).filter(r => !r.e || (r.e.type !== 'geen' && !r.e.opkId)).slice(0, 24);
  // Vanuit de bouwer blijft de ingedeelde leiding staan; alleen uit de bank komt een kopie zonder namen.
  const keep = o.state !== 'bank';
  // een kamp loopt over meer dagen: toon het bereik zoals het wordt ingepland (vr–zo op de vaste zaterdag, zie linkOpk).
  // Met "tot en met" tellen de dagen vanaf de datum, ook als de rij korter of langer is dan het kamp (dat staat er dan bij).
  const shown = (d: string, end: string | null | undefined) => {
    if (!isKamp(o)) return fmtRange(d, end, true);
    const s = end ? d : kampStart(o, d); return fmtRange(s, o.days.length > 1 ? addDays(s, o.days.length - 1) : '', true);
  };
  // `created`: de rij is net voor deze datum gemaakt (Ongedaan maken haalt hem dan weer weg)
  const go = (e: Plan, created: boolean) => {
    if (e.opkId) { toast('Op die datum staat al een opkomst. Ontkoppel die eerst in de jaarplanning.'); return; }
    // een dag zonder opkomst (bijv. een vakantie of trainingsweekend) niet stil overschrijven; de lijst hierboven toont ze ook niet
    if (e.type === 'geen') { toast(`Op ${fmtShort(e.date)} is geen opkomst${e.topic.trim() ? ` (${e.topic.trim()})` : ''}. Pas dat eerst aan in de jaarplanning.`, undefined, 7000); return; }
    const fromBank = o.state === 'bank';
    // linkOpk past de rij aan (een kamp krijgt bijv. een andere begindatum en een einddatum): de melding volgt de aangepaste rij
    const en = { ...e }, before = { ...e }, title0 = o.title;
    const linked = linkOpk(o, en, o.state !== 'draft', keep);
    onClose();
    if (fromBank) { afterBankCopy(S, linked, en, before, created, onTakeover, id => nav(`/s/${sid}/bouwer/${id}`)); return; }
    // Ongedaan maken: de rij terug zoals hij was (onderwerp, datum, soort), het concept weer concept of de kopie weg (zie plannedUndo)
    const undo = plannedUndo(S, { rowId: before.id, before, created, oid: linked.id, kind: linked === o ? 'draft' : 'copy', title0 });
    const was = before.topic.trim() && before.topic.trim() !== (linked.title || '').trim() ? ` Onderwerp was "${before.topic.trim()}".` : '';
    const msg = 'Ingepland op ' + fmtRange(en.date, en.endDate, true), note = kampMismatchNote(linked, en.date, en.endDate, en.type);
    if (offerPlanTimes(linked, en, msg + '.')) return;
    const back = undoAction(undo);
    if (linked !== o) toast(msg + '. Er is een kopie gemaakt.' + was + (note ? ' ' + note : ''), back, note ? 9000 : 8000);
    else toast(msg + '.' + was + (note ? ' ' + note : ''), back, note ? 9000 : 8000);
  };
  // het onderwerp van de datum wordt de titel van de opkomst: laat zien wat er verandert
  const change = (e: Plan | null) => !!(e && e.topic.trim() && o.title.trim() && e.topic.trim().toLowerCase() !== o.title.trim().toLowerCase());
  // wat bij de opkomst past bovenaan onder een eigen kop (zoals in Koppelen), de andere datums daarna op volgorde van datum.
  // Eén hoofdknop, alleen bij een goede keuze: een passende datum, bij een kamp een kamp-rij zonder programma, anders een datum
  // zonder onderwerp (voor een gewone opkomst geen kamp-rij). Nooit een datum met een ander onderwerp: dat zou je overschrijven.
  type Row = (typeof rows)[number];
  const fitsRow = (r: Row) => !!(r.e && r.e.topic.trim() && fitsTopic(o, r.e.topic));
  const fitRows = rows.filter(fitsRow), otherRows = rows.filter(r => !fitsRow(r));
  const kampRow = isKamp(o) ? otherRows.find(r => r.e && r.e.type === 'kamp') : undefined;
  const freeRow = otherRows.find(r => (!r.e || !r.e.topic.trim()) && (isKamp(o) || !r.e || r.e.type !== 'kamp'));
  const firstKey = (fitRows[0] || kampRow || freeRow)?.key;
  // een gewone opkomst op een kamp (of een rij van meer dagen): ook dat staat erbij, net als een kamp dat qua lengte niet past
  const row = (r: Row) => { const e = r.e, d = rowDate(r), off = e && e.endDate ? kampMismatch(o, d, e.endDate) : null, onKamp = e ? opkOnKamp(o, d, e.endDate, e.type) : null, ch = change(e); return <div key={r.key} className="pick" data-date={d}><div className="info">
    <b>{shown(d, e && e.endDate)}</b>
    {/* het onderwerp dat er stond wordt overschreven: rustig, maar duidelijk (de signaalkleur is voor echte problemen, zoals een kamp dat niet past) */}
    {ch && <span className="pk-change"><span aria-hidden="true">{e!.topic.trim()}<ArrowRight size={14} />{o.title.trim()}</span><span className="sr-only">Onderwerp {e!.topic.trim()} wordt {o.title.trim()}</span></span>}
    <span className="hint">{off && <><span className="err">Jaarplanning {plural(off.row, 'dag', 'dagen')} ({fmtRange(d, e!.endDate)})</span> · </>}{onKamp && <><span className="err">{e!.type === 'kamp' ? 'Kamp' : plural(onKamp, 'dag', 'dagen')} in de jaarplanning ({fmtRange(d, e!.endDate)})</span> · </>}{e && e.topic && !ch ? e.topic + ' · ' : ''}{e && e.planners.length ? 'planning: ' + e.planners.join(', ') : 'nog niemand toegewezen'}</span></div>
    <button className={'btn sm' + (r.key === firstKey ? ' primary' : '')} onClick={() => { const created = !peekEntry(r.key); go(entryFor(r.key), created); }} aria-label={`Hier inplannen: ${shown(d, e && e.endDate)}`}>Hier inplannen</button></div>; };
  return <Modal title="Inplannen" sub={o.state === 'bank' ? 'Er wordt een kopie ingepland zonder namen; de opkomst in de bank blijft zoals hij is.' : 'Kies een datum waar nog geen opkomst aan gekoppeld is. De ingedeelde leiding gaat mee.'} onClose={onClose}>
    {fitRows.length > 0 && <><h3 className="gap-lg">Past bij {o.title.trim() || 'deze opkomst'}</h3><div className="picklist fits">{fitRows.map(row)}</div>
      {otherRows.length > 0 && <h3 className="gap-lg">Andere datums</h3>}</>}
    {otherRows.length > 0 && <div className="picklist">{otherRows.map(row)}</div>}
    {!rows.length && <p className="hint">Geen vrije data gevonden in de komende maanden.</p>}
    <div className="row"><input className="inp" value={custom} onChange={e => setCustom(e.target.value)} onBlur={() => setCustom(tidyNL(custom))} placeholder="Andere datum: dd-mm-jjjj" aria-label="Andere datum" inputMode="numeric" style={{ flex: '1 1 180px' }} /><button className="btn" onClick={() => { const iso = parseNL(custom); if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; } const created = !plans.some(p => p.date === iso); go(entryForDate(iso), created); }}>Op deze datum</button></div>
  </Modal>;
}

/* ---------- Opkomst overnemen: planning door, leiding per activiteit, programma ---------- */
export function Takeover({ oid, fresh, onClose }: { oid: string; fresh: boolean; onClose: () => void }) {
  const { settings, leaders, lib, getO, latest, saveOpk, entryOfOpk, presentForEntry, sid, savePlan, can } = useSpeltak();
  const nav = useNavigate();
  const [, bump] = useState(0);
  // indelen en het programma aanpassen hoort bij het recht Opkomsten (zoals in de bouwer); zonder dat recht alleen bekijken
  const ro = !can('build');
  const [libId, setLibId] = useState(''); const [libDay, setLibDay] = useState(0);
  // alle hooks vóór het stoppen hieronder: de opkomst kan elders verwijderd worden terwijl dit venster open staat
  const [selId, setSelId] = useState<string | null>(null);
  // aanraakscherm: de namen zijn daar groter (beter te raken), dus de tijdlijn iets hoger zodat er evenveel in een onderdeel passen
  const coarse = useMedia('(pointer: coarse)');
  // gekozen onderdeel: het paneel eronder in beeld brengen (op een telefoon staat het anders ver onder het onderdeel)
  const selRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selId) return;
    const t = setTimeout(() => scrollCalm(selRef.current, { block: 'nearest' }), 30);
    return () => clearTimeout(t);
  }, [selId]);
  // onderdelen staan op volgorde van tijd; schuift er een met de focus (andere begintijd), dan houdt het de focus
  const progRef = useRef<HTMLDivElement>(null);
  useKeepFocus(progRef);
  const o = getO(oid); if (!o) return null;
  const e = entryOfOpk(o), present = e ? presentForEntry(e, o) : [...leaders];
  const A = analyze(o, present, leaders), need = minNeed(o);
  const upd = (fn: (o: Opk) => void) => { if (ro) return; fn(o); if (isKamp(o)) syncKamp(o); saveOpk({ ...o }); bump(x => x + 1); };
  const containers = isKamp(o) ? o.days.map((d, i) => ({ d, label: dayTitle(o, i, e ? addDays(kampBase(o, e), i) : null), lo: d.start, hi: d.end })) : [{ d: o as unknown as Day, label: '', lo: o.start - (o.prep || 0), hi: o.end + (o.post || 0) }];
  const toggle = (b: Block, n: string) => upd(() => { b.names = b.names.includes(n) ? b.names.filter(x => x !== n) : [...b.names, n]; });
  const pickSel = (id: string) => `.modal .tk-tl [data-bid="${CSS.escape(id)}"] .tk-pick`;
  // onderdeel kiezen of weer dichtdoen; met het toetsenbord (kb) gaat de focus naar Begin in het paneel eronder,
  // met de muis of een tik blijft hij staan (anders schuift het beeld weg van de namen)
  const pick = (b: Block, kb: boolean) => {
    if (ro) return;
    const on = b.id !== selId; setSelId(on ? b.id : null);
    if (on && kb) setTimeout(() => selRef.current?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true }), 40);
  };
  // paneel dicht: de focus terug naar het onderdeel (niet kwijt naar het begin van het venster)
  const closeSel = () => { const id = selId; setSelId(null); if (id) focusSoon(pickSel(id)); };
  const delBlock = (C: typeof containers[0], b: Block) => {
    if (ro) return;
    const at = C.d.blocks.indexOf(b), dayId = isKamp(o) ? C.d.id : null;
    // daarna de focus op het volgende onderdeel (of het vorige), anders op de keuze van een activiteit of Klaar
    const rest = C.d.blocks.filter(x => x !== b).sort((x, y) => x.start - y.start), nb = rest.find(x => x.start >= b.start) || rest[rest.length - 1];
    upd(() => { C.d.blocks = C.d.blocks.filter(x => x !== b); }); setSelId(null);
    focusSoon(nb ? pickSel(nb.id) : '', '.modal select[aria-label="Activiteit om toe te voegen"]', '.modal .btn.primary');
    toast(`"${b.title || 'Naamloos onderdeel'}" verwijderd`, undoAction(() => {
      // de nieuwste versie van de opkomst (na het opslaan is dat een nieuw object), ook als dit venster al dicht is
      const cur = latest().getO(oid); if (!cur) return;
      const list = dayId ? cur.days.find(d => d.id === dayId)?.blocks : cur.blocks;
      if (!list || list.some(x => x.id === b.id)) return;
      list.splice(Math.min(at, list.length), 0, b); if (isKamp(cur)) syncKamp(cur); saveOpk({ ...cur });
    }));
  };
  /* Compacte tijdlijn: onderdelen die tegelijk zijn staan naast elkaar, net als in de bouwer. */
  const ROW = coarse ? 26 : 20;
  const timeline = (C: typeof containers[0]) => {
    const T0 = C.lo, T1 = C.hi, pos = lanesLayout(C.d.blocks);
    return <div className="tl tk-tl">
      <Ticks T0={T0} T1={T1} row={ROW} />
      <div className="lanes" style={lanesStyle(T0, T1, ROW)}>
        <PrepZones o={o} T0={T0} row={ROW} />
        {byTime(C.d.blocks, pos).filter(b => b.start + b.dur > T0 && b.start < T1).map(b => {
          const g = blkGeom(pos[b.id], b, T0, ROW, b.id === selId), c = catOf(settings, b.cat);
          const short = !!b.minLeaders && b.names.length < b.minLeaders, extra = b.names.filter(n => !leaders.includes(n)), on = b.id === selId;
          // een groep (geen knop): de namen erin zijn eigen knoppen. Kiezen gaat met de titelknop, of met een klik of tik op het onderdeel.
          return <div key={b.id} className={g.cls.join(' ')} role="group" aria-label={blkLabel(b)} data-bid={b.id}
            style={{ ['--c' as any]: c.color, ...g.style }} onClick={() => pick(b, false)}>
            <div className="cols3">
              <div className="c1">{ro ? <div className="t">{b.title || 'Naamloos onderdeel'}</div>
                : <button type="button" className="t tk-pick" aria-expanded={on} aria-controls={on ? 'tk-sel' : undefined} title="Tijd aanpassen, alle leiding of weghalen"
                  onClick={ev => { ev.stopPropagation(); pick(b, ev.detail === 0); }}>{b.title || 'Naamloos onderdeel'}</button>}
                <div className="when">{fmtT(b.start)}–{fmtT(b.start + b.dur)} · {fmtDur(b.dur)}</div>
                {b.short && <div className="sh">{b.short}</div>}
                <div className="locin">{b.location}</div>
                <div className="tags">{b.minLeaders ? <span className={'tag ' + (short ? 'bad' : 'ok')}>{b.names.length}/{b.minLeaders} leiding</span> : null}</div></div>
              <div className="cl">{b.location || <span className="nobody">–</span>}</div>
              <div className="c2"><div className="names tk-names" onClick={ev => ev.stopPropagation()}>
                {leaders.map(n => present.includes(n)
                  ? <button key={n} type="button" className={'nm' + (b.names.includes(n) ? ' on' : ' off') + (A.clashes.has(b.id + '|' + n) ? ' clash' : '')} aria-pressed={b.names.includes(n)} disabled={ro} onClick={() => toggle(b, n)}>{n}</button>
                  : b.names.includes(n) ? <button key={n} type="button" className="nm clash" title="Afwezig" disabled={ro} onClick={() => toggle(b, n)}>{n}</button> : null)}
                {extra.map(n => <span key={n} className="nm">{n}</span>)}
              </div></div>
            </div>
            {/* alleen bij het gekozen onderdeel: zo tik je op een telefoon niet per ongeluk op de prullenbak in plaats van op een naam */}
            {on && <button className="bdel" onClick={ev => { ev.stopPropagation(); delBlock(C, b); }} title="Onderdeel verwijderen" aria-label={`${b.title || 'Naamloos onderdeel'} verwijderen`}><Trash2 size={14} /></button>}
          </div>;
        })}
      </div>
    </div>;
  };
  // Paneel van het gekozen onderdeel, direct onder de tijdlijn (of de dag) waar het in staat. Hier staat alle aanwezige leiding:
  // in een kort onderdeel passen niet alle namen (zeker op een telefoon), hier is elke naam te raken.
  const selEdit = (C: typeof containers[0]) => {
    const b = C.d.blocks.find(x => x.id === selId); if (!b) return null;
    const durs: number[] = []; for (let d = 5; d <= Math.max(C.hi - b.start, b.dur); d += 5) durs.push(d);
    const who = leaders.filter(n => present.includes(n) || b.names.includes(n)), extra = b.names.filter(n => !leaders.includes(n));
    return <div className="tk-sel" id="tk-sel" ref={selRef}><b>{b.title || 'Naamloos onderdeel'} <span className="hint">{fmtT(b.start)}–{fmtT(b.start + b.dur)}</span></b>
      <div className="field tk-who"><span className="lbl" id="tk-who-l">Leiding bij dit onderdeel</span>
        {who.length ? <div className="row" style={{ gap: 6 }} role="group" aria-labelledby="tk-who-l">{who.map(n => { const away = !present.includes(n);
          return <Chip key={n} className={away || A.clashes.has(b.id + '|' + n) ? 'clash' : ''} on={b.names.includes(n)} title={away ? 'Afwezig: tik om weg te halen' : undefined} onClick={() => toggle(b, n)}>{n}{away ? ' (afwezig)' : ''}</Chip>; })}</div>
          : <p className="hint">Nog geen leidingteam.</p>}
        {extra.length > 0 && <p className="hint">Ook ingedeeld: {extra.join(', ')}</p>}</div>
      <Field label="Begin"><TimePicker value={b.start} onChange={v => upd(() => { b.start = v; b.dur = Math.max(5, Math.min(b.dur, C.hi - b.start)); })} from={C.lo} to={C.hi - 5} extra /></Field>
      <Field label="Duur"><select className="inp" value={b.dur} onChange={ev => upd(() => { b.dur = +ev.target.value; })}>{durs.map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
      <div className="row"><button className="btn sm ghost" onClick={() => delBlock(C, b)}><Trash2 size={14} />Verwijderen</button><button className="btn sm ghost" onClick={closeSel}>Sluiten</button></div></div>;
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
    if (!e || ro) return; const on = plannersOf(e, o).includes(n);
    if (on && o.lead === n) upd(() => { o.lead = ''; });
    savePlan({ ...e, planners: on ? e.planners.filter(x => x !== n) : [...e.planners, n] });
  };
  const sub = e ? `${fmtRange(e.date, e.endDate, true)} · week ${isoWeek(e.date)}${e.absent.length ? ' · afwezig: ' + e.absent.join(', ') : ''}` : '';
  return <Modal title={fresh ? 'Opkomst overnemen' : 'Leiding indelen'} sub={sub} onClose={onClose} wide>
    <div className="tk-head">
      <Field label="Opkomst titel"><input value={o.title} readOnly={ro} onChange={ev => upd(() => { o.title = ev.target.value; if (e) savePlan({ ...e, topic: ev.target.value }); })} /></Field>
      {!isKamp(o) && <>
        <Field label="Begintijd"><TimePicker value={o.start} onChange={v => setTime('start', v)} from={360} to={1430} disabled={ro} /></Field>
        <Field label="Eindtijd"><TimePicker value={o.end} onChange={v => setTime('end', v)} from={365} to={1435} disabled={ro} /></Field>
        <Field label="Voorbereiding"><select value={o.prep} disabled={ro} onChange={ev => upd(() => { o.prep = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
        <Field label="Nabespreking"><select value={o.post} disabled={ro} onChange={ev => upd(() => { o.post = +ev.target.value; })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}</option>)}</select></Field>
      </>}
    </div>
    {e && <Field label="Planning door"><div className="row" style={{ gap: 6 }}>{[...new Set([...present, ...plannersOf(e, o)])].map(n => <Chip key={n} on={plannersOf(e, o).includes(n)} disabled={ro} onClick={() => togglePlanner(n)}>{n}</Chip>)}</div></Field>}
    <div className="row statrow"><span className="stat">Minimaal leiding<b>{need}</b></span><span className={'stat' + (need > present.length ? ' warnc' : '')}>Aanwezig<b>{present.length}</b></span><span className={'stat' + (A.warn ? ' warnc' : '')}>Aandachtspunten<b>{A.warn}</b></span></div>
    {A.warn > 0 && <ul className="issues">{A.issues.filter(i => i.lvl === 'warn').slice(0, 6).map((i, k) => <li key={k} className="warn"><i /><span>{i.text}</span></li>)}</ul>}
    <p className="hint">{ro ? 'Alleen bekijken: leiding indelen en het programma aanpassen kan met het recht Opkomsten.' : 'Klik op een naam om die in te delen. Klik op een onderdeel voor alle leiding, de tijd of om het weg te halen.'}</p>
    <div className="tk-prog" ref={progRef}>{containers.map(C => <div key={C.d.id} className="stack" style={{ gap: 8 }}>
      {C.label && <h3 className="tk-day">{C.label} <span className="hint">{fmtT(C.d.start)}–{fmtT(C.d.end)}</span></h3>}
      {C.d.blocks.length ? timeline(C) : <p className="hint">Nog geen onderdelen.</p>}
      {selEdit(C)}
    </div>)}</div>
    {lib.length > 0 && !ro && <div className="row"><select className="inp" aria-label="Activiteit om toe te voegen" value={libId || lib[0].id} onChange={e => setLibId(e.target.value)} style={{ flex: '1 1 220px' }}>{[...lib].sort(byTitle).map(l => <option key={l.id} value={l.id}>{l.title || 'Naamloos'} · {fmtDur(l.dur)}</option>)}</select>
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
  // niet doorgaan (Annuleren, Esc, de X, naast het venster): terug naar het venster ervoor als dat er is (bijv. Koppelen)
  const cancel = spec.back || onClose;
  return <Modal title={spec.title} sub={spec.sub} onClose={cancel}>
    <Field label={spec.label} htmlFor="nm-name"><input id="nm-name" value={name} autoFocus aria-invalid={!!err} aria-describedby="nm-err" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /></Field>
    {/* altijd aanwezig, alleen de tekst verandert: zo leest een schermlezer de fout voor tijdens het typen */}
    <span className="sb-err" id="nm-err" aria-live="polite">{err}</span>
    <div className="row"><button className="btn primary" disabled={!!err} onClick={ok}>{spec.okLabel}</button><button className="btn ghost" onClick={cancel}>{spec.back ? 'Terug' : 'Annuleren'}</button></div>
  </Modal>;
}
