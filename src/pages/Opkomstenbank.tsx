import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ExternalLink, Plus, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { Strip, CatTags, PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field } from '../components/ui';
import { fmtDur, fmtT, plural } from '../lib/time';
import { allBlocks, byTitle, catOf, isKamp, minNeed, newOpk, opkCatList, type Opk } from '../lib/model';

export default function Opkomstenbank() {
  const { settings, opks, saveOpk, deleteOpk, entryOfOpk, savePlan, sid, can } = useSpeltak();
  const nav = useNavigate();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [sel, setSel] = useState<string | null>(null);
  const ql = q.toLowerCase();
  const bank = opks.filter(o => o.state === 'bank' && (!cat || o.cats.includes(cat)) && (!ql || (o.title + ' ' + o.short).toLowerCase().includes(ql))).sort(byTitle);
  const drafts = opks.filter(o => o.state === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const uses: Record<string, number> = {};
  opks.forEach(o => { if (o.state === 'planned' && o.srcId) uses[o.srcId] = (uses[o.srcId] || 0) + 1; });
  const total = opks.filter(o => o.state === 'bank').length;
  const T = sel ? opks.find(o => o.id === sel && o.state === 'bank') : undefined;
  const remove = (o: Opk) => { const e = entryOfOpk(o); if (e) savePlan({ ...e, opkId: null }); deleteOpk(o.id); if (sel === o.id) setSel(null); toast('Opkomst verwijderd'); };
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={plural(total, 'opkomst', 'opkomsten')}>{can('build') && <button className="btn primary" onClick={() => { const o = newOpk(settings); saveOpk(o); nav(`/s/${sid}/bouwer/${o.id}`); }}><Plus size={16} />Nieuwe opkomst</button>}</PageTitle>
    <div className="toolbar"><input className="inp" type="search" placeholder="Zoek opkomst" value={q} onChange={e => setQ(e.target.value)} />
      <div className="catfilter"><Chip on={!cat} onClick={() => setCat('')}>Alle</Chip>{opkCatList(settings).map(c => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}><Dot color={c.color} />{c.label}</Chip>)}</div></div>
    <div className="bank">
      <div className="stack" style={{ gap: 18 }}>
        {bank.length ? <div className="bank-grid">{bank.map(t => <button key={t.id} className={'bcard lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5' + (sel === t.id ? ' sel' : '')} onClick={() => setSel(t.id)}>
          <span className="bt"><span>{t.title || 'Naamloos'}</span></span>
          <CatTags o={t} />
          <span className="bm">{isKamp(t) ? <span className="pill kamp">Kamp · {plural(t.days.length, 'dag', 'dagen')}</span> : <span className="mono">{fmtT(t.start)}–{fmtT(t.end)}</span>}<span>{plural(allBlocks(t).length, 'onderdeel', 'onderdelen')}</span>{minNeed(t) ? <span>min. {minNeed(t)} leiding</span> : null}{t.group && <span>{t.group}</span>}</span>
          <Strip o={t} />
          {t.short && <span className="bs">{t.short}</span>}
          <span className="hint">{uses[t.id] ? `${uses[t.id]}× ingepland` : 'Nog niet ingepland'}</span>
        </button>)}</div>
          : <div className="empty"><span>{total ? 'Niets gevonden.' : 'Nog leeg. Bewaar een opkomst met "In bank".'}</span></div>}
        {drafts.length > 0 && <section className="stack"><h2>Concepten</h2>
          <div className="picklist">{drafts.map(o => <div key={o.id} className="pick"><div className="info"><b>{o.title || 'Naamloze opkomst'}</b><span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}</span></div>
            <div className="row"><button className="btn sm primary" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)}>Openen</button>
              {can('bank') && <button className="btn sm" onClick={() => { allBlocks(o).forEach(b => b.names = []); saveOpk({ ...o, state: 'bank', lead: '' }); toast('In de opkomstenbank gezet'); }}>In bank zetten</button>}
              {can('build') && <ConfirmBtn className="btn sm ghost" label="Verwijderen" confirm="Klik nogmaals" onConfirm={() => remove(o)} />}</div></div>)}</div></section>}
      </div>
      <aside className={'card side sheet' + (T ? ' editing' : '')}>{T ? <TplEditor key={T.id} t={T} onClose={() => setSel(null)} onDelete={() => remove(T)} /> : <div className="pad stack"><h3>Opkomst uit de bank</h3><p className="muted">Kies een opkomst om de onderdelen te zien, hem te openen of in te plannen.</p></div>}</aside>
      <div className={'scrim' + (T ? ' on' : '')} onClick={() => setSel(null)} />
    </div>
  </div>;
}

function TplEditor({ t, onClose, onDelete }: { t: Opk; onClose: () => void; onDelete: () => void }) {
  const { settings, saveOpk, sid, can } = useSpeltak();
  const nav = useNavigate();
  const [, bump] = useState(0);
  const ro = !can('bank');
  const upd = (fn: () => void) => { if (ro) return; fn(); saveOpk({ ...t }); bump(x => x + 1); };
  const bl = isKamp(t) ? t.days.flatMap(d => [...d.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: d.label }))) : [...t.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: '' }));
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><span className="eyebrow">Opkomst uit de bank</span><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    <Field label="Naam" htmlFor="tf-title"><input id="tf-title" value={t.title} readOnly={ro} onChange={e => upd(() => { t.title = e.target.value; })} /></Field>
    <Field label="Korte beschrijving" htmlFor="tf-short"><textarea id="tf-short" rows={2} readOnly={ro} value={t.short} onChange={e => upd(() => { t.short = e.target.value; })} placeholder="Waar gaat deze opkomst over?" /></Field>
    <div className="row">{can('plan') && <button className="btn primary" onClick={() => openModal({ kind: 'toplan', oid: t.id })}><CalendarDays size={16} />Inplannen</button>}<button className="btn" onClick={() => nav(`/s/${sid}/bouwer/${t.id}`)}><ExternalLink size={16} />{ro ? 'Bekijken' : 'Bewerken'}</button></div>
    <h3 className="gap-lg">{isKamp(t) ? 'Weekendkamp, ' + plural(t.days.length, 'dag', 'dagen') : fmtT(t.start) + '–' + fmtT(t.end)} · {plural(bl.length, 'onderdeel', 'onderdelen')}</h3>
    <ul className="tblocks">{bl.map(b => <li key={b.id}><span className="mono">{fmtT(b.start)}</span><Dot color={catOf(settings, b.cat).color} />
      <span><b>{b.title || 'Naamloos'}</b><small>{b._dl ? b._dl + ' · ' : ''}{fmtDur(b.dur)} · min. {b.minLeaders} leiding{b.location ? ' · ' + b.location : ''}</small></span></li>)}</ul>
    {!ro && <div className="row"><ConfirmBtn label="Uit de bank verwijderen" confirm="Klik nogmaals om te verwijderen" onConfirm={onDelete} /></div>}
  </div>;
}
