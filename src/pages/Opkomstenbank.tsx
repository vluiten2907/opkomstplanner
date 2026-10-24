import { useState } from 'react';
import { guardLeave, useDirty } from '../store/unsaved';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Copy, ExternalLink, Plus, Users, X } from 'lucide-react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { openModal } from '../store/modal';
import { BankCard, Strip, CatTags, PageTitle, SaveBar, askBankName, cardSel, conceptToBank, copySharedToBank, enterSaves, focusAfter, sideInView } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field, useEscapeClose, useSheetDialog } from '../components/ui';
import { fmtDur, fmtT, plural } from '../lib/time';
import { progBlocks, isFixed, byTitle, catOf, copyOpk, freeName, isKamp, nameTaken, minNeed, opkCatList, opkCatOf, opkSearchText, type Cat, type Opk } from '../lib/model';
import { createFresh } from '../store/fresh';
import type { Gedeeld } from '../store/groepsbank';

type Tab = 'own' | 'group';

export default function Opkomstenbank() {
  const { settings, opks, removeOpk, sid, can, sp, shared, latest } = useSpeltak();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('own');
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [from, setFrom] = useState('');
  const [sel, setSelRaw] = useState<string | null>(null);
  // breed scherm: het paneel met de opslaan-balk helemaal in beeld
  const setSel = (id: string | null) => guardLeave(() => { setSelRaw(id); if (id) sideInView(); });
  const ql = q.toLowerCase();
  const groupOn = !!sp?.gid && shared !== null;
  const g = groupOn && tab === 'group';
  const catLabel = cat ? opkCatOf(settings, cat)?.label || '' : '';

  // eigen bank: zoeken in titel, beschrijving, locatie en onderdelen; concepten volgen zoeken en filter ook
  const hit = (o: Opk) => (!cat || o.cats.includes(cat)) && (!ql || opkSearchText(o).includes(ql));
  const bank = opks.filter(o => o.state === 'bank' && hit(o)).sort(byTitle);
  const drafts = opks.filter(o => o.state === 'draft' && hit(o)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const uses: Record<string, number> = {};
  opks.forEach(o => { if (o.state === 'planned' && o.srcId) uses[o.srcId] = (uses[o.srcId] || 0) + 1; });
  const own = opks.filter(o => o.state === 'bank');
  const total = own.length;
  const T = !g && sel ? opks.find(o => o.id === sel && o.state === 'bank') : undefined;
  // concept: de knop van het volgende (of vorige) concept; bank-opkomst: de volgende (of vorige) kaart
  const nextOf = (o: Opk) => {
    const list = o.state === 'bank' ? bank : drafts, i = list.findIndex(x => x.id === o.id), nb = i < 0 ? undefined : list[i + 1] || list[i - 1];
    return !nb ? [] : o.state === 'bank' ? [cardSel(nb.id)] : [`.pick[data-oid="${CSS.escape(nb.id)}"] .to-bank`, `.pick[data-oid="${CSS.escape(nb.id)}"] .btn`];
  };
  // daarna de focus niet kwijt naar het begin van de pagina: de volgende kaart, anders het zoekveld of Nieuwe opkomst
  const remove = (o: Opk) => { const to = nextOf(o); if (sel === o.id) setSelRaw(null); removeOpk(o); focusAfter(...to, '.toolbar input[type=search]', '.btn.primary'); };

  // groepsbank (zonder je eigen gedeelde opkomsten)
  const others = (shared || []).filter(x => x.sid !== sid);
  const speltakken = [...new Map(others.map(x => [x.sid, x.speltakName || 'Speltak'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'nl'));
  const labelsOf = (x: Gedeeld) => x.opk.cats.map(id => (x.catDefs.find(c => c.id === id) || opkCatOf(settings, id))?.label?.toLowerCase());
  const groupList = others.filter(x => (!from || x.sid === from) && (!cat || labelsOf(x).includes(catLabel.toLowerCase()))
    && (!ql || (opkSearchText(x.opk) + ' ' + x.speltakName.toLowerCase()).includes(ql)))
    .sort((a, b) => byTitle(a.opk, b.opk));
  // alleen wat nu in de eigen bank staat telt (een ingeplande kopie of een concept houdt fromShared ook)
  const copied = new Set(opks.filter(o => o.state === 'bank' && o.fromShared).map(o => o.fromShared!));
  const G = g && sel ? others.find(x => x.id === sel) : undefined;
  // op een smal scherm ligt het paneel als vel over de pagina: dan is het een venster (focus erin, Esc sluit, focus terug naar de kaart)
  const [sheetRef, sheetProps] = useSheetDialog(!!(T || G), g ? 'Uit de groepsbank' : 'Opkomst uit de bank', () => document.querySelector<HTMLElement>('.bcard.sel'));
  useEscapeClose(!!sel, () => setSel(null));

  // lege bank of lege groep: geen zoekveld, filters of zijpaneel (de tabbladen blijven)
  const bare = g ? !others.length : !total && !opks.some(o => o.state === 'draft');
  const newOpkomst = () => guardLeave(() => { createFresh(latest(), false, nav); });
  const switchTab = (t: Tab) => guardLeave(() => { setTab(t); setSelRaw(null); setFrom(''); });
  const doCopy = (x: Gedeeld) => copySharedToBank(x, own, 'Kopieer naar onze bank', latest, (o, note) => {
    const t = `"${o.title || 'Opkomst'}" staat nu in jullie opkomstenbank`;
    // zonder recht Instellingen komen categorieën die jullie nog niet hebben er niet bij: zeg dat, met de namen
    if (!note) toast(t); else toast(t + '. ' + note, undefined, 8000);
    setTab('own'); setSelRaw(o.id); sideInView(); focusAfter('#tf-title');
  });
  // Ongedaan maken kan alleen met het recht Opkomsten (concept terug); zonder dat recht is de knop een dubbele klik
  const draftToBank = (o: Opk) => { const to = nextOf(o); askBankName(o, own, o.id, name => { conceptToBank(o, name, latest); focusAfter(...to, cardSel(o.id)); }); };

  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title="Opkomstenbank"
      sub={g ? plural(others.length, 'gedeelde opkomst', 'gedeelde opkomsten') + ' van andere speltakken' : total ? plural(total, 'opkomst', 'opkomsten') : 'Nog geen opkomsten'}>
      {!g && !bare && can('build') && <button className="btn primary" onClick={newOpkomst}><Plus size={16} />Nieuwe opkomst</button>}
    </PageTitle>
    {groupOn && <div className="tabs page" role="tablist" aria-label="Opkomstenbank">
      <button role="tab" aria-selected={!g} onClick={() => switchTab('own')}>Onze bank <span className="count">{total}</span></button>
      <button role="tab" aria-selected={g} onClick={() => switchTab('group')}>Groep <span className="count">{others.length}</span></button>
    </div>}
    {bare ? <div className="empty bank-empty">{g ? <span>Andere speltakken van {sp?.groupName || 'de groep'} hebben nog niets gedeeld. Wat zij in hun opkomstenbank zetten, verschijnt hier.</span>
      : <><span>{!can('bank') ? 'Hier komen opkomsten die jullie vaker gebruiken, zonder namen van leiding. In de bank zetten kan met het recht Banken.'
        : can('build') ? 'Bewaar hier opkomsten die je vaker gebruikt: bouw een opkomst en kies "In bank". Namen van leiding gaan niet mee.'
        // alleen Banken: bouwen kan niet, dus niet "bouw een opkomst" zonder knop
        : groupOn && others.length ? 'Bewaar hier opkomsten die je vaker gebruikt, zonder namen van leiding. Kopieer er een uit de groep (tabblad Groep); een nieuwe opkomst bouwen kan met het recht Opkomsten.'
        : 'Bewaar hier opkomsten die je vaker gebruikt, zonder namen van leiding. Een opkomst bouwen kan met het recht Opkomsten; daarna zet je hem hier in de bank.'}</span>
        {can('build') && <button className="btn primary" onClick={newOpkomst}><Plus size={16} />Nieuwe opkomst</button>}</>}</div> : <>
    <div className="toolbar"><input className="inp" type="search" placeholder={g ? 'Zoek in de groep' : 'Zoek opkomst'} aria-label={g ? 'Zoek in de groep' : 'Zoek opkomst'} value={q} onChange={e => setQ(e.target.value)} />
      {g && speltakken.length > 1 && <div className="catfilter" role="group" aria-label="Speltak"><Chip on={!from} onClick={() => setFrom('')}>Alle speltakken</Chip>{speltakken.map(([id, name]) => <Chip key={id} on={from === id} onClick={() => setFrom(id)}>{name}</Chip>)}</div>}
      <div className="catfilter" role="group" aria-label="Categorie"><Chip on={!cat} onClick={() => setCat('')}>Alle</Chip>{opkCatList(settings).map(c => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}><Dot color={c.color} />{c.label}</Chip>)}</div></div>
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
          {bank.length ? <div className="bank-grid">{bank.map(t => <BankCard key={t.id} what="Opkomst" title={t.title} onDelete={can('bank') ? () => remove(t) : undefined}><button data-id={t.id} className={'bcard lift transition-[box-shadow] duration-150 ease-out' + (sel === t.id ? ' sel' : '')} onClick={() => setSel(t.id)}>
            <span className="bt"><span>{t.title || 'Naamloos'}</span>{groupOn && t.shared && <span className="shared-ico" title="Gedeeld met de groep" aria-label="Gedeeld met de groep"><Users size={14} /></span>}</span>
            <CatTags o={t} />
            <CardMeta o={t} />
            <Strip o={t} />
            {t.short && <span className="bs">{t.short}</span>}
            <span className="hint">{uses[t.id] ? `${uses[t.id]}× ingepland` : 'Nog niet ingepland'}</span>
          </button></BankCard>)}</div>
            : !total ? <div className="empty"><span>{can('bank') ? 'Nog leeg. Bewaar een opkomst met "In bank".' : 'Nog leeg. In de bank zetten kan met het recht Banken.'}</span></div>
              : !drafts.length && <div className="empty"><span>Niets gevonden.</span></div>}
          {drafts.length > 0 && <section className="stack"><h2>Concepten</h2>
            <div className="picklist">{drafts.map(o => <div key={o.id} className="pick" data-oid={o.id}><div className="info"><b>{o.title || 'Naamloze opkomst'}</b><span className="hint">{isKamp(o) ? 'Weekendkamp · ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(progBlocks(o).length, 'onderdeel', 'onderdelen')}</span></div>
              <div className="row"><button className="btn sm" onClick={() => nav(`/s/${sid}/bouwer/${o.id}`)}>Openen</button>
                {can('bank') && (can('build') ? <button className="btn sm to-bank" onClick={() => draftToBank(o)}>In bank zetten</button>
                  : <ConfirmBtn className="btn sm to-bank" label="In bank zetten" confirm="Klik nogmaals: namen gaan niet mee" ariaLabel={`Concept ${o.title || 'Naamloze opkomst'} in de bank zetten`} onConfirm={() => draftToBank(o)} />)}
                {can('build') && <ConfirmBtn className="btn sm ghost" label="Verwijderen" confirm="Klik nogmaals" ariaLabel={`Concept ${o.title || 'Naamloze opkomst'} verwijderen`} onConfirm={() => remove(o)} />}</div></div>)}</div></section>}
        </div>}
      <aside className={'card side sheet' + (T || G ? ' editing' : '')}>
        {T || G ? <div ref={sheetRef} {...sheetProps}>{T ? <TplEditor key={T.id} t={T} own={own} groupOn={groupOn} onClose={() => setSel(null)} onDelete={() => remove(T)} onCopied={id => { setSelRaw(id); sideInView(); focusAfter('#tf-title'); }} />
          : G && <SharedView key={G.id} x={G} copied={copied.has(G.id)} onClose={() => setSel(null)} onCopy={() => doCopy(G)} />}</div>
            : <div className="pad stack"><h2 className="h-sm">{g ? 'Uit de groepsbank' : 'Opkomst uit de bank'}</h2><p className="muted">{g ? 'Kies een opkomst om de onderdelen te zien en hem naar jullie eigen bank te kopiëren.' : 'Kies een opkomst om de onderdelen te zien, hem te openen of in te plannen.'}</p></div>}
      </aside>
      <div className={'scrim' + (T || G ? ' on' : '')} onClick={() => setSel(null)} />
    </div></>}
  </div>;
}

function CardMeta({ o, noGroup }: { o: Opk; noGroup?: boolean }) {
  return <span className="bm">{isKamp(o) ? <span className="pill kamp">Kamp · {plural(o.days.length, 'dag', 'dagen')}</span> : <span className="mono">{fmtT(o.start)}–{fmtT(o.end)}</span>}<span>{plural(progBlocks(o).length, 'onderdeel', 'onderdelen')}</span>{minNeed(o) ? <span>min. {minNeed(o)} leiding</span> : null}{!noGroup && o.group && <span>{o.group}</span>}</span>;
}

function BlockList({ o, cats }: { o: Opk; cats?: Cat[] }) {
  const { settings } = useSpeltak();
  const bl = isKamp(o) ? o.days.flatMap(d => [...d.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: d.label }))) : [...o.blocks].sort((a, b) => a.start - b.start).map(b => ({ ...b, _dl: '' }));
  return <>
    <h3 className="gap-lg">{isKamp(o) ? 'Weekendkamp, ' + plural(o.days.length, 'dag', 'dagen') : fmtT(o.start) + '–' + fmtT(o.end)} · {plural(bl.filter(b => !isFixed(b)).length, 'onderdeel', 'onderdelen')}</h3>
    <ul className="tblocks">{bl.map(b => <li key={b.id}><span className="mono">{fmtT(b.start)}</span><Dot color={(cats?.find(c => c.id === b.cat) || catOf(settings, b.cat)).color} />
      <span><b>{b.title || 'Naamloos'}</b><small>{b._dl ? b._dl + ' · ' : ''}{fmtDur(b.dur)}{b.minLeaders > 0 ? ` · min. ${b.minLeaders} leiding` : ''}{b.location ? ' · ' + b.location : ''}</small></span></li>)}</ul>
  </>;
}

function TplEditor({ t, own, groupOn, onClose, onDelete, onCopied }: { t: Opk; own: Opk[]; groupOn: boolean; onClose: () => void; onDelete: () => void; onCopied: (id: string) => void }) {
  const { saveOpk, sid, can, canLink, sp, shared } = useSpeltak();
  const nav = useNavigate();
  const ro = !can('bank');
  // titel, beschrijving en delen eerst in een kladversie; pas bij Opslaan naar de bank
  const [d, setD] = useState(() => ({ title: t.title, short: t.short, shared: t.shared }));
  const [dirty, setDirty] = useState(false);
  const cancel = () => { setD({ title: t.title, short: t.short, shared: t.shared }); setDirty(false); };
  // Weggooien in de melding (bijv. bij Inplannen, dat het paneel open laat): de kladversie terug, net als Annuleren
  useDirty(dirty, cancel);
  const upd = (p: Partial<typeof d>) => { if (ro) return; setD({ ...d, ...p }); setDirty(true); };
  const save = () => { saveOpk({ ...t, ...d, title: d.title.trim() }); setDirty(false); toast('Opkomst opgeslagen'); };
  const copy = (name: string) => { const c = copyOpk({ ...t, ...d }); c.title = name; c.srcId = null; c.fromShared = null; saveOpk(c); setDirty(false); onCopied(c.id); toast(`Kopie "${name}" opgeslagen`); };
  const src = t.fromShared ? (shared || []).find(x => x.id === t.fromShared) : undefined;
  return <div className="pad stack">
    <div className="row between" style={{ alignItems: 'flex-start' }}><div className="row"><span className="eyebrow">Opkomst uit de bank</span>{ro && <span className="pill neutral">Alleen lezen</span>}</div><button className="closex" onClick={onClose} aria-label="Sluiten"><X size={18} /></button></div>
    {ro && <p className="hint">Aanpassen kan met het recht Banken.</p>}
    <Field label="Opkomst titel" htmlFor="tf-title"><input id="tf-title" value={d.title} readOnly={ro} onChange={e => upd({ title: e.target.value })} onKeyDown={ro ? undefined : enterSaves} /></Field>
    <Field label="Korte beschrijving" htmlFor="tf-short"><textarea id="tf-short" rows={2} readOnly={ro} value={d.short} onChange={e => upd({ short: e.target.value })} placeholder="Waar gaat deze opkomst over?" /></Field>
    {groupOn && <label className="toggle"><input id="tf-share" type="checkbox" checked={d.shared} disabled={ro} onChange={e => upd({ shared: e.target.checked })} />
      <span><b>Delen met de groep</b><br /><span className="hint">{d.shared ? `Andere speltakken van ${sp?.groupName || 'de groep'} zien deze opkomst (zonder namen) en kunnen hem kopiëren.` : 'Alleen jullie speltak ziet deze opkomst.'}</span></span></label>}
    {t.fromShared && <p className="hint">Gekopieerd uit de groepsbank{src ? `, van ${src.speltakName}` : ''}.</p>}
    <div className="row">{canLink && <button className="btn primary" onClick={() => guardLeave(() => openModal({ kind: 'toplan', oid: t.id }))}><CalendarDays size={16} />Inplannen</button>}<button className="btn" onClick={() => guardLeave(() => nav(`/s/${sid}/bouwer/${t.id}`))}><ExternalLink size={16} />{ro ? 'Bekijken' : 'Bewerken'}</button></div>
    <BlockList o={t} />
    {!ro && <div className="stack" style={{ gap: 4 }}><div className="row"><ConfirmBtn label="Uit de bank verwijderen" confirm="Klik nogmaals om te verwijderen" onConfirm={onDelete} /></div>
      <p className="hint">Ingeplande opkomsten blijven staan.{groupOn && t.shared ? ' Hij verdwijnt ook uit de groepsbank; kopieën van andere speltakken blijven.' : ''}</p></div>}
    {!ro && <SaveBar dirty={dirty} title={d.title} origTitle={t.title} taken={(n, c) => nameTaken(own, n, c ? null : t.id)} suggest={freeName(own, d.title || t.title)} onCancel={cancel} onSave={save} onCopy={copy} />}
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
