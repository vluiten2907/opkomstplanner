import { useEffect, useState } from 'react';
import { guardLeave, useDirty } from '../store/unsaved';
import { Plus, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { BankCard, PageTitle, SaveBar } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field, useSheetDialog } from '../components/ui';
import { CatSelect, LocInput, NumInput } from '../components/fields';
import { clone, fmtDur, plural, uid } from '../lib/time';
import { allBlocks, byTitle, catOf, freeName, nameTaken, normLib, type Lib } from '../lib/model';

export default function Activiteitenbank() {
  const { settings, lib, opks, saveLib, deleteLib, can } = useSpeltak();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [sel, setSelRaw] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Lib | null>(null); // nieuwe activiteit, nog niet in de bank
  const setSel = (id: string | null) => guardLeave(() => { setSelRaw(id); if (!id || id !== fresh?.id) setFresh(null); });
  const ql = q.toLowerCase();
  const items = lib.filter(l => (!cat || l.cat === cat) && (!ql || (l.title + ' ' + l.short + ' ' + l.location).toLowerCase().includes(ql))).sort(byTitle);
  const uses: Record<string, number> = {};
  opks.forEach(o => allBlocks(o).forEach(b => { if (b.libId) uses[b.libId] = (uses[b.libId] || 0) + 1; }));
  const edit = can('bank');
  // terugzetten met hetzelfde id, zodat onderdelen die ernaar verwijzen weer kloppen
  const remove = (l: Lib) => { deleteLib(l.id); if (sel === l.id) setSelRaw(null); toast(`"${l.title || 'Activiteit'}" verwijderd${uses[l.id] ? '. Opkomsten die hem gebruiken blijven staan' : ''}`, { label: 'Ongedaan maken', fn: () => saveLib(clone(l)) }); };
  const create = () => guardLeave(() => { const l = normLib({ id: uid(), cat: (settings.categories[0] || {}).id || '', minLeaders: 1 }); setFresh(l); setSelRaw(l.id); setQ(''); setCat(''); setTimeout(() => document.getElementById('lf-title')?.focus(), 30); });
  const L = sel ? lib.find(l => l.id === sel) || (fresh && fresh.id === sel ? fresh : undefined) : undefined;
  const isNew = !!L && !lib.some(l => l.id === L.id);
  // op een smal scherm ligt het paneel als vel over de pagina: dan is het een venster (focus erin, Esc sluit, focus terug naar de kaart)
  const [sheetRef, sheetProps] = useSheetDialog(!!L, 'Activiteit bewerken', () => document.querySelector<HTMLElement>('.bcard.sel'));
  useEffect(() => {
    if (!sel) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal')) setSel(null); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={plural(lib.length, 'activiteit', 'activiteiten')}>{edit && <button className="btn primary" onClick={create}><Plus size={16} />Nieuwe activiteit</button>}</PageTitle>
    <div className="toolbar">
      <input className="inp" type="search" placeholder="Zoek op titel, beschrijving of locatie" aria-label="Zoek activiteit" value={q} onChange={e => setQ(e.target.value)} />
      <div className="catfilter" role="group" aria-label="Categorie"><Chip on={!cat} onClick={() => setCat('')}>Alle</Chip>{settings.categories.map(c => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}><Dot color={c.color} />{c.label}</Chip>)}</div>
    </div>
    <div className="bank">
      <div>{items.length ? <div className="bank-grid">{items.map(l => { const c = catOf(settings, l.cat); return <BankCard key={l.id} what="Activiteit" onDelete={edit ? () => remove(l) : undefined}><button className={'bcard lift transition-[box-shadow] duration-150 ease-out' + (sel === l.id ? ' sel' : '')} onClick={() => setSel(l.id)}>
        <span className="bt"><Dot color={c.color} /><span>{l.title || 'Naamloos'}</span></span>
        <span className="bm"><span>{c.label}</span><span className="mono">{fmtDur(l.dur)}</span><span>min. {l.minLeaders} leiding</span>{l.location && <span>{l.location}</span>}</span>
        {l.short && <span className="bs">{l.short}</span>}
        <span className="hint">{uses[l.id] ? `${uses[l.id]}× gebruikt` : 'Nog niet gebruikt'}</span>
      </button></BankCard>; })}</div>
        : <div className="empty"><span>{lib.length ? 'Geen activiteiten gevonden met deze filter.' : 'Nog geen activiteiten. Maak er een, of bewaar een onderdeel vanuit de opkomstbouwer.'}</span>{!lib.length && edit && <button className="btn primary" onClick={create}>Nieuwe activiteit</button>}</div>}</div>
      <aside className={'card side sheet' + (L ? ' editing' : '')}>{L ? <div ref={sheetRef} {...sheetProps}><LibEditor key={L.id} l={L} isNew={isNew} lib={lib} readOnly={!edit} onClose={() => setSel(null)} onCancelNew={() => { setFresh(null); setSelRaw(null); }}
        onSave={x => { saveLib(x); if (isNew) setFresh(null); toast(isNew ? 'Activiteit opgeslagen in de bank' : 'Activiteit opgeslagen'); }}
        onCopy={x => { saveLib(x); setSelRaw(x.id); toast(`Kopie "${x.title}" opgeslagen`); }}
        onDelete={() => remove(L)} /></div>
        : <div className="pad stack"><h3>Activiteit bewerken</h3><p className="muted">Kies een activiteit om hem te bekijken{edit ? ' of te bewerken' : ''}. In de opkomstbouwer sleep je activiteiten vanuit het zijpaneel op de tijdlijn.</p></div>}</aside>
      <div className={'scrim' + (L ? ' on' : '')} onClick={() => setSel(null)} />
    </div>
  </div>;
}

function LibEditor({ l, isNew, lib, readOnly, onClose, onCancelNew, onSave, onCopy, onDelete }: { l: Lib; isNew: boolean; lib: Lib[]; readOnly: boolean; onClose: () => void; onCancelNew: () => void; onSave: (l: Lib) => void; onCopy: (l: Lib) => void; onDelete: () => void }) {
  // Je bewerkt een kladversie; pas bij Opslaan gaat hij naar de bank.
  const [d, setD] = useState<Lib>(() => clone(l));
  const [dirty, setDirty] = useState(false);
  // een nieuwe, nog lege activiteit telt pas als gewijzigd na de eerste invoer: zo sluit je hem zonder vraag
  useDirty(dirty);
  const upd = (fn: () => void) => { if (readOnly) return; fn(); setD({ ...d }); setDirty(true); };
  const durs: number[] = []; for (let x = 5; x <= 240; x += 5) durs.push(x);
  if (!durs.includes(d.dur)) durs.push(d.dur);
  const taken = (n: string, copy: boolean) => nameTaken(lib, n, copy ? null : l.id);
  const save = () => { const x = { ...clone(d), title: d.title.trim() }; onSave(x); setD(clone(x)); setDirty(false); };
  const cancel = () => { if (isNew) { setDirty(false); onCancelNew(); return; } setD(clone(l)); setDirty(false); };
  const copy = (name: string) => { const x = { ...clone(d), id: uid(), title: name }; setD(clone(l)); setDirty(false); onCopy(x); };
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><span className="eyebrow">{isNew ? 'Nieuwe activiteit' : 'Activiteit'}</span><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    <Field label="Titel van de activiteit" htmlFor="lf-title"><input id="lf-title" value={d.title} readOnly={readOnly} onChange={e => upd(() => { d.title = e.target.value; })} placeholder="bijv. Levend Stratego" /></Field>
    <div className="two"><Field label="Duur" htmlFor="lf-dur"><select id="lf-dur" value={d.dur} disabled={readOnly} onChange={e => upd(() => { d.dur = +e.target.value; })}>{durs.sort((a, b) => a - b).map(x => <option key={x} value={x}>{fmtDur(x)}</option>)}</select></Field>
      <Field label="Minimaal aantal leiding" htmlFor="lf-min"><NumInput id="lf-min" min={1} max={30} readOnly={readOnly} value={d.minLeaders} onChange={n => upd(() => { d.minLeaders = n; })} /></Field></div>
    <CatSelect prefix="lf" value={d.cat} disabled={readOnly} onChange={id => upd(() => { d.cat = id; })} />
    <Field label="Locatie" htmlFor="lf-loc"><LocInput id="lf-loc" value={d.location} readOnly={readOnly} onChange={v => upd(() => { d.location = v; })} placeholder="bijv. Bos" /></Field>
    <Field label="Korte beschrijving" htmlFor="lf-short"><textarea id="lf-short" rows={2} readOnly={readOnly} value={d.short} onChange={e => upd(() => { d.short = e.target.value; })} /></Field>
    <Field label="Uitgebreide beschrijving" htmlFor="lf-desc"><textarea id="lf-desc" rows={6} readOnly={readOnly} value={d.desc} onChange={e => upd(() => { d.desc = e.target.value; })} /></Field>
    <Field label="Voorbereiding" htmlFor="lf-prep"><textarea id="lf-prep" rows={3} readOnly={readOnly} value={d.prep} onChange={e => upd(() => { d.prep = e.target.value; })} /></Field>
    <Field label="Materiaal" htmlFor="lf-mat"><textarea id="lf-mat" rows={4} readOnly={readOnly} value={d.materials} onChange={e => upd(() => { d.materials = e.target.value; })} placeholder="Eén ding per regel" /></Field>
    {!readOnly && !isNew && <div className="stack" style={{ gap: 4 }}><div className="row"><ConfirmBtn label="Uit de bank verwijderen" confirm="Klik nogmaals om te verwijderen" onConfirm={onDelete} /></div><p className="hint">Opkomsten waarin hij al staat, blijven gewoon staan.</p></div>}
    {!readOnly && <SaveBar dirty={dirty} isNew={isNew} title={d.title} taken={taken} suggest={freeName(lib, d.title || l.title)} onCancel={cancel} onSave={save} onCopy={copy} />}
  </div>;
}
