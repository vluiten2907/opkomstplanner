import { useRef, useState, type InputHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Download, Link2, Mail, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Dot, Field, TimePicker, useDebouncedInput } from '../components/ui';
import { download, slugify } from '../lib/export';
import { fmtNL, fmtT, plural, todayISO, uid, DAYS, MONTHS } from '../lib/time';
import { ACCENTS, normLib, normOpk, normPlan, normSettings, prepLabel, PREP_OPTS, SPELTAKKEN, SWATCHES, type Settings } from '../lib/model';
import { ALL_PERMS, DEFAULT_LEIDING_PERMS, PERM_HELP, PERM_LABELS, type Member, type PermKey, type Perms, type Role } from '../lib/types';

/** Tekstveld dat pas na een korte pauze opslaat (voorkomt een schrijfactie per toetsaanslag). */
function DebText({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useDebouncedInput(value, onCommit, 600);
  return <input {...rest} value={v} onChange={e => setV(e.target.value)} />;
}

export default function Instellingen() {
  const S = useSpeltak();
  const { settings, isTL, can, saveSettings, opks, lib, plans, sp } = S;
  const edit = can('settings');
  const set = (patch: Partial<Settings>) => saveSettings(patch);
  const monthOpts = MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>);
  const dayOpts = (list: number[]) => list.map(n => <option key={n} value={n}>{n} dagen</option>);
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={isTL ? 'Team & instellingen' : 'Instellingen'} sub={edit ? undefined : 'Je kunt de instellingen bekijken; alleen de teamleider (of leiding met het recht Instellingen) kan ze aanpassen.'} />
    <div className="settings">
      <Team />
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Je groep</h2>
        <Field label="Naam van de groep" htmlFor="gs-name"><DebText id="gs-name" value={settings.groupName} onCommit={v => set({ groupName: v.trim() })} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>
        <Field label="Speltak" htmlFor="gs-speltak"><DebText id="gs-speltak" list="speltaklist" value={settings.speltak} onCommit={v => set({ speltak: v.trim() })} placeholder="bijv. Scouts" /><datalist id="speltaklist">{SPELTAKKEN.map(x => <option key={x} value={x} />)}</datalist></Field>
        <Logo />
        <div className="field"><span className="lbl">Kleur</span><div className="accents">{Object.entries(ACCENTS).map(([k, a]) => <button key={k} className="acc" aria-pressed={settings.accent === k} style={{ ['--c' as any]: a.l }} onClick={() => set({ accent: k })}><i />{a.label}</button>)}</div></div>
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Standaardtijden en seizoen</h2>
        <div className="two">
          <Field label="Begintijd" className="timefield"><TimePicker value={settings.defStart} from={360} to={1430} onChange={v => { const p: Partial<Settings> = { defStart: v }; if (settings.defEnd <= v) { p.defEnd = v + 60; toast('Standaard eindtijd verschoven naar ' + fmtT(v + 60)); } set(p); }} /></Field>
          <Field label="Eindtijd" className="timefield"><TimePicker value={settings.defEnd} from={365} to={1435} onChange={v => { if (v <= settings.defStart) { toast('De eindtijd moet na de begintijd liggen.'); return; } set({ defEnd: v }); }} /></Field>
        </div>
        <div className="two">
          <Field label="Voorbereiding leiding"><select value={settings.prepMin} onChange={e => set({ prepMin: +e.target.value })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' vooraf' : ''}</option>)}</select></Field>
          <Field label="Nabespreking leiding"><select value={settings.postMin} onChange={e => set({ postMin: +e.target.value })}>{PREP_OPTS.map(m => <option key={m} value={m}>{prepLabel(m)}{m ? ' achteraf' : ''}</option>)}</select></Field>
        </div>
        <Field label="Vaste opkomstdag"><select value={settings.opkDay} onChange={e => set({ opkDay: +e.target.value })}>{[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}</select></Field>
        <div className="two">
          <Field label="Seizoen begint in"><select value={settings.seasonStartMonth} onChange={e => set({ seasonStartMonth: +e.target.value })}>{monthOpts}</select></Field>
          <Field label="Seizoen eindigt in"><select value={settings.seasonEndMonth} onChange={e => set({ seasonEndMonth: +e.target.value })}>{monthOpts}</select></Field>
        </div>
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Vaste blokken</h2>
        <label className="toggle"><input type="checkbox" checked={settings.fixedOn} onChange={e => set({ fixedOn: e.target.checked })} /><span><b>Vaste blokken toevoegen</b><br /><span className="hint">Openen, ranja drinken en sluiten staan dan automatisch in elke nieuwe opkomst (niet bij kampen).</span></span></label>
        {settings.fixedOn && <div className="three">{([['fixedOpen', 'Openen'], ['fixedRanja', 'Ranja drinken'], ['fixedClose', 'Sluiten']] as const).map(([k, l]) => <Field key={k} label={l}><select value={settings[k]} onChange={e => set({ [k]: +e.target.value } as Partial<Settings>)}>{[0, 5, 10, 15, 20, 25, 30].map(m => <option key={m} value={m}>{m ? m + ' min' : 'Niet'}</option>)}</select></Field>)}</div>}
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Brieven</h2>
        <Field label="Brief standaard versturen" hint="voor de opkomst"><select value={settings.letterDays} onChange={e => set({ letterDays: +e.target.value })}>{dayOpts([7, 10, 14, 21, 28, 42])}</select></Field>
        <Field label="Melding op het dashboard" hint="voor de verzenddatum"><select value={settings.letterNotice} onChange={e => set({ letterNotice: +e.target.value })}>{dayOpts([3, 7, 10, 14, 21])}</select></Field>
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Extra leiding</h2>
        <p className="hint">Leden van het team staan hierboven en zijn automatisch in te delen. Hier zet je namen van leiding of hulpouders zonder account.</p>
        <NameList items={settings.leaders} placeholder="Naam" label="Naam leiding" onChange={leaders => set({ leaders })} dedupe />
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Categorieën</h2>
        <div className="stack" style={{ gap: 8 }}>{settings.categories.map((c, i) => <div key={c.id} className="catrow">
          <div className="row"><Dot color={c.color} style={{ width: 14, height: 14 }} /><DebText className="inp" value={c.label} aria-label="Naam categorie" style={{ flex: 1 }} onCommit={v => { const cats = settings.categories.map((x, j) => j === i ? { ...x, label: v } : x); set({ categories: cats }); }} />
            <ConfirmBtn className="btn sm ghost" label="Verwijderen" confirm="Zeker?" onConfirm={() => set({ categories: settings.categories.filter((_, j) => j !== i) })} /></div>
          <div className="swatches">{SWATCHES.map(s => <button key={s} className="sw" style={{ ['--c' as any]: s }} aria-pressed={s === c.color} aria-label={'Kleur ' + s} onClick={() => set({ categories: settings.categories.map((x, j) => j === i ? { ...x, color: s } : x) })} />)}</div>
        </div>)}</div>
        <AddRow placeholder="Nieuwe categorie" onAdd={v => set({ categories: [...settings.categories, { id: uid(), label: v, color: SWATCHES[settings.categories.length % SWATCHES.length] }] })} />
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <h2>Locaties</h2>
        <NameList items={settings.locations} placeholder="bijv. Speelveld" label="Locatie" onChange={locations => set({ locations })} />
      </fieldset>
      <section className="card pad stack">
        <h2>Back-up</h2>
        <div className="row"><button className="btn" onClick={() => {
          const data = JSON.stringify({ app: 'opkomstplanner', version: 4, exported: new Date().toISOString(), settings, lib, opks, plans }, null, 2);
          download('opkomstplanner-' + (settings.groupName ? slugify(settings.groupName).slice(0, 40) + '-' : '') + 'backup-' + fmtNL(todayISO()) + '.json', new Blob([data], { type: 'application/json' }), 'Back-up gedownload');
        }}><Download size={16} />Back-up maken</button>{edit && can('build') && <Restore />}</div>
        <p className="hint">{plural(opks.length, 'opkomst', 'opkomsten')} · {plural(lib.length, 'activiteit', 'activiteiten')} · {plural(plans.length, 'datum in de planning', 'data in de planning')}</p>
        {edit && <p className="hint">Een back-up uit de losse (offline) Opkomstplanner kun je hier ook terugzetten: alles wordt aan deze speltak toegevoegd.</p>}
        {!isTL && sp && <Leave />}
      </section>
    </div>
  </div>;
}

function Logo() {
  const { settings, saveSettings } = useSpeltak();
  const ref = useRef<HTMLInputElement>(null);
  const read = (f: File | undefined) => {
    if (!f) return; if (!/^image\//.test(f.type)) { toast('Kies een afbeelding (PNG of JPG).'); return; }
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const max = 256, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      saveSettings({ logo: c.toDataURL('image/png'), logoW: w, logoH: h }).then(() => toast('Logo opgeslagen'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Deze afbeelding kan niet worden gelezen.'); };
    img.src = url;
  };
  return <div className="field"><span className="lbl">Logo</span><div className="logobox">
    <div className="logoprev">{settings.logo ? <img src={settings.logo} alt="Logo" /> : 'Geen logo'}</div>
    <div className="row"><button className="btn sm" onClick={() => ref.current?.click()}>{settings.logo ? 'Ander logo' : 'Logo kiezen'}</button>{settings.logo && <button className="btn sm ghost" onClick={() => saveSettings({ logo: '', logoW: 0, logoH: 0 })}>Verwijderen</button>}</div>
    <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }} />
  </div></div>;
}

function NameList({ items, placeholder, label, onChange, dedupe }: { items: string[]; placeholder: string; label: string; onChange: (v: string[]) => void; dedupe?: boolean }) {
  return <>
    <ul className="setlist">{items.map((n, i) => <li key={i}><DebText className="inp" value={n} aria-label={label} onCommit={v => onChange(items.map((x, j) => j === i ? v : x))} /><ConfirmBtn className="btn sm ghost" label="Verwijderen" confirm="Zeker?" onConfirm={() => onChange(items.filter((_, j) => j !== i))} /></li>)}</ul>
    <AddRow placeholder={placeholder} onAdd={v => { if (dedupe && items.includes(v)) { toast(v + ' staat er al in.'); return; } onChange([...items, v]); }} />
  </>;
}
function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(''); };
  return <div className="row"><input className="inp" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} style={{ flex: 1 }} /><button className="btn" onClick={add}>Toevoegen</button></div>;
}

/* ---------- Back-up terugzetten (ook uit de losse versie) ---------- */
function Restore() {
  const { settings, saveSettings, saveLib, saveOpk, savePlan, lib, opks, plans } = useSpeltak();
  const ref = useRef<HTMLInputElement>(null);
  const restore = (f: File | undefined) => {
    if (!f) return; const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(String(rd.result));
        if (!(d && d.version === 4 && Array.isArray(d.opks) && Array.isArray(d.plans))) { toast('Dit is geen back-up van de Opkomstplanner.'); return; }
        const s = normSettings(d.settings || {});
        const merged: Partial<Settings> = {
          categories: [...settings.categories, ...s.categories.filter(c => !settings.categories.some(x => x.id === c.id))],
          leaders: [...new Set([...settings.leaders, ...s.leaders])], locations: [...new Set([...settings.locations, ...s.locations])],
        };
        if (!opks.length && !plans.length) Object.assign(merged, { defStart: s.defStart, defEnd: s.defEnd, opkDay: s.opkDay, prepMin: s.prepMin, postMin: s.postMin, seasonStartMonth: s.seasonStartMonth, seasonEndMonth: s.seasonEndMonth, letterDays: s.letterDays, letterNotice: s.letterNotice, fixedOn: s.fixedOn, fixedOpen: s.fixedOpen, fixedRanja: s.fixedRanja, fixedClose: s.fixedClose, logo: s.logo || settings.logo, logoW: s.logoW || settings.logoW, logoH: s.logoH || settings.logoH });
        saveSettings(merged);
        (d.lib || []).forEach((x: any) => saveLib(normLib(x)));
        d.opks.forEach((x: any) => saveOpk(normOpk(x, settings)));
        d.plans.forEach((x: any) => { const p = normPlan(x); if (!plans.some(q => q.id !== p.id && (q.slot && q.slot === p.slot))) savePlan(p); });
        toast(`Back-up teruggezet: ${(d.lib || []).length + d.opks.length + d.plans.length} items toegevoegd.`);
        void lib;
      } catch { toast('Dit bestand kan niet worden gelezen.'); }
    };
    rd.readAsText(f);
  };
  return <><button className="btn" onClick={() => ref.current?.click()}>Back-up terugzetten</button><input ref={ref} type="file" accept=".json,application/json" hidden onChange={e => { restore(e.target.files?.[0]); e.target.value = ''; }} /></>;
}

function Leave() {
  const { removeMember, sid } = useSpeltak(); const { user } = useAuth(); const nav = useNavigate();
  return <div className="dangerzone"><b>Speltak verlaten</b><span className="hint">Je wordt uit het team gehaald; een teamleider kan je opnieuw uitnodigen.</span>
    <div className="row"><ConfirmBtn className="btn sm danger" label="Speltak verlaten" confirm="Klik nogmaals: verlaten" onConfirm={async () => { try { await removeMember(user!.uid); if (localStorage.getItem('opk.sid') === sid) localStorage.removeItem('opk.sid'); nav('/speltakken'); } catch { toast('Verlaten mislukt.'); } }} /></div></div>;
}

/* ---------- Team: leden, rechten en uitnodigingen ---------- */
function Team() {
  const { sp, isTL, setMember, removeMember, createInvite, myName } = useSpeltak();
  const { user } = useAuth();
  const [email, setEmail] = useState(''); const [role, setRole] = useState<Role>('leiding'); const [perms, setPerms] = useState<Perms>(DEFAULT_LEIDING_PERMS);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  if (!sp) return null;
  const members = Object.entries(sp.members).sort((a, b) => (a[1].role === b[1].role ? 0 : a[1].role === 'teamleider' ? -1 : 1) || a[1].name.localeCompare(b[1].name, 'nl'));
  const tlCount = members.filter(([, m]) => m.role === 'teamleider').length;
  const invite = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Vul een geldig e-mailadres in.'); return; }
    if (members.some(([, m]) => m.email === em)) { toast('Dit e-mailadres zit al in het team.'); return; }
    setBusy(true);
    try { const inv = await createInvite(em, role, role === 'teamleider' ? ALL_PERMS : perms); setLink({ email: em, url: `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/uitnodiging/${inv.id}` }); setEmail(''); setCopied(false); }
    catch { toast('Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link.url); setCopied(true); toast('Link gekopieerd'); } catch { toast('Kopiëren lukt niet; selecteer de link en kopieer hem zelf.'); } };
  const mailto = link ? `mailto:${link.email}?subject=${encodeURIComponent('Uitnodiging Opkomstplanner ' + [sp.groupName, sp.name].filter(Boolean).join(' · '))}&body=${encodeURIComponent(`Hoi,\n\n${myName || 'Ik'} nodigt je uit voor de Opkomstplanner van ${[sp.groupName, sp.name].filter(Boolean).join(' · ')}.\n\nOpen deze link en maak een account aan met dit e-mailadres (${link.email}):\n${link.url}\n\nGroet,\n${myName}`)}` : '';
  return <section className="card pad stack" style={{ gridColumn: '1 / -1' }}>
    <div className="row between"><h2>Team</h2><span className="hint">{plural(members.length, 'lid', 'leden')} · {sp.name}</span></div>
    <div className="team">
      {members.map(([uidX, m]) => <MemberRow key={uidX} uidX={uidX} m={m} me={uidX === user?.uid} isTL={isTL} lastTL={m.role === 'teamleider' && tlCount < 2}
        onRole={r => setMember(uidX, { role: r, perms: r === 'teamleider' ? ALL_PERMS : m.perms }).catch(() => toast('Aanpassen mislukt.'))}
        onPerm={(k, v) => setMember(uidX, { perms: { ...m.perms, [k]: v } }).catch(() => toast('Aanpassen mislukt.'))}
        onRemove={() => removeMember(uidX).then(() => toast(`${m.name} uit het team gehaald`)).catch(() => toast('Verwijderen mislukt.'))} />)}
    </div>
    {isTL && <div className="invite stack">
      <h3><UserPlus size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Leiding uitnodigen</h3>
      <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); invite(); } }} placeholder="e-mailadres" style={{ flex: '1 1 220px' }} />
        <div className="seg"><Chip on={role === 'leiding'} onClick={() => setRole('leiding')}>Leiding</Chip><Chip on={role === 'teamleider'} onClick={() => setRole('teamleider')}>Teamleider</Chip></div></div>
      {role === 'leiding' && <PermGrid perms={perms} onChange={(k, v) => setPerms({ ...perms, [k]: v })} />}
      <div className="row"><button className="btn primary" disabled={busy} onClick={invite}><Link2 size={16} />Uitnodigingslink maken</button></div>
      {link && <div className="banknote"><span>Uitnodiging voor <b>{link.email}</b>. Stuur deze link door; de link werkt alleen voor dat e-mailadres.</span>
        <code className="mono-code">{link.url}</code>
        <div className="row"><button className="btn sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Gekopieerd' : 'Kopiëren'}</button><a className="btn sm" href={mailto}><Mail size={14} />Mailen</a></div></div>}
    </div>}
  </section>;
}

function MemberRow({ uidX, m, me, isTL, lastTL, onRole, onPerm, onRemove }: { uidX: string; m: Member; me: boolean; isTL: boolean; lastTL: boolean; onRole: (r: Role) => void; onPerm: (k: PermKey, v: boolean) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = (m.name || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const summary = m.role === 'teamleider' ? 'alle rechten' : (Object.keys(PERM_LABELS) as PermKey[]).filter(k => m.perms?.[k]).map(k => PERM_LABELS[k]).join(', ') || 'alleen bekijken';
  void uidX;
  return <div className="member">
    <div className="row between" style={{ flexWrap: 'nowrap' }}>
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}><span className="avatar">{initials}</span><div style={{ minWidth: 0 }}><b>{m.name}{me ? ' (jij)' : ''}</b><div className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}{m.email ? ' · ' : ''}{m.role === 'teamleider' ? 'Teamleider' : 'Leiding'} · {summary}</div></div></div>
      {isTL && <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <button className="btn sm ghost" onClick={() => setOpen(o => !o)}>{open ? 'Sluiten' : 'Rechten'}</button>
        {!lastTL && !me && <ConfirmBtn className="iconbtn danger" label={<Trash2 size={15} />} confirm="Zeker?" title="Uit het team halen" onConfirm={onRemove} />}
      </div>}
    </div>
    {open && isTL && <div className="stack" style={{ gap: 10, paddingTop: 10 }}>
      <div className="seg"><Chip on={m.role === 'leiding'} disabled={lastTL} title={lastTL ? 'Er moet minstens één teamleider blijven' : undefined} onClick={() => onRole('leiding')}>Leiding</Chip><Chip on={m.role === 'teamleider'} onClick={() => onRole('teamleider')}>Teamleider</Chip></div>
      {m.role === 'leiding' ? <PermGrid perms={m.perms} onChange={onPerm} /> : <p className="hint">Een teamleider mag alles, ook het team beheren en leiding uitnodigen.</p>}
    </div>}
  </div>;
}

function PermGrid({ perms, onChange }: { perms: Perms; onChange: (k: PermKey, v: boolean) => void }) {
  return <div className="perm-grid">{(Object.keys(PERM_LABELS) as PermKey[]).map(k => <label key={k} className="toggle"><input type="checkbox" checked={!!perms[k]} onChange={e => onChange(k, e.target.checked)} /><span><b>{PERM_LABELS[k]}</b><br /><span className="hint">{PERM_HELP[k]}</span></span></label>)}</div>;
}
