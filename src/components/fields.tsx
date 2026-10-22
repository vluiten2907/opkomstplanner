import { useMemo, useState } from 'react';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';
import { Field } from './ui';
import { uid } from '../lib/time';
import { SWATCHES } from '../lib/model';

/** Categorie kiezen; met het recht Instellingen ook een nieuwe categorie toevoegen. Gebruikt in de bouwer en de activiteitenbank. */
export function CatSelect({ value, onChange, prefix }: { value: string; onChange: (id: string) => void; prefix: string }) {
  const { settings, saveSettings, can } = useSpeltak();
  const [newOpen, setNewOpen] = useState(false); const [name, setName] = useState('');
  const add = () => {
    const v = name.trim(); if (!v) return;
    const c = { id: uid(), label: v, color: SWATCHES[settings.categories.length % SWATCHES.length] };
    saveSettings(cur => ({ categories: [...cur.categories, c] })); onChange(c.id); setNewOpen(false); setName(''); toast('Categorie toegevoegd');
  };
  return <Field label="Categorie" htmlFor={prefix + '-cat'}>
    <select id={prefix + '-cat'} value={newOpen ? '__new' : value} onChange={ev => { if (ev.target.value === '__new') { setNewOpen(true); return; } setNewOpen(false); onChange(ev.target.value); }}>
      {settings.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      {(!value || !settings.categories.some(c => c.id === value)) && <option value={value}>Zonder categorie</option>}
      {can('settings') && <option value="__new">+ Nieuwe categorie…</option>}
    </select>
    {newOpen && <div className="newcat"><input className="inp" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Naam nieuwe categorie" autoFocus /><button className="btn sm" onClick={add}>Toevoegen</button></div>}
  </Field>;
}

/** Locatie typen, met suggesties uit de instellingen en de activiteitenbank. */
export function LocInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { settings, lib } = useSpeltak();
  const locs = useMemo(() => { const s = new Set(settings.locations); lib.forEach(l => l.location && s.add(l.location)); return [...s]; }, [settings.locations, lib]);
  return <><input id={id} value={value} list={id + '-list'} onChange={e => onChange(e.target.value)} placeholder={placeholder} /><datalist id={id + '-list'}>{locs.map(l => <option key={l} value={l} />)}</datalist></>;
}
