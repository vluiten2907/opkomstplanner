import { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth, verifyMailSent } from '../store/auth';

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
  // Alleen zeggen dat er een mail is als die in deze sessie echt is verstuurd: oudere accounts kregen er nooit een.
  const sent = verifyMailSent(user.email);
  const check = async () => {
    setBusy(true); setMsg('');
    try { if (await refresh()) done.current?.(); else setMsg(sent ? 'Nog niet bevestigd. Klik op de link in de mail (kijk ook bij spam) en probeer het daarna opnieuw.' : 'Nog niet bevestigd. Tik eerst op Bevestigingsmail sturen en klik op de link in die mail.'); }
    catch { setMsg('Controleren lukt niet. Probeer het straks opnieuw.'); }
    setBusy(false);
  };
  const again = async () => {
    setBusy(true); setMsg('');
    try { await sendVerify(); setMsg(`Mail gestuurd naar ${user.email}. Klik op de link in die mail (kijk ook bij spam).`); }
    catch (e: any) { setMsg(e?.code?.includes('too-many-requests') ? 'Te veel mails achter elkaar. Probeer het over een paar minuten opnieuw.' : 'Versturen lukt niet. Probeer het straks opnieuw.'); }
    setBusy(false);
  };
  const checkBtn = <button className={'btn sm' + (sent ? ' primary' : '')} disabled={busy} onClick={check}>Ik heb bevestigd</button>;
  const sendBtn = <button className={'btn sm' + (sent ? '' : ' primary')} disabled={busy} onClick={again}>{sent ? 'Mail opnieuw sturen' : 'Bevestigingsmail sturen'}</button>;
  const buttons = <div className="row">{sent ? <>{checkBtn}{sendBtn}</> : <>{sendBtn}{checkBtn}</>}</div>;
  if (box) return <div className="stack verifynote">
    <h3 style={{ margin: 0 }}><MailCheck size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Bevestig je e-mailadres</h3>
    <p className="hint" style={{ margin: 0 }}>{sent
      ? <>We hebben een mail gestuurd naar <b>{user.email}</b>. Klik op de link in die mail en kom daarna hier terug.</>
      : <>Je e-mailadres <b>{user.email}</b> is nog niet bevestigd. Tik op Bevestigingsmail sturen, klik op de link in die mail en kom daarna hier terug.</>} Zo weten we zeker dat het adres van jou is.</p>
    {buttons}
    {msg && <p className="hint" style={{ margin: 0, fontWeight: 700 }}>{msg}</p>}
  </div>;
  return <div className="banknote verifynote"><span><MailCheck size={15} style={{ verticalAlign: -3, marginRight: 6 }} />{sent
    ? <>Bevestig je e-mailadres ({user.email}) via de link in de mail die we je stuurden.</>
    : <>Bevestig je e-mailadres ({user.email}): tik op Bevestigingsmail sturen en klik op de link in die mail.</>} Daarna kan beheer je vinden en toevoegen.{msg && <><br /><b>{msg}</b></>}</span>{buttons}</div>;
}
