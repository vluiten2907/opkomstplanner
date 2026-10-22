import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import VerifyNote from '../components/VerifyNote';
import { useAuth } from '../store/auth';
import { useRoles } from '../store/roles';
import { saveProfile } from '../store/beheer';
import { toast } from '../store/toast';
import { Field } from '../components/ui';
import PageHead from '../components/PageHead';

/** Mijn account: gebruikersnaam en e-mailadres bekijken, voor- en achternaam invullen. */
export default function AccountPage() {
  const { user } = useAuth();
  const { profile } = useRoles();
  const nav = useNavigate();
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) { setFirst(profile.firstName); setLast(profile.lastName); } }, [profile]);
  const back = () => { const sid = localStorage.getItem('opk.sid'); nav(sid ? `/s/${sid}` : '/'); };
  const save = async () => {
    if (!first.trim() || !last.trim()) { toast('Vul je voor- en achternaam in.'); return; }
    setBusy(true);
    try { await saveProfile(user!.uid, user!.email || '', first, last); toast('Opgeslagen'); } catch { toast('Opslaan mislukt.'); }
    setBusy(false);
  };
  return <div className="auth-wrap" style={{ alignItems: 'start' }}>
    <div className="stack" style={{ width: 'min(640px, 100%)', gap: 18 }}>
      <PageHead title="Opkomstplanner · Mijn account"><button className="btn ghost sm" onClick={back}><ArrowLeft size={14} />Terug</button></PageHead>
      <h1 className="display text-5xl md:text-7xl font-black tracking-tighter">Mijn account</h1>
      <VerifyNote />
      <section className="card pad stack">
        <Field label="Gebruikersnaam" hint="Zo kent de leiding je, bijvoorbeeld Akela. Uniek binnen je Scouting-groep."><input value={user?.displayName || ''} readOnly aria-readonly="true" /></Field>
        <Field label="E-mailadres"><input type="email" value={user?.email || ''} readOnly aria-readonly="true" /></Field>
        <div className="two">
          <Field label="Voornaam" htmlFor="ac-first"><input id="ac-first" value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" /></Field>
          <Field label="Achternaam" htmlFor="ac-last"><input id="ac-last" value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" /></Field>
        </div>
        <p className="hint">Je voor- en achternaam zien alleen de beheerders van je groep.</p>
        <div className="row"><button className="btn primary" disabled={busy} onClick={save}><Save size={16} />Opslaan</button><Link className="btn ghost" to="/wachtwoord">Wachtwoord wijzigen</Link></div>
      </section>
    </div>
  </div>;
}
