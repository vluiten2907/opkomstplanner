import { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../store/auth';

/**
 * Melding voor wie zijn e-mailadres nog niet heeft bevestigd. Zonder bevestiging kun je geen
 * uitnodiging accepteren en is je account niet vindbaar voor beheer (firestore.rules).
 * `box`: grote versie voor de uitnodigingspagina; anders een balk boven de pagina.
 */
export default function VerifyNote({ box, onVerified }: { box?: boolean; onVerified?: () => void }) {
  const { user, verified, sendVerify, refresh } = useAuth();
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const done = useRef(onVerified); done.current = onVerified;
  // Teruggekomen via de link in de mail (vaak in een ander tabblad): verversen bij openen en bij terugkeren naar dit tabblad.
  useEffect(() => {
    if (!user || verified) return;
    let busy = false;
    const look = () => { if (busy || document.visibilityState === 'hidden') return; busy = true; refresh().then(ok => { if (ok) done.current?.(); }).catch(() => {}).finally(() => { busy = false; }); };
    look();
    window.addEventListener('focus', look); document.addEventListener('visibilitychange', look);
    return () => { window.removeEventListener('focus', look); document.removeEventListener('visibilitychange', look); };
  }, [user?.uid, verified]); // eslint-disable-line
  if (!user || verified) return null;
  const check = async () => {
    setBusy(true); setMsg('');
    try { if (await refresh()) done.current?.(); else setMsg('Nog niet bevestigd. Klik op de link in de mail (kijk ook bij spam) en probeer het daarna opnieuw.'); }
    catch { setMsg('Controleren lukt niet. Probeer het straks opnieuw.'); }
    setBusy(false);
  };
  const again = async () => {
    setBusy(true); setMsg('');
    try { await sendVerify(); setMsg(`Nieuwe mail gestuurd naar ${user.email}.`); }
    catch (e: any) { setMsg(e?.code?.includes('too-many-requests') ? 'Te veel mails achter elkaar. Probeer het over een paar minuten opnieuw.' : 'Versturen lukt niet. Probeer het straks opnieuw.'); }
    setBusy(false);
  };
  const buttons = <div className="row"><button className="btn sm primary" disabled={busy} onClick={check}>Ik heb bevestigd</button><button className="btn sm" disabled={busy} onClick={again}>Mail opnieuw sturen</button></div>;
  if (box) return <div className="stack verifynote">
    <h3 style={{ margin: 0 }}><MailCheck size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Bevestig je e-mailadres</h3>
    <p className="hint" style={{ margin: 0 }}>We hebben een mail gestuurd naar <b>{user.email}</b>. Klik op de link in die mail en kom daarna hier terug. Zo weten we zeker dat het adres van jou is.</p>
    {buttons}
    {msg && <p className="hint" style={{ margin: 0, fontWeight: 700 }}>{msg}</p>}
  </div>;
  return <div className="banknote verifynote"><span><MailCheck size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Bevestig je e-mailadres ({user.email}) via de link in de mail. Daarna kan beheer je vinden en toevoegen.{msg && <><br /><b>{msg}</b></>}</span>{buttons}</div>;
}
