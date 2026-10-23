import { useMemo, useState } from 'react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { Field } from './ui';
import { uid } from '../lib/time';
import { SWATCHES } from '../lib/model';

/** Categorie kiezen; met het recht Instellingen ook een nieuwe categorie toevoegen. Gebruikt in de bouwer en de activiteitenbank. */
export function CatSelect({ value, onChange, prefix, disabled }: { value: string; onChange: (id: string) => void; prefix: string; disabled?: boolean }) {
  const { settings, saveSettings, can } = useSpeltak();
  const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState('');
  const add = () => {
    const v = name.trim(); if (!v) return;
    const c = { id: uid(), label: v, color: SWATCHES[settings.categories.length % SWATCHES.length] };
    saveSettings(cur => ({ categories: [...cur.categories, c] })); onChange(c.id); setNewOpen(false); setName(''); toast('Categorie toegevoegd');
  };
  return <Field label="Categorie" htmlFor={prefix + '-cat'}>
    <select id={prefix + '-cat'} value={newOpen && !disabled ? '__new' : value} disabled={disabled} onChange={ev => { if (ev.target.value === '__new') { setNewOpen(true); return; } setNewOpen(false); onChange(ev.target.value); }}>
      {settings.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      {(!value || !settings.categories.some(c => c.id === value)) && <option value={value}>Zonder categorie</option>}
      {can('settings') && !disabled && <option value="__new">+ Nieuwe categorie…</option>}
    </select>
    {newOpen && !disabled && <div className="newcat"><input className="inp" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Naam nieuwe categorie" autoFocus /><button className="btn sm" onClick={add}>Toevoegen</button></div>}
  </Field>;
}

/** Locatie typen, met suggesties uit de instellingen en de activiteitenbank. */
export function LocInput({ id, value, onChange, placeholder, readOnly }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  const { settings, lib } = useSpeltak();
  const locs = useMemo(() => { const s = new Set(settings.locations); lib.forEach(l => l.location && s.add(l.location)); return [...s]; }, [settings.locations, lib]);
  if (readOnly) return <input id={id} value={value} readOnly placeholder={placeholder} />;
  return <><input id={id} value={value} list={id + '-list'} onChange={e => onChange(e.target.value)} placeholder={placeholder} /><datalist id={id + '-list'}>{locs.map(l => <option key={l} value={l} />)}</datalist></>;
}

/**
 * Getal typen (bijv. minimaal aantal leiding). Tijdens het typen mag het veld even leeg zijn;
 * pas bij wegklikken of Enter wordt het binnen min–max gezet. Bij focus is alles geselecteerd.
 */
export function NumInput({ id, value, min, max, readOnly, onChange }: { id: string; value: number; min: number; max: number; readOnly?: boolean; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null); // null: niet aan het typen, toon de waarde
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const done = () => { if (txt === null) return; const n = parseInt(txt, 10); setTxt(null); if (!isNaN(n) && clamp(n) !== value) onChange(clamp(n)); };
  return <input id={id} type="number" inputMode="numeric" min={min} max={max} readOnly={readOnly} value={txt ?? String(value)}
    onFocus={e => { if (!readOnly) e.currentTarget.select(); }}
    onChange={e => { if (readOnly) return; const t = e.target.value; setTxt(t); const n = parseInt(t, 10); if (!isNaN(n) && clamp(n) !== value) onChange(clamp(n)); }}
    onBlur={done} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); done(); } }} />;
}
