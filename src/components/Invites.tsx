import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, Copy, Mail, RotateCw, Send, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../store/auth';
import { inviteUrl, revokeInvite, sendInviteMail } from '../store/beheer';
import { toast } from '../store/toast';
import { ConfirmBtn } from './ui';
import { inviteExpired, inviteWhere, INVITE_DAYS, KIND_LABELS, normInvite, type Invite } from '../lib/types';
import { fmtNL, toISO } from '../lib/time';

/** Welke uitnodigingen: alle (Beheer totaal), van een groep, van een speltak (teamleider), of van een speltak binnen een groep
 *  (beheerder van de groep: firestore.rules laat de lijst alleen toe als gid in de zoekvraag staat). */
export type InviteScope = { all: true } | { gid: string; sid?: string } | { sid: string };

/** Openstaande (nog niet gebruikte) uitnodigingen, live bijgewerkt. */
export function useOpenInvites(scopes: InviteScope[]) {
  const key = JSON.stringify(scopes);
  const [byScope, setByScope] = useState<Record<string, Invite[]>>({});
  useEffect(() => {
    setByScope({});
    const c = collection(db, 'invites');
    const stops = scopes.map((sc, i) => {
      const q = 'all' in sc ? c
        : 'gid' in sc ? (sc.sid ? query(c, where('gid', '==', sc.gid), where('sid', '==', sc.sid)) : query(c, where('gid', '==', sc.gid)))
        : query(c, where('sid', '==', sc.sid));
      return onSnapshot(q, s => setByScope(m => ({ ...m, [i]: s.docs.map(d => normInvite(d.id, d.data())).filter(x => !x.usedBy) })), () => setByScope(m => ({ ...m, [i]: [] })));
    });
    return () => stops.forEach(f => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => {
    const map = new Map<string, Invite>();
    Object.values(byScope).flat().forEach(i => map.set(i.id, i));
    return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [byScope]);
}

const where_ = (i: Invite) => inviteWhere(i, 'hele planner');
/** Laatste dag dat de link werkt (dd-mm-jjjj). */
const validUntil = (i: Invite) => fmtNL(toISO(new Date(i.expiresAt)));

async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast('Link gekopieerd'); return true; }
  catch { toast('Kopiëren lukt niet; selecteer de link en kopieer hem zelf.'); return false; }
}

/** Verlopen uitnodiging vernieuwen: `can` (mag de kijker dit soort uitnodiging maken?), `run` maakt de nieuwe, `onDone` toont hem. */
export type Renew = { can: (i: Invite) => boolean; run: (i: Invite) => Promise<Invite>; onDone: (i: Invite) => void };

/** Lijst met openstaande uitnodigingen: link kopiëren of intrekken; een verlopen uitnodiging vernieuwen. */
export function InviteList({ invites, showWhere = true, renew }: { invites: Invite[]; showWhere?: boolean; renew?: Renew }) {
  const [busy, setBusy] = useState('');
  if (!invites.length) return <p className="hint">Geen openstaande uitnodigingen.</p>;
  const again = async (i: Invite) => {
    if (!renew) return;
    setBusy(i.id);
    try { renew.onDone(await renew.run(i)); toast(`Uitnodiging vernieuwd: nieuwe link, ${INVITE_DAYS} dagen geldig`); }
    catch (e: any) { toast(e?.code === 'permission-denied' ? 'Vernieuwen mag je niet. Vraag de beheerder om een nieuwe uitnodiging.' : 'Vernieuwen mislukt. Probeer het opnieuw.'); }
    setBusy('');
  };
  return <div className="invlist">{invites.map(i => {
    const exp = inviteExpired(i);
    return <div key={i.id} className="invrow">
      <div style={{ minWidth: 0 }}>
        <b className="ell">{i.email}</b>
        <div className="hint invmeta">{KIND_LABELS[i.kind]}{showWhere ? ` · ${where_(i)}` : ''}{i.transfer ? ' · overdracht' : ''} · <span className="invexp">{exp ? <span className="err">verlopen</span> : `geldig t/m ${validUntil(i)}`}</span></div>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        {!exp && <button className="btn sm ghost" onClick={() => copyText(inviteUrl(i.id))} title="Link kopiëren"><Copy size={14} />Link</button>}
        {exp && renew?.can(i) && <button className="btn sm" disabled={busy === i.id} onClick={() => again(i)} title="Nieuwe link maken"><RotateCw size={14} />Vernieuwen</button>}
        <ConfirmBtn className="btn sm ghost danger" label={<><X size={14} />Intrekken</>} confirm="Zeker?" onConfirm={() => revokeInvite(i.id).then(() => toast('Uitnodiging ingetrokken')).catch(() => toast('Intrekken mislukt.'))} />
      </div>
    </div>;
  })}</div>;
}

/** Net gemaakte (of hergebruikte) uitnodiging: link tonen met kopiëren en mailen.
 *  Een hergebruikte uitnodiging kan van iemand anders zijn en al even lopen: afzender en geldigheid komen uit de uitnodiging zelf.
 *  Laten mailen door de server kan alleen wie de uitnodiging maakte (public/api/uitnodiging-mail.php). */
export function InviteLink({ inv, fromName, lead, onClose }: { inv: Invite; fromName: string; lead?: string; onClose?: () => void }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [mail, setMail] = useState<'' | 'bezig' | 'verstuurd' | 'uit'>('');
  const url = inviteUrl(inv.id);
  const what = `${KIND_LABELS[inv.kind]} voor ${where_(inv)}`;
  const mine = !!user && inv.invitedBy === user.uid, by = inv.invitedByName || fromName, until = validUntil(inv);
  const mailto = `mailto:${inv.email}?subject=${encodeURIComponent('Uitnodiging Opkomstplanner: ' + what)}&body=${encodeURIComponent(`Hoi,\n\n${by || 'Ik'} nodigt je uit voor de Opkomstplanner als ${what}.\n\nOpen deze link. Heb je al een account? Log dan in. Anders maak je er een aan met dit e-mailadres (${inv.email}):\n${url}\n\nDe link is geldig t/m ${until}.\n\nGroet,\n${fromName}`)}`;
  return <div className="banknote">{lead && <b>{lead}</b>}<span>Uitnodiging als <b>{KIND_LABELS[inv.kind]}</b>{inv.transfer ? ' (rol overdragen)' : ''} voor <b>{inv.email}</b>. {mine ? 'Verstuur de mail of stuur de link zelf door' : 'Stuur de link zelf door'}; hij werkt alleen voor dat e-mailadres en is geldig t/m {until}.</span>
    {!mine && <span className="hint">Gemaakt door {by || 'iemand anders'}. Kopieer de link of vraag {by || 'die persoon'} om hem te mailen.</span>}
    <code className="mono-code">{url}</code>
    <div className="row"><button className="btn sm" onClick={async () => setCopied(await copyText(url))}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Gekopieerd' : 'Kopiëren'}</button>{mine && mail !== 'uit' && <button className="btn sm primary" disabled={mail === 'bezig' || mail === 'verstuurd'} onClick={async () => {
      setMail('bezig');
      const r = await sendInviteMail(inv.id);
      if (r === 'ok') { setMail('verstuurd'); toast(`Uitnodiging gemaild naar ${inv.email}`); }
      else if (r === 'niet-ingesteld') { setMail('uit'); toast('Automatisch mailen staat nog uit; gebruik je eigen mail.'); }
      else { setMail(''); toast(r); }
    }}>{mail === 'verstuurd' ? <Check size={14} /> : <Send size={14} />}{mail === 'verstuurd' ? 'Gemaild' : mail === 'bezig' ? 'Versturen…' : 'Mail versturen'}</button>}<a className="btn sm" href={mailto}><Mail size={14} />Eigen mail</a>{onClose && <button className="btn sm ghost" onClick={onClose}>Sluiten</button>}</div></div>;
}
