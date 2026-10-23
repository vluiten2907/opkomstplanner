import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Link2, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { PageTitle } from '../components/shared';
import { Chip, ConfirmBtn, Field, TimePicker, useDebouncedInput } from '../components/ui';
import { download, slugify } from '../lib/export';
import { lastSpeltak } from '../lib/lastSpeltak';
import { fmtNL, fmtT, plural, todayISO, uid, DAYS, MONTHS } from '../lib/time';
import { ACCENTS, normLib, normOpk, normPlan, normSettings, prepLabel, PREP_OPTS, SPELTAKKEN, SWATCHES, SWATCH_NAMES, type Opk, type Plan, type Settings } from '../lib/model';
import { ALL_PERMS, DEFAULT_LEIDING_PERMS, PERM_HELP, PERM_LABELS, isTeamleider, type Invite, type Member, type PermKey, type Perms } from '../lib/types';
import { ensureTlIds, inviteOnce, isEmail, releaseOwnName, removeGroupAdmin, renewInvite, setGroupAdmin, setTeamleider, stepDownTeamleider, transferJoiners, transferTeamleider } from '../store/beheer';
import { useRoles } from '../store/roles';
import { InviteLink, InviteList, useOpenInvites } from '../components/Invites';

/**
 * Tekstveld dat pas na een korte pauze opslaat (voorkomt een schrijfactie per toetsaanslag).
 * `required`: een leeg veld wordt niet opgeslagen (wie het leegmaakt om een nieuwe naam te typen, krijgt niet na de pauze de oude terug);
 * laat je het leeg achter, dan komt de opgeslagen waarde terug met deze melding.
 */
function DebText({ value, onCommit, onBlur, required, ...rest }: { value: string; onCommit: (v: string) => void; required?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'required'>) {
  const [v, setV, flush, reset] = useDebouncedInput(value, x => { if (!required || x.trim()) onCommit(x); }, 600);
  return <input {...rest} value={v} onChange={e => setV(e.target.value)} onBlur={e => {
    flush();
    if (required && !e.currentTarget.value.trim() && value.trim()) { reset(value); toast(required); }
    onBlur?.(e);
  }} />;
}
type Patch = Partial<Settings> | ((s: Settings) => Partial<Settings>);

export default function Instellingen() {
  const S = useSpeltak();
  const { settings, isTL, can, saveSettings, opks, lib, plans } = S;
  const team = isTL || S.isAdmin;
  const edit = can('settings');
  // lijsten altijd vanuit de nieuwste instellingen aanpassen, en categorieën op id (niet op plek)
  const set = (patch: Patch) => saveSettings(patch);
  const setCat = (id: string, p: Partial<Settings['categories'][0]>) => set(s => ({ categories: s.categories.map(x => x.id === id ? { ...x, ...p } : x) }));
  const monthOpts = MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>);
  const dayOpts = (list: number[]) => list.map(n => <option key={n} value={n}>{n} dagen</option>);
  return <div className="stack pt-6 md:pt-8" style={{ gap: 18 }}>
    <PageTitle title={team ? 'Team & instellingen' : 'Instellingen'} sub={edit ? undefined : 'Je kunt de instellingen bekijken; alleen de teamleider (of leiding met het recht Instellingen) kan ze aanpassen.'} />
    {/* kolommen lopen van boven naar beneden: volgorde = leesvolgorde (en zo zijn de kolommen ongeveer even lang) */}
    <div className="settings">
      <Team />
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Je groep</h2>
        {/* Onder een groep hoort de naam bij de groep (ook in uitnodigingen en pdf's): die past de beheerder aan in Beheer. */}
        {S.sp?.gid ? <Field label="Naam van de groep" htmlFor="gs-name" hint="Wijzigen kan de beheerder van de groep in Beheer."><input id="gs-name" value={settings.groupName} readOnly aria-readonly="true" /></Field>
          : <Field label="Naam van de groep" htmlFor="gs-name"><DebText id="gs-name" value={settings.groupName} onCommit={v => set({ groupName: v.trim() })} required="Vul de naam van de groep in." maxLength={60} placeholder="bijv. Scoutinggroep De Verkenners" /></Field>}
        <Field label="Speltak" htmlFor="gs-speltak"><DebText id="gs-speltak" list="speltaklist" value={settings.speltak} onCommit={v => set({ speltak: v.trim() })} required="Vul de naam van de speltak in." maxLength={60} placeholder="bijv. Scouts" /><datalist id="speltaklist">{SPELTAKKEN.map(x => <option key={x} value={x} />)}</datalist></Field>
        <Logo />
        <Field label="Kleur"><div className="accents">{Object.entries(ACCENTS).map(([k, a]) => <button key={k} className="acc" aria-pressed={settings.accent === k} style={{ ['--c' as any]: a.l }} onClick={() => set({ accent: k })}><i />{a.label}</button>)}</div></Field>
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit}>
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
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Vaste blokken</h2>
        <label className="toggle"><input type="checkbox" checked={settings.fixedOn} onChange={e => set({ fixedOn: e.target.checked })} /><span><b>Vaste blokken toevoegen</b><br /><span className="hint">Openen, ranja drinken en sluiten staan dan automatisch in elke nieuwe opkomst (niet bij kampen).</span></span></label>
        {settings.fixedOn && <div className="three">{([['fixedOpen', 'Openen'], ['fixedRanja', 'Ranja drinken'], ['fixedClose', 'Sluiten']] as const).map(([k, l]) => <Field key={k} label={l}><select value={settings[k]} onChange={e => set({ [k]: +e.target.value } as Partial<Settings>)}>{[0, 5, 10, 15, 20, 25, 30].map(m => <option key={m} value={m}>{m ? m + ' min' : 'Niet'}</option>)}</select></Field>)}</div>}
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Brieven</h2>
        <Field label="Brief standaard versturen" hint="voor de opkomst"><select value={settings.letterDays} onChange={e => set({ letterDays: +e.target.value })}>{dayOpts([7, 10, 14, 21, 28, 42])}</select></Field>
        <Field label="Melding op het dashboard" hint="voor de verzenddatum"><select value={settings.letterNotice} onChange={e => set({ letterNotice: +e.target.value })}>{dayOpts([3, 7, 10, 14, 21])}</select></Field>
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Categorieën</h2>
        <div className="stack" style={{ gap: 8 }}>{settings.categories.map(c => <CatRow key={c.id} label={c.label} color={c.color}
          onLabel={v => setCat(c.id, { label: v })} onColor={v => setCat(c.id, { color: v })} onRemove={() => set(s => ({ categories: s.categories.filter(x => x.id !== c.id) }))} />)}</div>
        <AddRow placeholder="Nieuwe categorie" onAdd={v => set(s => ({ categories: [...s.categories, { id: uid(), label: v, color: SWATCHES[s.categories.length % SWATCHES.length] }] }))} />
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Extra leiding</h2>
        <p className="hint">Leden van het team staan hierboven en zijn automatisch in te delen. Hier zet je namen van leiding of hulpouders zonder account.</p>
        <NameList items={settings.leaders} placeholder="Naam" label="Naam leiding" onChange={fn => set(s => ({ leaders: fn(s.leaders) }))} dedupe />
      </fieldset>
      <fieldset className="card pad stack" disabled={!edit}>
        <h2>Locaties</h2>
        <NameList items={settings.locations} placeholder="bijv. Speelveld" label="Locatie" onChange={fn => set(s => ({ locations: fn(s.locations) }))} />
      </fieldset>
      <section className="card pad stack">
        <h2>Back-up</h2>
        <div className="row"><button className="btn" onClick={() => {
          const data = JSON.stringify({ app: 'opkomstplanner', version: 4, exported: new Date().toISOString(), settings, lib, opks, plans }, null, 2);
          download('opkomstplanner-' + (settings.groupName ? slugify(settings.groupName).slice(0, 40) + '-' : '') + 'backup-' + fmtNL(todayISO()) + '.json', new Blob([data], { type: 'application/json' }), 'Back-up gedownload');
        }}><Download size={16} />Back-up maken</button>{edit && can('build') && <Restore />}</div>
        <p className="hint">{plural(opks.length, 'opkomst', 'opkomsten')} · {plural(lib.length, 'activiteit', 'activiteiten')} · {plural(plans.length, 'datum in de planning', 'data in de planning')}</p>
        {edit && <p className="hint">Terugzetten vult alleen aan: wat al in deze speltak staat, blijft zoals het is. Ook een back-up uit de losse (offline) Opkomstplanner kan.</p>}
        {!isTL && S.isMember && <Leave />}
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
      saveSettings({ logo: c.toDataURL('image/png'), logoW: w, logoH: h }).then(ok => { if (ok) toast('Logo opgeslagen'); });
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

/** Categorie: naam, één kleurstip (een klik klapt de kleuren uit) en verwijderen. */
function CatRow({ label, color, onLabel, onColor, onRemove }: { label: string; color: string; onLabel: (v: string) => void; onColor: (v: string) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="catrow">
    <div className="row"><button type="button" className="sw cur" style={{ ['--c' as any]: color }} aria-expanded={open} aria-controls={id} aria-label={`Kleur van ${label || 'categorie'} kiezen`} title="Kleur kiezen" onClick={() => setOpen(o => !o)} />
      <DebText className="inp" value={label} aria-label="Naam categorie" style={{ flex: 1 }} onCommit={onLabel} />
      <ConfirmBtn className="iconbtn danger" label={<Trash2 />} title="Verwijderen" ariaLabel={`${label || 'Categorie'} verwijderen`} confirm="Zeker?" onConfirm={onRemove} /></div>
    {open && <div className="swatches" id={id} role="group" aria-label="Kleur">{SWATCHES.map(sw => <button key={sw} type="button" className="sw" style={{ ['--c' as any]: sw }} aria-pressed={sw === color} aria-label={SWATCH_NAMES[sw] || sw} onClick={() => { onColor(sw); setOpen(false); }} />)}</div>}
  </div>;
}

/** Lijst met namen. `onChange` krijgt een functie die de nieuwste lijst aanpast (niet de lijst van deze weergave). */
function NameList({ items, placeholder, label, onChange, dedupe }: { items: string[]; placeholder: string; label: string; onChange: (fn: (cur: string[]) => string[]) => void; dedupe?: boolean }) {
  return <>
    {/* plek bestaat niet meer (intussen verwijderd): niets doen */}
    <ul className="setlist">{items.map((n, i) => <li key={i}><DebText className="inp" value={n} aria-label={label} onCommit={v => onChange(cur => i < cur.length ? cur.map((x, j) => j === i ? v : x) : cur)} /><ConfirmBtn className="iconbtn danger" label={<Trash2 />} title="Verwijderen" ariaLabel={`${n || label} verwijderen`} confirm="Zeker?" onConfirm={() => onChange(cur => cur[i] === n ? cur.filter((_, j) => j !== i) : cur.filter(x => x !== n))} /></li>)}</ul>
    <AddRow placeholder={placeholder} label={'Nieuwe ' + label.toLowerCase()} onAdd={v => { if (dedupe && items.includes(v)) { toast(v + ' staat er al in.'); return; } onChange(cur => [...cur, v]); }} />
  </>;
}
/** Eén regel om iets toe te voegen. `label`: naam van het veld (de voorbeeldtekst is alleen een voorbeeld). */
function AddRow({ placeholder, label = placeholder, onAdd }: { placeholder: string; label?: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(''); };
  return <div className="row"><input className="inp" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} aria-label={label} style={{ flex: 1 }} /><button className="btn" onClick={add}>Toevoegen</button></div>;
}

/* ---------- Back-up terugzetten (ook uit de losse versie) ---------- */
/**
 * Terugzetten vult alleen aan: wat er al is (zelfde id) blijft zoals het nu is, ook als het in de back-up anders staat,
 * en een vaste opkomstdag die al een eigen rij heeft ook. Een ingeplande opkomst waarvan de datum zo niet terugkomt,
 * komt bij de concepten (anders stond hij nergens).
 */
function Restore() {
  const { saveSettings, saveLib, saveOpk, savePlan, can, latest } = useSpeltak();
  const ref = useRef<HTMLInputElement>(null);
  const restore = (f: File | undefined) => {
    if (!f) return; const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(String(rd.result));
        if (!(d && d.version === 4 && Array.isArray(d.opks) && Array.isArray(d.plans))) { toast('Dit is geen back-up van de Opkomstplanner.'); return; }
        // de nieuwste stand van de speltak (het bestand lezen duurt even)
        const L = latest(), settings = L.settings;
        const s = normSettings(d.settings || {}), fresh = !L.opks.length && !L.plans.length;
        saveSettings(cur => {
          const merged: Partial<Settings> = {
            categories: [...cur.categories, ...s.categories.filter(c => !cur.categories.some(x => x.id === c.id))],
            leaders: [...new Set([...cur.leaders, ...s.leaders])], locations: [...new Set([...cur.locations, ...s.locations])],
          };
          if (fresh) Object.assign(merged, { defStart: s.defStart, defEnd: s.defEnd, opkDay: s.opkDay, prepMin: s.prepMin, postMin: s.postMin, seasonStartMonth: s.seasonStartMonth, seasonEndMonth: s.seasonEndMonth, letterDays: s.letterDays, letterNotice: s.letterNotice, fixedOn: s.fixedOn, fixedOpen: s.fixedOpen, fixedRanja: s.fixedRanja, fixedClose: s.fixedClose });
          if (fresh && s.logo) Object.assign(merged, { logo: s.logo, logoW: s.logoW, logoH: s.logoH });
          return merged;
        });
        let added = 0, present = 0, taken = 0, drafts = 0;
        // de activiteitenbank alleen met het recht Banken (zo staat het ook in de regels)
        const libs: any[] = Array.isArray(d.lib) ? d.lib : [], skipLib = libs.length > 0 && !can('bank');
        const haveL = new Set(L.lib.map(l => l.id)), haveO = new Set(L.opks.map(o => o.id)), haveP = new Set(L.plans.map(p => p.id));
        if (!skipLib) libs.forEach((x: any) => { const l = normLib(x); if (haveL.has(l.id)) { present++; return; } haveL.add(l.id); saveLib(l); added++; });
        // planning: eerst bepalen welke rijen er echt bij komen
        const slots = new Set(L.plans.map(p => p.slot).filter(Boolean)), rows: Plan[] = [];
        d.plans.forEach((x: any) => {
          const p = normPlan(x);
          if (haveP.has(p.id)) { present++; return; }
          if (p.slot && slots.has(p.slot)) { taken++; return; }
          haveP.add(p.id); if (p.slot) slots.add(p.slot); rows.push(p);
        });
        // opkomsten: een ingeplande opkomst hoort bij een rij; is die er niet (overgeslagen of nooit), dan wordt het een concept
        const linked = new Set([...L.plans, ...rows].map(p => p.opkId).filter(Boolean));
        const newOpks = new Map<string, Opk>();
        // de opkomstenbank ook alleen met het recht Banken (zo staat het ook in de regels)
        let skipBank = false;
        d.opks.forEach((x: any) => {
          const o = normOpk(x, settings);
          if (haveO.has(o.id)) { present++; return; }
          if (o.state === 'bank' && !can('bank')) { skipBank = true; return; }
          haveO.add(o.id);
          if (o.state === 'planned' && !linked.has(o.id)) { o.state = 'draft'; drafts++; }
          newOpks.set(o.id, o); saveOpk(o); added++;
        });
        // een nieuwe rij wijst alleen naar een opkomst die ingepland is en nog bij geen andere rij hoort
        rows.forEach(p => {
          if (p.opkId) {
            const o = newOpks.get(p.opkId) || L.opks.find(x => x.id === p.opkId);
            if (!o || o.state !== 'planned' || L.plans.some(q => q.opkId === p.opkId)) p.opkId = null;
          }
          savePlan(p); added++;
        });
        const parts = [`${added} nieuw`, ...(present ? [`${present} al aanwezig (overgeslagen)`] : []), ...(taken ? [`${plural(taken, 'datum', 'data')} al bezet (overgeslagen)`] : [])];
        toast(`Back-up teruggezet: ${parts.join(', ')}.` + (drafts ? ` ${plural(drafts, 'opkomst', 'opkomsten')} zonder datum bij de concepten gezet.` : '')
          + (skipLib || skipBank ? ` ${skipLib && skipBank ? 'Activiteiten en opkomsten uit de bank' : skipLib ? 'Activiteiten' : 'Opkomsten uit de bank'} overgeslagen: daarvoor heb je het recht Banken nodig.` : ''),
          undefined, present || taken || drafts || skipLib || skipBank ? 9000 : undefined);
      } catch { toast('Dit bestand kan niet worden gelezen.'); }
    };
    rd.readAsText(f);
  };
  return <><button className="btn" onClick={() => ref.current?.click()}>Back-up terugzetten</button><input ref={ref} type="file" accept=".json,application/json" hidden onChange={e => { restore(e.target.files?.[0]); e.target.value = ''; }} /></>;
}

function Leave() {
  const { removeMember, sid, sp, myName } = useSpeltak(); const { user } = useAuth(); const nav = useNavigate();
  const leave = async () => {
    const uidX = user!.uid, gid = sp?.gid, name = myName;
    try { await removeMember(uidX); } catch { toast('Verlaten mislukt.'); return; }
    // je naam in de groep komt vrij als je nergens anders in de groep meer zit (op de achtergrond; niet erg als het niet lukt)
    if (gid && name) releaseOwnName(gid, uidX, name, sid).catch(() => {});
    lastSpeltak.clearIf(sid);
    nav('/speltakken');
  };
  return <div className="dangerzone"><b>Speltak verlaten</b><span className="hint">Je wordt uit het team gehaald; een teamleider kan je opnieuw uitnodigen.</span>
    <div className="row"><ConfirmBtn className="btn sm danger" label="Speltak verlaten" confirm="Klik nogmaals: verlaten" onConfirm={leave} /></div></div>;
}

/* ---------- Team: leden, rechten en uitnodigingen ---------- */
function Team() {
  const { sp, isTL, isAdmin, setMember, removeMember, createInvite, myName, practice } = useSpeltak();
  const { user } = useAuth();
  const manage = isTL || isAdmin;
  const [email, setEmail] = useState(''); const [kind, setKind] = useState<'leiding' | 'teamleider' | 'transfer'>('leiding'); const [perms, setPerms] = useState<Perms>(DEFAULT_LEIDING_PERMS);
  const [inv, setInv] = useState<Invite | null>(null); const [busy, setBusy] = useState(false);
  // Teamleider: per speltak (ook oude uitnodigingen van vóór de groep). Beheerder van de groep: met gid erbij, anders weigert Firestore de lijst.
  const open = useOpenInvites(manage && sp && !practice ? [!isTL && sp.gid ? { gid: sp.gid, sid: sp.id } : { sid: sp.id }] : []);
  const roles = useRoles();
  // Wie kwam binnen via mijn "Mijn rol overdragen"? Bij die persoon staat dan de knop om de rol over te dragen.
  const [heirs, setHeirs] = useState<string[]>([]);
  const teamKey = sp ? sp.memberIds.join(',') : '';
  useEffect(() => {
    setHeirs([]);
    if (!sp || !isTL || practice || !user) return;
    let alive = true;
    transferJoiners(sp.id, user.uid).then(u => { if (alive) setHeirs(u); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.id, isTL, practice, user?.uid, teamKey]);
  if (!sp) return null;
  // Beheerder van de groep aanzetten bij een bestaand lid (alleen voor beheerders, en alleen als de speltak in een groep zit)
  const grp = isAdmin && sp.gid ? roles.groups.find(x => x.id === sp.gid) || null : null;
  const toggleAdmin = (u: string, m: Member, on: boolean) => {
    if (!grp) return;
    (on ? setGroupAdmin(grp.id, u, { name: m.name, email: m.email, since: Date.now() }) : removeGroupAdmin(grp, u))
      .then(() => toast(on ? `${m.name} is nu beheerder van ${grp.name}` : `${m.name} is geen beheerder meer`))
      .catch(e => toast(e?.message === 'last' ? 'Er moet minstens één beheerder overblijven.' : 'Aanpassen mislukt.'));
  };
  const tl = (u: string) => isTeamleider(sp, u);
  const members = Object.entries(sp.members).sort((a, b) => Number(tl(b[0])) - Number(tl(a[0])) || a[1].name.localeCompare(b[1].name, 'nl'));
  const tlCount = members.filter(([u]) => tl(u)).length;
  // Nog geen teamleider: de beheerder nodigt dan eerst de teamleider uit (zoals in Beheer). Afgeleid, want het team kan nog binnenkomen.
  const needTl = isAdmin && tlCount === 0;
  const eff = needTl ? 'teamleider' : kind;
  const fail = (e: any) => toast(e?.message === 'last' ? 'Er moet minstens één teamleider blijven.' : 'Aanpassen mislukt.');
  const invite = async () => {
    const em = email.trim().toLowerCase();
    if (!isEmail(em)) { toast('Vul een geldig e-mailadres in.'); return; }
    if (members.some(([, m]) => m.email === em)) { toast('Dit e-mailadres zit al in het team.'); return; }
    setBusy(true);
    try {
      if (eff === 'teamleider') await ensureTlIds(sp).catch(() => {});
      // Rol overdragen: de ander komt binnen als leiding met alle rechten; daarna draag je zelf je rol over (knop bij die persoon).
      const k = eff === 'teamleider' ? 'teamleider' : 'leiding', p = eff === 'leiding' ? perms : ALL_PERMS, transfer = eff === 'transfer';
      // Staat er al een geldige uitnodiging met dezelfde rol en rechten voor dit adres? Dan die link, geen tweede.
      const r = await inviteOnce({ kind: k, email: em, gid: sp.gid, sid: sp.id, perms: p, transfer }, user!.uid, open, () => createInvite(em, k, p, transfer));
      setInv(r.inv); setEmail('');
      if (r.reused) toast(`Er stond al een uitnodiging voor ${em}. Dit is dezelfde link.`);
    } catch { toast('Uitnodiging maken mislukt.'); }
    setBusy(false);
  };
  return <section className="card pad stack teamcard">
    <div className="row between"><h2>Team</h2><span className="hint">{plural(members.length, 'lid', 'leden')} · {sp.name}</span></div>
    <div className="team">
      {members.map(([uidX, m]) => <MemberRow key={uidX} m={m} isTl={tl(uidX)} me={uidX === user?.uid} iAmTL={isTL} isAdmin={isAdmin} lastTL={tl(uidX) && tlCount < 2}
        heir={isTL && !tl(uidX) && uidX !== user?.uid && heirs.includes(uidX)}
        onTeamleider={on => setTeamleider(sp, uidX, on).catch(fail)}
        onTransfer={() => transferTeamleider(sp, user!.uid, uidX).then(() => toast(`${m.name} is nu teamleider`)).catch(fail)}
        onStepDown={() => stepDownTeamleider(sp, uidX).then(() => toast('Je bent nu leiding')).catch(fail)}
        onPerm={(k, v) => setMember(uidX, { perms: { ...m.perms, [k]: v } }).catch(fail)}
        groupAdmin={grp ? grp.adminIds.includes(uidX) : null} groupName={grp?.name || ''} noGroup={isAdmin && !sp.gid}
        onGroupAdmin={on => toggleAdmin(uidX, m, on)}
        onRemove={() => removeMember(uidX).then(() => toast(`${m.name} uit het team gehaald`)).catch(fail)} />)}
      {!members.length && <p className="hint">Nog niemand in het team. Nodig hieronder de teamleider uit.</p>}
    </div>
    {manage && practice && <p className="hint">In de oefenomgeving kun je niemand uitnodigen. In je echte speltak maak je hier een uitnodigingslink voor nieuwe leiding.</p>}
    {manage && !practice && <div className="invite stack">
      <h3><UserPlus size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Uitnodigen</h3>
      <div className="row"><input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); invite(); } }} placeholder={needTl ? 'e-mailadres teamleider' : 'e-mailadres'} aria-label="E-mailadres" style={{ flex: '1 1 220px' }} />
        {!needTl && <div className="seg" role="group" aria-label="Uitnodigen als"><Chip on={kind === 'leiding'} onClick={() => setKind('leiding')}>Leiding</Chip>
          {isAdmin && <Chip on={kind === 'teamleider'} onClick={() => setKind('teamleider')}>Teamleider</Chip>}
          {isTL && <Chip on={kind === 'transfer'} onClick={() => setKind('transfer')}>Mijn rol overdragen</Chip>}</div>}</div>
      {needTl && <p className="hint">Er is nog geen teamleider: wie je nu uitnodigt, wordt teamleider.</p>}
      {eff === 'leiding' && <PermGrid perms={perms} onChange={(k, v) => setPerms({ ...perms, [k]: v })} />}
      {eff === 'transfer' && <p className="hint">De ander komt eerst in het team als leiding met alle rechten. Daarna staat bij die persoon de knop Rol overdragen: hij wordt teamleider, jij blijft leiding. Zit je opvolger al in het team? Draag dan direct over via Rechten bij die persoon.</p>}
      <div className="row"><button className="btn primary" disabled={busy} onClick={invite}><Link2 size={16} />Uitnodigingslink maken</button></div>
      {inv && <InviteLink key={inv.id} inv={inv} fromName={myName} onClose={() => setInv(null)} />}
      <h3>Openstaande uitnodigingen</h3>
      <InviteList invites={open} showWhere={false} renew={{
        // een teamleider vernieuwt leiding (een overdracht alleen als hij van hem is); een teamleider-uitnodiging alleen de beheerder
        can: i => i.kind === 'leiding' ? (!i.transfer || i.invitedBy === user?.uid) : i.kind === 'teamleider' && isAdmin,
        run: i => renewInvite(i, { uid: user!.uid, name: myName || user?.email || '', email: user?.email || '' }, { gid: sp.gid, groupName: sp.groupName, speltakName: sp.name }),
        onDone: setInv }} />
    </div>}
  </section>;
}

function MemberRow({ m, isTl, me, iAmTL, isAdmin, lastTL, heir, groupAdmin, groupName, noGroup, onGroupAdmin, onTeamleider, onTransfer, onStepDown, onPerm, onRemove }: {
  m: Member; isTl: boolean; me: boolean; iAmTL: boolean; isAdmin: boolean; lastTL: boolean;
  /** Kwam binnen via jouw "Mijn rol overdragen": knop direct in beeld. */
  heir: boolean;
  groupAdmin: boolean | null; groupName: string; noGroup: boolean; onGroupAdmin: (on: boolean) => void;
  onTeamleider: (on: boolean) => void; onTransfer: () => void; onStepDown: () => void; onPerm: (k: PermKey, v: boolean) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const manage = iAmTL || isAdmin;
  const initials = (m.name || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const summary = isTl ? 'alle rechten' : (Object.keys(PERM_LABELS) as PermKey[]).filter(k => m.perms?.[k]).map(k => PERM_LABELS[k]).join(', ') || 'alleen bekijken';
  // Teamleiders verwijderen mag alleen de beheerder; een teamleider haalt alleen leiding weg.
  const canRemove = !me && !lastTL && (isAdmin || (iAmTL && !isTl));
  return <div className="member">
    <div className="row between" style={{ flexWrap: 'nowrap' }}>
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}><span className="avatar">{initials}</span><div style={{ minWidth: 0 }}><b>{m.name}{me ? ' (jij)' : ''}</b><div className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}{m.email ? ' · ' : ''}{isTl ? 'Teamleider' : 'Leiding'}{groupAdmin ? ' · beheerder' : ''} · {summary}</div></div></div>
      {manage && <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <button className="btn sm ghost" aria-expanded={open} aria-label={`Rechten van ${m.name}${open ? ' sluiten' : ''}`} onClick={() => setOpen(o => !o)}>{open ? 'Sluiten' : 'Rechten'}</button>
        {canRemove && <ConfirmBtn className="iconbtn danger" label={<Trash2 size={15} />} confirm="Zeker?" title="Uit het team halen" ariaLabel={`${m.name} uit het team halen`} onConfirm={onRemove} />}
      </div>}
    </div>
    {heir && <div className="heir"><span className="hint">{m.name} kwam binnen via jouw overdracht.</span>
      <ConfirmBtn className="btn sm primary" label={`Rol overdragen aan ${m.name}`} confirm="Klik nogmaals: overdragen (jij wordt leiding)" onConfirm={onTransfer} /></div>}
    {open && manage && <div className="stack" style={{ gap: 10, paddingTop: 10 }}>
      {groupAdmin !== null && <label className="toggle"><input type="checkbox" checked={groupAdmin} onChange={e => onGroupAdmin(e.target.checked)} /><span><b>Beheerder van {groupName}</b><br /><span className="hint">Ziet alle speltakken van de groep, stelt teamleiders aan en nodigt ze uit.</span></span></label>}
      {noGroup && <p className="hint">Deze speltak hangt nog niet onder een groep. Koppel hem eerst op de Beheer-pagina; daarna kun je hier beheerders aanzetten.</p>}
      {isAdmin && <div className="seg" role="group" aria-label="Rol"><Chip on={!isTl} disabled={lastTL} title={lastTL ? 'Er moet minstens één teamleider blijven' : undefined} onClick={() => onTeamleider(false)}>Leiding</Chip><Chip on={isTl} onClick={() => onTeamleider(true)}>Teamleider</Chip></div>}
      {!isAdmin && iAmTL && !isTl && <div className="row"><ConfirmBtn className="btn sm" label="Teamleiderschap aan deze persoon overdragen" confirm="Klik nogmaals: overdragen (jij wordt leiding)" onConfirm={onTransfer} /></div>}
      {iAmTL && me && isTl && <div className="row">{lastTL ? <span className="hint">Je bent de enige teamleider. Draag je rol eerst over aan iemand anders.</span> : <ConfirmBtn className="btn sm" label="Aftreden als teamleider" confirm="Klik nogmaals: aftreden (je blijft leiding)" onConfirm={onStepDown} />}</div>}
      {!isTl ? <PermGrid perms={m.perms} onChange={onPerm} /> : <p className="hint">Een teamleider mag alles, ook het team beheren en leiding uitnodigen. Een extra teamleider aanstellen doet de beheerder van de groep.</p>}
    </div>}
  </div>;
}

function PermGrid({ perms, onChange }: { perms: Perms; onChange: (k: PermKey, v: boolean) => void }) {
  return <div className="perm-grid">{(Object.keys(PERM_LABELS) as PermKey[]).map(k => <label key={k} className="toggle"><input type="checkbox" checked={!!perms[k]} onChange={e => onChange(k, e.target.checked)} /><span><b>{PERM_LABELS[k]}</b><br /><span className="hint">{PERM_HELP[k]}</span></span></label>)}</div>;
}
