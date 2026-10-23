import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tent, Trash2, SquarePen, Users } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { Modal, TimePicker, Field, Chip, ConfirmBtn, useMedia } from './ui';
import { PickOpk } from './shared';
import { addDays, clone, fmtLong, fmtNL, fmtRange, parseNL, parseRange, tidyNL, fromISO, DAYS, fmtT, fmtDur, isoWeek, plural, todayISO } from '../lib/time';
import { analyze, blockFromLib, byTitle, catOf, changeOpkTime, dayTitle, defaultTimes, entryTimes, ownTimes, firstFree, fitsTopic, freeName, isKamp, kampMismatch, kampMismatchNote, kampStart, lanesLayout, minNeed, nameTaken, newEntry, opkDaysIn, opkSearchText, plannersOf, PREP_OPTS, prepLabel, relabelDays, rowsIn, syncKamp, type Opk, type Plan, type Block, type Day, rowDate } from '../lib/model';
import { Ticks, PrepZones, blkGeom, blkLabel, byTime, focusSoon, lanesStyle, useKeepFocus } from './timeline';
import { withFreeName, type NameSpec } from '../store/modal';
import type { Gedeeld } from '../store/groepsbank';

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
    if (en2.type === 'geen' && en2.opkId) {
      if (!canOpk) { toast(NO_UNLINK); return; }
      unlinkEntry(en2); en2.opkId = null; toast('De gekoppelde opkomst staat nu bij de concepten.');
    }
    // verzet kamp: dagen die een weekdag heten volgen de nieuwe datum; past de lengte niet meer bij de rij, dan een melding
    const misfit = linked && en2.opkId && isKamp(linked) ? kampMismatchNote(linked, en2.date, en2.endDate) : '';
    if (linked && en2.opkId && isKamp(linked) && can('build')) { const c = clone(linked); if (relabelDays(c, iso)) saveOpk(c); }
    savePlan(en2); onSaved?.(en2); onClose();
    if (misfit) toast(misfit, undefined, 8000);
  };
  const clear = () => { if (!e) { onClose(); return; } if (e.opkId && !canOpk) { toast(NO_UNLINK); return; } if (e.opkId) unlinkEntry(e); deletePlan(e.id); onClose(); toast('Rij leeggemaakt'); };
  return <Modal title="Datum en soort" sub={slot ? 'Vaste ' + DAYS[settings.opkDay] + ': ' + fmtLong(slot) : 'Extra datum'} onClose={onClose}>
    <Field label="Soort"><div className="seg">{([['opkomst', 'Opkomst'], ['kamp', 'Kamp / weekend'], ['geen', 'Geen opkomst']] as const).map(([v, l]) => <Chip key={v} on={type === v} onClick={() => setType(v)}>{l}</Chip>)}</div></Field>
    <div className="two"><Field label="Datum" htmlFor="md-date"><input id="md-date" value={date} onChange={e => setDate(e.target.value)} onBlur={() => setDate(tidyNL(date))} placeholder="dd-mm-jjjj" inputMode="numeric" /></Field>
      <Field label="Tot en met" htmlFor="md-end"><input id="md-end" value={end} onChange={e => setEnd(e.target.value)} onBlur={() => setEnd(tidyNL(end, parseNL(date)))} placeholder="leeg = één dag" inputMode="numeric" /></Field></div>
    <Field label="Snel kiezen"><div className="row" style={{ gap: 6 }}>{quick.map(([l, a, b]) => <Chip key={l} onClick={() => { setDate(fmtNL(a)); setEnd(b ? fmtNL(b) : ''); if (b && type === 'opkomst') setType('kamp'); if (!b && type === 'kamp') setType('opkomst'); }}>{l}</Chip>)}</div></Field>
    {linked ? <p className="hint">De tijden komen uit de gekoppelde opkomst: {fmtT(st0)}–{fmtT(en0)}.</p>
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
      toast(msg + (skipped ? `. ${plural(skipped, 'datum', 'data')} met een opkomst, onderwerp of kamp overgeslagen.` : ''), done.length ? { label: 'Ongedaan maken', fn: undo } : undefined, skipped ? 8000 : undefined);
      if (done.length) onCreated(done[0]);
      onClose(); return;
    }
    const e = newEntry(null, iso); e.endDate = endIso && endIso !== iso ? endIso : ''; e.type = type; e.topic = topic.trim();
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
export function LinkModal({ keyId, onClose, onTakeover }: { keyId: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { opks, peekEntry, entryFor, linkOpk, newForEntry, offerPlanTimes, sid, sp, can, canLink, shared, latest } = useSpeltak();
  const nav = useNavigate();
  const e = peekEntry(keyId); const d = e ? e.date : keyId.slice(2);
  const [q, setQ] = useState('');
  // zoeken in titel, beschrijving, locatie en onderdelen; wat bij het onderwerp van de datum past staat bovenaan in een eigen groep
  const topic = (e && e.topic) || '', ql = q.trim().toLowerCase();
  const fit = (o: Opk) => fitsTopic(o, topic), hit = (o: Opk) => !ql || opkSearchText(o).includes(ql);
  const top = <T,>(list: T[], f: (x: T) => Opk) => [...list.filter(x => fit(f(x))), ...list.filter(x => !fit(f(x)))];
  const allBank = opks.filter(o => o.state === 'bank'), allDrafts = opks.filter(o => o.state === 'draft');
  const bankHits = allBank.filter(hit).sort(byTitle), draftHits = allDrafts.filter(hit).sort((a, b) => b.updatedAt - a.updatedAt);
  const bank = bankHits.filter(o => !fit(o)), drafts = draftHits.filter(o => !fit(o));
  // past bij het onderwerp: eerst de concepten (vaak al voor deze datum gemaakt), dan uit de bank; elk zegt waar het vandaan komt
  const fits = [...draftHits.filter(fit).map(o => ({ o, draft: true })), ...bankHits.filter(fit).map(o => ({ o, draft: false }))];
  // groepsbank: wat andere speltakken delen (kopiëren naar de eigen bank hoort bij Banken). Al gekopieerd? Dan staat hij hierboven bij de eigen bank.
  const copied = new Set(allBank.map(o => o.fromShared).filter(Boolean));
  const allGroup = sp?.gid && canLink && can('bank') ? (shared || []).filter(g => g.sid !== sid && !copied.has(g.id)) : [];
  const group = top(allGroup.filter(g => !ql || (opkSearchText(g.opk) + ' ' + g.speltakName.toLowerCase()).includes(ql)).sort((a, b) => byTitle(a.opk, b.opk)), g => g.opk);
  const fitTag = (o: Opk) => fit(o) ? <span className="pill good">Past bij onderwerp</span> : undefined;
  const isKampRow = e && e.type === 'kamp';
  const newOne = (kamp: boolean) => { const o = newForEntry({ ...entryFor(keyId) }, kamp); onClose(); nav(`/s/${sid}/bouwer/${o.id}`); };
  // een nieuwe (lege) opkomst maken en die in de bouwer uitwerken hoort bij Opkomsten; uit de bank of een concept koppelen kan ook zonder
  const build = can('build');
  const openOpk = (id: string) => () => nav(`/s/${sid}/bouwer/${id}`);
  // uit de bank: een kopie zonder namen inplannen (met Opkomsten daarna Opkomst overnemen); een concept: dat concept zelf koppelen
  const pickBank = (o: Opk) => { const en = { ...entryFor(keyId) }; const linked = linkOpk(o, en, true, false); onClose(); afterBankCopy(linked, en, onTakeover, offerPlanTimes, build, openOpk(linked.id)); };
  const pickDraft = (o: Opk) => { const en = { ...entryFor(keyId) }; linkOpk(o, en, false, true); onClose(); const note = kampMismatchNote(o, en.date, en.endDate);
    if (!offerPlanTimes(o, en, 'Gekoppeld.')) toast(note ? 'Gekoppeld. ' + note : 'Gekoppeld', { label: 'Opkomst openen', fn: openOpk(o.id) }, note ? 9000 : undefined); };
  // uit de groep: eerst een kopie in de eigen bank (met een vrije naam), dan een kopie daarvan inplannen, zonder namen (zoals uit de eigen bank)
  const pickShared = (g: Gedeeld) => withFreeName(g.opk.title, {
    title: 'Andere naam kiezen', sub: `"${g.opk.title || 'Naamloos'}" staat al in jullie opkomstenbank. Geef de kopie een andere naam.`, label: 'Opkomst titel', okLabel: 'Kopiëren en inplannen',
    suggest: freeName(allBank, g.opk.title), taken: n => nameTaken(allBank, n),
    ok: name => {
      // het venster voor een andere naam kan ertussen hebben gestaan: met de nieuwste stand
      const L = latest(), { opk: copy, dropped } = L.importShared(g, name);
      const en = { ...L.entryFor(keyId) }, linked = L.linkOpk(copy, en, true, false); onClose();
      const pre = `"${copy.title || 'Opkomst'}" staat nu ook in jullie opkomstenbank.` + (!dropped.length ? ''
        : ' ' + (dropped.length === 1 ? `Categorie ${dropped[0]} bestaat` : `${dropped.length} categorieën (${dropped.join(', ')}) bestaan`) + ' bij jullie nog niet; die onderdelen staan zonder categorie.');
      afterBankCopy(linked, en, onTakeover, L.offerPlanTimes, L.can('build'), openOpk(linked.id), pre);
    },
  });
  const groupBlock = group.length > 0 || (ql && allGroup.length > 0) ? <><h3 className="gap-lg">Uit de groep</h3>
    {group.length ? <div className="picklist">{group.map(g => <PickOpk key={g.id} o={g.opk} cats={g.catDefs} label="Kiezen" primary={false}
      kicker={<><span className="pk-from"><Users size={13} aria-hidden="true" />{g.speltakName || 'Speltak'}</span>{fitTag(g.opk)}</>} onPick={() => pickShared(g)} />)}</div>
      : <p className="hint">Niets gevonden in de groep.</p>}
    <p className="hint">Kiezen zet ook een kopie in jullie opkomstenbank.</p></> : null;
  return <Modal title="Opkomst koppelen" sub={fmtRange(d, e && e.endDate, true) + (topic.trim() ? ' · ' + topic.trim() : '')} onClose={onClose}>
    {/* past er iets bij het onderwerp, dan is dat de hoofdknop (Kiezen bij het eerste); anders Nieuwe opkomst of Weekendkamp */}
    {build ? <div className="row"><button className={'btn' + (!fits.length && !isKampRow ? ' primary' : '')} onClick={() => newOne(false)}><Plus size={16} />Nieuwe opkomst</button><button className={'btn' + (!fits.length && isKampRow ? ' primary' : '')} onClick={() => newOne(true)}><Tent size={16} />Weekendkamp</button></div>
      : <p className="hint">Kies een opkomst uit de bank of een concept. Een nieuwe opkomst maken kan met het recht Opkomsten.</p>}
    {allBank.length + allDrafts.length + allGroup.length > 0 && <input className="inp" type="search" value={q} onChange={ev => setQ(ev.target.value)} placeholder="Zoek op titel, beschrijving of onderdeel" aria-label="Zoek opkomst" />}
    {fits.length > 0 && <><h3 className="gap-lg">Past bij {topic.trim()}</h3>
      <div className="picklist">{fits.map((f, i) => <PickOpk key={f.o.id} o={f.o} label="Kiezen" primary={i === 0} kicker={<span className="pk-from">{f.draft ? 'Concept' : 'Uit de opkomstenbank'}</span>}
        onPick={() => f.draft ? pickDraft(f.o) : pickBank(f.o)} />)}</div></>}
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

/**
 * Kopie uit de bank net ingepland (zonder namen): met het recht Opkomsten meteen "Opkomst overnemen" (leiding indelen),
 * anders alleen een melding. Overnemen schrijft de opkomst, en dat hoort bij Opkomsten (zoals in de bouwer en op het dashboard).
 * `pre`: zin vooraf in de melding (bijv. dat er ook een kopie in de eigen bank staat).
 */
function afterBankCopy(linked: Opk, en: Plan, onTakeover: (oid: string, fresh: boolean) => void, offerPlanTimes: (o: Opk, e: Plan, prefix?: string) => boolean, build: boolean, open: () => void, pre = '') {
  if (build) { onTakeover(linked.id, true); if (!offerPlanTimes(linked, en, pre) && pre) toast(pre, undefined, 8000); return; }
  const note = kampMismatchNote(linked, en.date, en.endDate);
  toast(`${pre ? pre + ' ' : ''}Ingepland op ${fmtRange(en.date, en.endDate, true)} (zonder namen). Leiding indelen doet iemand met het recht Opkomsten.${note ? ' ' + note : ''}`, { label: 'Bekijken', fn: open }, note || pre ? 10000 : 7000);
}

/* ---------- Opkomst inplannen op een datum ---------- */
export function ToPlanModal({ oid, onClose, onTakeover }: { oid: string; onClose: () => void; onTakeover: (oid: string, fresh: boolean) => void }) {
  const { settings, plans, getO, entryFor, entryForDate, linkOpk, offerPlanTimes, sid, can, latest } = useSpeltak();
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
  const go = (e: Plan) => {
    if (e.opkId) { toast('Op die datum staat al een opkomst. Ontkoppel die eerst in de jaarplanning.'); return; }
    const fromBank = o.state === 'bank';
    // linkOpk past de rij aan (een kamp krijgt bijv. een andere begindatum en een einddatum): de melding volgt de aangepaste rij
    const en = { ...e }, before = { ...e }, title0 = o.title;
    const linked = linkOpk(o, en, o.state !== 'draft', keep);
    onClose();
    if (fromBank) { afterBankCopy(linked, en, onTakeover, offerPlanTimes, can('build'), () => nav(`/s/${sid}/bouwer/${linked.id}`)); return; }
    // Ongedaan maken: de rij terug zoals hij was (onderwerp, datum, soort), het concept weer concept of de kopie weg; met de nieuwste stand
    const undo = () => {
      const L = latest(), row = L.plans.find(p => p.id === before.id), cur = L.getO(linked.id);
      if (!row || row.opkId !== linked.id || !cur || cur.state !== 'planned') { toast('Kan niet meer terug: de opkomst of de datum is intussen veranderd.'); return; }
      L.savePlan({ ...row, opkId: null, topic: before.topic, type: before.type, date: before.date, endDate: before.endDate });
      if (linked === o) L.saveOpk({ ...cur, state: 'draft', title: !title0.trim() && cur.title === linked.title ? title0 : cur.title }); else L.deleteOpk(cur.id);
      toast('Niet meer ingepland');
    };
    const was = before.topic.trim() && before.topic.trim() !== (linked.title || '').trim() ? ` Onderwerp was "${before.topic.trim()}".` : '';
    const msg = 'Ingepland op ' + fmtRange(en.date, en.endDate, true), note = kampMismatchNote(linked, en.date, en.endDate);
    if (offerPlanTimes(linked, en, msg + '.')) return;
    const back = { label: 'Ongedaan maken', fn: undo };
    if (linked !== o) toast(msg + '. Er is een kopie gemaakt.' + was + (note ? ' ' + note : ''), back, note ? 9000 : 8000);
    else toast(msg + '.' + was + (note ? ' ' + note : ''), back, note ? 9000 : 8000);
  };
  // het onderwerp van de datum wordt de titel van de opkomst: laat zien wat er verandert
  const change = (e: Plan | null) => !!(e && e.topic.trim() && o.title.trim() && e.topic.trim().toLowerCase() !== o.title.trim().toLowerCase());
  return <Modal title="Inplannen" sub={o.state === 'bank' ? 'Er wordt een kopie ingepland zonder namen; de opkomst in de bank blijft zoals hij is.' : 'Kies een datum waar nog geen opkomst aan gekoppeld is. De ingedeelde leiding gaat mee.'} onClose={onClose}>
    {rows.length ? <div className="picklist">{rows.map(r => { const e = r.e, d = rowDate(r), off = e && e.endDate ? kampMismatch(o, d, e.endDate) : null, ch = change(e); return <div key={r.key} className="pick"><div className="info">
      {e && e.topic.trim() && fitsTopic(o, e.topic) && <span className="pick-kicker"><span className="pill good">Past bij onderwerp</span></span>}<b>{shown(d, e && e.endDate)}</b>
      {ch && <span className="pk-change">Onderwerp wordt {o.title.trim()} (nu: {e!.topic.trim()})</span>}
      <span className="hint">{off && <><span className="err">Jaarplanning {plural(off.row, 'dag', 'dagen')} ({fmtRange(d, e!.endDate)})</span> · </>}{e && e.topic && !ch ? e.topic + ' · ' : ''}{e && e.planners.length ? 'planning: ' + e.planners.join(', ') : 'nog niemand toegewezen'}</span></div>
      <button className="btn sm primary" onClick={() => go(entryFor(r.key))}>Hier inplannen</button></div>; })}</div> : <p className="hint">Geen vrije data gevonden in de komende maanden.</p>}
    <div className="row"><input className="inp" value={custom} onChange={e => setCustom(e.target.value)} onBlur={() => setCustom(tidyNL(custom))} placeholder="Andere datum: dd-mm-jjjj" aria-label="Andere datum" inputMode="numeric" style={{ flex: '1 1 180px' }} /><button className="btn" onClick={() => { const iso = parseNL(custom); if (!iso) { toast('Typ de datum als dd-mm-jjjj.'); return; } go(entryForDate(iso)); }}>Op deze datum</button></div>
  </Modal>;
}

/* ---------- Opkomst overnemen: planning door, leiding per activiteit, programma ---------- */
export function Takeover({ oid, fresh, onClose }: { oid: string; fresh: boolean; onClose: () => void }) {
  const { settings, leaders, lib, getO, latestO, saveOpk, entryOfOpk, presentForEntry, sid, savePlan, can } = useSpeltak();
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
    const t = setTimeout(() => selRef.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 30);
    return () => clearTimeout(t);
  }, [selId]);
  // onderdelen staan op volgorde van tijd; schuift er een met de focus (andere begintijd), dan houdt het de focus
  const progRef = useRef<HTMLDivElement>(null);
  useKeepFocus(progRef);
  const o = getO(oid); if (!o) return null;
  const e = entryOfOpk(o), present = e ? presentForEntry(e, o) : [...leaders];
  const A = analyze(o, present, leaders), need = minNeed(o);
  const upd = (fn: (o: Opk) => void) => { if (ro) return; fn(o); if (isKamp(o)) syncKamp(o); saveOpk({ ...o }); bump(x => x + 1); };
  const containers = isKamp(o) ? o.days.map((d, i) => ({ d, label: dayTitle(o, i, e ? addDays(e.date, i) : null), lo: d.start, hi: d.end })) : [{ d: o as unknown as Day, label: '', lo: o.start - (o.prep || 0), hi: o.end + (o.post || 0) }];
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
  return <Modal title={spec.title} sub={spec.sub} onClose={onClose}>
    <Field label={spec.label} htmlFor="nm-name"><input id="nm-name" value={name} autoFocus aria-invalid={!!err} aria-describedby="nm-err" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /></Field>
    {/* altijd aanwezig, alleen de tekst verandert: zo leest een schermlezer de fout voor tijdens het typen */}
    <span className="sb-err" id="nm-err" aria-live="polite">{err}</span>
    <div className="row"><button className="btn primary" disabled={!!err} onClick={ok}>{spec.okLabel}</button><button className="btn ghost" onClick={onClose}>Annuleren</button></div>
  </Modal>;
}
