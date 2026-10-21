import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field } from '../components/ui';
import { CatSelect, LocInput } from './Bouwer';
import { fmtDur, plural, uid } from '../lib/time';
import { allBlocks, byTitle, catOf, normLib, type Lib } from '../lib/model';

export default function Activiteitenbank() {
  const { settings, lib, opks, saveLib, deleteLib, can } = useSpeltak();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [sel, setSel] = useState<string | null>(null);
  const ql = q.toLowerCase();
  const items = lib.filter(l => (!cat || l.cat === cat) && (!ql || (l.title + ' ' + l.short + ' ' + l.location).toLowerCase().includes(ql))).sort(byTitle);
  const uses: Record<string, number> = {};
  opks.forEach(o => allBlocks(o).forEach(b => { if (b.libId) uses[b.libId] = (uses[b.libId] || 0) + 1; }));
  const edit = can('bank');
  const create = () => { const l = normLib({ id: uid(), cat: (settings.categories[0] || {}).id || '', minLeaders: 1 }); saveLib(l); setSel(l.id); setQ(''); setCat(''); setTimeout(() => document.getElementById('lf-title')?.focus(), 30); };
  const L = sel ? lib.find(l => l.id === sel) : undefined;
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={plural(lib.length, 'activiteit', 'activiteiten')}>{edit && <button className="btn primary" onClick={create}><Plus size={16} />Nieuwe activiteit</button>}</PageTitle>
    <div className="toolbar">
      <input className="inp" type="search" placeholder="Zoek op titel, beschrijving of locatie" value={q} onChange={e => setQ(e.target.value)} />
      <div className="catfilter"><Chip on={!cat} onClick={() => setCat('')}>Alle</Chip>{settings.categories.map(c => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}><Dot color={c.color} />{c.label}</Chip>)}</div>
    </div>
    <div className="bank">
      <div>{items.length ? <div className="bank-grid">{items.map(l => { const c = catOf(settings, l.cat); return <button key={l.id} className={'bcard lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5' + (sel === l.id ? ' sel' : '')} onClick={() => setSel(l.id)}>
        <span className="bt"><Dot color={c.color} /><span>{l.title || 'Naamloos'}</span></span>
        <span className="bm"><span>{c.label}</span><span className="mono">{fmtDur(l.dur)}</span><span>min. {l.minLeaders} leiding</span>{l.location && <span>{l.location}</span>}</span>
        {l.short && <span className="bs">{l.short}</span>}
        <span className="hint">{uses[l.id] ? `${uses[l.id]}× gebruikt` : 'Nog niet gebruikt'}</span>
      </button>; })}</div>
        : <div className="empty"><span>{lib.length ? 'Geen activiteiten gevonden met deze filter.' : 'Nog geen activiteiten. Maak er een, of bewaar een onderdeel vanuit de opkomstbouwer.'}</span>{!lib.length && edit && <button className="btn primary" onClick={create}>Nieuwe activiteit</button>}</div>}</div>
      <aside className={'card side sheet' + (L ? ' editing' : '')}>{L ? <LibEditor key={L.id} l={L} readOnly={!edit} onClose={() => setSel(null)} onSave={saveLib} onDelete={() => { deleteLib(L.id); setSel(null); toast('Activiteit verwijderd'); }} />
        : <div className="pad stack"><h3>Activiteit bewerken</h3><p className="muted">Kies een activiteit om hem te bekijken{edit ? ' of te bewerken' : ''}. In de opkomstbouwer sleep je activiteiten vanuit het zijpaneel op de tijdlijn.</p></div>}</aside>
      <div className={'scrim' + (L ? ' on' : '')} onClick={() => setSel(null)} />
    </div>
  </div>;
}

function LibEditor({ l, readOnly, onClose, onSave, onDelete }: { l: Lib; readOnly: boolean; onClose: () => void; onSave: (l: Lib) => void; onDelete: () => void }) {
  const [, bump] = useState(0);
  const upd = (fn: () => void) => { if (readOnly) return; fn(); onSave({ ...l }); bump(x => x + 1); };
  const durs: number[] = []; for (let d = 5; d <= 240; d += 5) durs.push(d);
  if (!durs.includes(l.dur)) durs.push(l.dur);
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><span className="eyebrow">Activiteit</span><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    <Field label="Titel van de activiteit" htmlFor="lf-title"><input id="lf-title" value={l.title} readOnly={readOnly} onChange={e => upd(() => { l.title = e.target.value; })} placeholder="bijv. Levend Stratego" /></Field>
    <div className="two"><Field label="Duur" htmlFor="lf-dur"><select id="lf-dur" value={l.dur} disabled={readOnly} onChange={e => upd(() => { l.dur = +e.target.value; })}>{durs.sort((a, b) => a - b).map(d => <option key={d} value={d}>{fmtDur(d)}</option>)}</select></Field>
      <Field label="Minimaal aantal leiding" htmlFor="lf-min"><input id="lf-min" type="number" min={1} max={30} readOnly={readOnly} value={l.minLeaders} onChange={e => upd(() => { l.minLeaders = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)); })} /></Field></div>
    <CatSelect prefix="lf" value={l.cat} onChange={id => upd(() => { l.cat = id; })} />
    <Field label="Locatie" htmlFor="lf-loc"><LocInput id="lf-loc" value={l.location} onChange={v => upd(() => { l.location = v; })} placeholder="bijv. Bos" /></Field>
    <Field label="Korte beschrijving" htmlFor="lf-short"><textarea id="lf-short" rows={2} readOnly={readOnly} value={l.short} onChange={e => upd(() => { l.short = e.target.value; })} /></Field>
    <Field label="Uitgebreide beschrijving" htmlFor="lf-desc"><textarea id="lf-desc" rows={6} readOnly={readOnly} value={l.desc} onChange={e => upd(() => { l.desc = e.target.value; })} /></Field>
    <Field label="Voorbereiding" htmlFor="lf-prep"><textarea id="lf-prep" rows={3} readOnly={readOnly} value={l.prep} onChange={e => upd(() => { l.prep = e.target.value; })} /></Field>
    <Field label="Materiaal" htmlFor="lf-mat"><textarea id="lf-mat" rows={4} readOnly={readOnly} value={l.materials} onChange={e => upd(() => { l.materials = e.target.value; })} placeholder="Eén ding per regel" /></Field>
    {!readOnly && <div className="row"><ConfirmBtn label="Verwijderen" confirm="Klik nogmaals om te verwijderen" onConfirm={onDelete} /></div>}
  </div>;
}
