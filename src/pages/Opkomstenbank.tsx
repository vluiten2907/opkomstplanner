import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Copy, ExternalLink, Plus, Users, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { Strip, CatTags, PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field } from '../components/ui';
import { fmtDur, fmtT, plural } from '../lib/time';
import { allBlocks, byTitle, catOf, isKamp, minNeed, newOpk, opkCatList, opkCatOf, type Cat, type Opk } from '../lib/model';
import type { Gedeeld } from '../store/groepsbank';

type Tab = 'own' | 'group';

export default function Opkomstenbank() {
  const { settings, opks, saveOpk, deleteOpk, entryOfOpk, savePlan, sid, can, sp, shared, importShared } = useSpeltak();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('own');
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [from, setFrom] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const ql = q.toLowerCase();
  const groupOn = !!sp?.gid && shared !== null;
  const g = groupOn && tab === 'group';
  const catLabel = cat ? opkCatOf(settings, cat)?.label || '' : '';

  // eigen bank
  const bank = opks.filter(o => o.state === 'bank' && (!cat || o.cats.includes(cat)) && (!ql || (o.title + ' ' + o.short).toLowerCase().includes(ql))).sort(byTitle);
  const drafts = opks.filter(o => o.state === 'draft').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const uses: Record<string, number> = {};
  opks.forEach(o => { if (o.state === 'planned' && o.srcId) uses[o.srcId] = (uses[o.srcId] || 0) + 1; });
  const total = opks.filter(o => o.state === 'bank').length;
  const T = !g && sel ? opks.find(o => o.id === sel && o.state === 'bank') : undefined;
  const remove = (o: Opk) => { const e = entryOfOpk(o); if (e) savePlan({ ...e, opkId: null }); deleteOpk(o.id); if (sel === o.id) setSel(null); toast('Opkomst verwijderd'); };

  // groepsbank (zonder je eigen gedeelde opkomsten)
  const others = (shared || []).filter(x => x.sid !== sid);
  const speltakken = [...new Map(others.map(x => [x.sid, x.speltakName || 'Speltak'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'nl'));
  const labelsOf = (x: Gedeeld) => x.opk.cats.map(id => (x.catDefs.find(c => c.id === id) || opkCatOf(settings, id))?.label?.toLowerCase());
  const groupList = others.filter(x => (!from || x.sid === from) && (!cat || labelsOf(x).includes(catLabel.toLowerCase()))
    && (!ql || (x.opk.title + ' ' + x.opk.short + ' ' + x.speltakName).toLowerCase().includes(ql)))
    .sort((a, b) => byTitle(a.opk, b.opk));
  const copied = new Set(opks.filter(o => o.fromShared).map(o => o.fromShared!));
  const G = g && sel ? others.find(x => x.id === sel) : undefined;

  const switchTab = (t: Tab) => { setTab(t); setSel(null); setFrom(''); };
  const doCopy = (x: Gedeeld) => {
    const o = importShared(x);
    toast(`"${o.title || 'Opkomst'}" staat nu in jullie opkomstenbank`);
    setTab('own'); setSel(o.id);
  };

  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={g ? plural(others.length, 'gedeelde opkomst', 'gedeelde opkomsten') : plural(total, 'opkomst', 'opkomsten')}
      sub={g ? `Gedeeld door andere speltakken van ${sp?.groupName || 'de groep'}. Kopieer er een naar jullie eigen bank.` : undefined}>
      {!g && can('build') && <button className="btn primary" onClick={() => { const o = newOpk(settings); saveOpk(o); nav(`/s/${sid}/bouwer/${o.id}`); }}><Plus size={16} />Nieuwe opkomst</button>}
    </PageTitle>
    {groupOn && <div className="tabs page" role="tablist" aria-label="Opkomstenbank">
      <button role="tab" aria-selected={!g} onClick={() => switchTab('own')}>Onze bank <span className="count">{total}</span></button>
      <button role="tab" aria-selected={g} onClick={() => switchTab('group')}>Groep <span className="count">{others.length}</span></button>
    </div>}
    <div className="toolbar"><input className="inp" type="search" placeholder={g ? 'Zoek in de groep' : 'Zoek opkomst'} value={q} onChange={e => setQ(e.target.value)} />
      {g && speltakken.length > 1 && <div className="catfilter" aria-label="Speltak"><Chip on={!from} onClick={() => setFrom('')}>Alle speltakken</Chip>{speltakken.map(([id, name]) => <Chip key={id} on={from === id} onClick={() => setFrom(id)}>{name}</Chip>)}</div>}
      <div className="catfilter"><Chip on={!cat} onClick={() => setCat('')}>Alle</Chip>{opkCatList(settings).map(c => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}><Dot color={c.color} />{c.label}</Chip>)}</div></div>
    <div className="bank">
      {g ? <div className="stack" style={{ gap: 18 }}>
        {groupList.length ? <div className="bank-grid">{groupList.map(x => <button key={x.id} className={'bcard lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5' + (sel === x.id ? ' sel' : '')} onClick={() => setSel(x.id)}>
          <span className="bt"><span>{x.opk.title || 'Naamloos'}</span></span>
          <span className="from"><Users size={13} />{x.speltakName || 'Speltak'}</span>
          <CatTags o={x.opk} cats={x.catDefs} />
          <CardMeta o={x.opk} noGroup />
          <Strip o={x.opk} cats={x.catDefs} />
          {x.opk.short && <span className="bs">{x.opk.short}</span>}
          <span className="hint">{copied.has(x.id) ? 'Al in onze bank' : x.copies ? `${x.copies}× gekopieerd` : 'Nog niet gekopieerd'}</span>
        </button>)}</div>
          : <div className="empty"><span>{others.length ? 'Niets gevonden.' : 'Andere speltakken hebben nog niets gedeeld. Wat zij in hun opkomstenbank zetten, verschijnt hier.'}</span></div>}
      </div>
        : <div className="stack" style={{ gap: 18 }}>
          {bank.length ? <div className="bank-grid">{bank.map(t => <button key={t.id} className={'bcard lift transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-1 active:translate-y-0.5' + (sel === t.id ? ' sel' : '')} onClick={() => setSel(t.id)}>
            <span className="bt"><span>{t.title || 'Naamloos'}</span>{groupOn && t.shared && <span className="shared-ico" title="Gedeeld met de groep" aria-label="Gedeeld met de groep"><Users size={14} /></span>}</span>
            <CatTags o={t} />
            <CardMeta o={t} />
            <Strip o={t} />
            {t.short && <span className="bs">{t.short}</span>}
            <span className="hint">{uses[t.id] ? `${uses[t.id]}× ingepland` : 'Nog niet ingepland'}</span>
          </button>)}</div>
            : <div className="empty"><span>{total ? 'Niets gevonden.' : 'Nog leeg. Bewaar een opkomst met "In bank".'}</span></div>}
          {drafts.length > 0 && <section className="stack"><h2>Concepten</h2>
            <div className="picklist">{drafts.map(o => <div key={o.id} className="pick"><div className="info"><b>{o.title || 'Naamloze opkomst'}</b><span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}</span></div>
              <div className="row"><button className="btn sm primary" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)}>Openen</button>
                {can('bank') && <button className="btn sm" onClick={() => { allBlocks(o).forEach(b => b.names = []); saveOpk({ ...o, state: 'bank', lead: '', shared: true }); toast(groupOn ? 'In de opkomstenbank gezet en gedeeld met de groep' : 'In de opkomstenbank gezet'); }}>In bank zetten</button>}
                {can('build') && <ConfirmBtn className="btn sm ghost" label="Verwijderen" confirm="Klik nogmaals" onConfirm={() => remove(o)} />}</div></div>)}</div></section>}
        </div>}
      <aside className={'card side sheet' + (T || G ? ' editing' : '')}>
        {T ? <TplEditor key={T.id} t={T} groupOn={groupOn} onClose={() => setSel(null)} onDelete={() => remove(T)} />
          : G ? <SharedView key={G.id} x={G} copied={copied.has(G.id)} onClose={() => setSel(null)} onCopy={() => doCopy(G)} />
            : <div className="pad stack"><h3>{g ? 'Uit de groepsbank' : 'Opkomst uit de bank'}</h3><p className="muted">{g ? 'Kies een opkomst om de onderdelen te zien en hem naar jullie eigen bank te kopiëren.' : 'Kies een opkomst om de onderdelen te zien, hem te openen of in te plannen.'}</p></div>}
      </aside>
      <div className={'scrim' + (T || G ? ' on' : '')} onClick={() => setSel(null)} />
    </div>
  </div>;
}

function CardMeta({ o, noGroup }: { o: Opk; noGroup?: boolean }) {
  return <span className="bm">{isKamp(o) ? <span className="pill kamp">Kamp · {plural(o.days.length, 'dag', 'dagen')}</span> : <span className="mono">{fmtT(o.start)}–{fmtT(o.end)}</span>}<span>{plural(allBlocks(o).length, 'onderdeel', 'onderdelen')}</span>{minNeed(o) ? <span>min. {minNeed(o)} leiding</span> : null}{!noGroup && o.group && <span>{o.group}</span>}</span>;
}

function BlockList({ o, cats }: { o: Opk; cats?: Cat[] }) {
  const { settings } = useSpeltak();
  const bl = isKamp(o) ? o.days.flatMap(d => [...d.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: d.label }))) : [...o.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: '' }));
  return <>
    <h3 className="gap-lg">{isKamp(o) ? 'Weekendkamp, ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(bl.length, 'onderdeel', 'onderdelen')}</h3>
    <ul className="tblocks">{bl.map(b => <li key={b.id}><span className="mono">{fmtT(b.start)}</span><Dot color={(cats?.find(c => c.id === b.cat) || catOf(settings, b.cat)).color} />
      <span><b>{b.title || 'Naamloos'}</b><small>{b._dl ? b._dl + ' · ' : ''}{fmtDur(b.dur)} · min. {b.minLeaders} leiding{b.location ? ' · ' + b.location : ''}</small></span></li>)}</ul>
  </>;
}

function TplEditor({ t, groupOn, onClose, onDelete }: { t: Opk; groupOn: boolean; onClose: () => void; onDelete: () => void }) {
  const { saveOpk, sid, can, sp, shared } = useSpeltak();
  const nav = useNavigate();
  const [, bump] = useState(0);
  const ro = !can('bank');
  const upd = (fn: () => void) => { if (ro) return; fn(); saveOpk({ ...t }); bump(x => x + 1); };
  const src = t.fromShared ? (shared || []).find(x => x.id === t.fromShared) : undefined;
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><span className="eyebrow">Opkomst uit de bank</span><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    <Field label="Opkomst titel" htmlFor="tf-title"><input id="tf-title" value={t.title} readOnly={ro} onChange={e => upd(() => { t.title = e.target.value; })} /></Field>
    <Field label="Korte beschrijving" htmlFor="tf-short"><textarea id="tf-short" rows={2} readOnly={ro} value={t.short} onChange={e => upd(() => { t.short = e.target.value; })} placeholder="Waar gaat deze opkomst over?" /></Field>
    {groupOn && <label className="toggle"><input id="tf-share" type="checkbox" checked={t.shared} disabled={ro} onChange={e => upd(() => { t.shared = e.target.checked; })} />
      <span><b>Delen met de groep</b><br /><span className="hint">{t.shared ? `Andere speltakken van ${sp?.groupName || 'de groep'} zien deze opkomst (zonder namen) en kunnen hem kopiëren.` : 'Alleen jullie speltak ziet deze opkomst.'}</span></span></label>}
    {t.fromShared && <p className="hint">Gekopieerd uit de groepsbank{src ? `, van ${src.speltakName}` : ''}.</p>}
    <div className="row">{can('plan') && <button className="btn primary" onClick={() => openModal({ kind: 'toplan', oid: t.id })}><CalendarDays size={16} />Inplannen</button>}<button className="btn" onClick={() => nav(`/s/${sid}/bouwer/${t.id}`)}><ExternalLink size={16} />{ro ? 'Bekijken' : 'Bewerken'}</button></div>
    <BlockList o={t} />
    {!ro && <div className="row"><ConfirmBtn label="Uit de bank verwijderen" confirm="Klik nogmaals om te verwijderen" onConfirm={onDelete} /></div>}
  </div>;
}

function SharedView({ x, copied, onClose, onCopy }: { x: Gedeeld; copied: boolean; onClose: () => void; onCopy: () => void }) {
  const { can } = useSpeltak();
  const o = x.opk;
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><span className="eyebrow">Groepsbank · {x.speltakName || 'speltak'}</span><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    <h2 className="shared-title">{o.title || 'Naamloos'}</h2>
    <CatTags o={o} cats={x.catDefs} />
    {o.short && <p className="muted">{o.short}</p>}
    {can('bank') ? <div className="row">{copied
      ? <ConfirmBtn className="btn" label={<><Copy size={16} />Nog een kopie maken</>} confirm="Staat al in jullie bank. Klik nogmaals" onConfirm={onCopy} />
      : <button className="btn primary" onClick={onCopy}><Copy size={16} />Kopieer naar onze bank</button>}</div>
      : <p className="hint">Kopiëren kan als je het recht Banken hebt.</p>}
    <p className="hint">{copied ? 'Deze opkomst staat al in jullie opkomstenbank. ' : ''}De kopie is helemaal van jullie: aanpassen verandert niets bij {x.speltakName || 'de andere speltak'}.</p>
    <BlockList o={o} cats={x.catDefs} />
  </div>;
}
