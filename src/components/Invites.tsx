import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, Copy, Mail, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { inviteUrl, revokeInvite } from '../store/beheer';
import { toast } from '../store/toast';
import { ConfirmBtn } from './ui';
import { inviteExpired, KIND_LABELS, normInvite, type Invite } from '../lib/types';
import { fmtNL } from '../lib/time';

export type InviteScope = { all: true } | { gid: string } | { sid: string };

/** Openstaande (nog niet gebruikte) uitnodigingen, live bijgewerkt. */
export function useOpenInvites(scopes: InviteScope[]) {
  const key = JSON.stringify(scopes);
  const [byScope, setByScope] = useState<Record<string, Invite[]>>({});
  useEffect(() => {
    setByScope({});
    const c = collection(db, 'invites');
    const stops = scopes.map((sc, i) => {
      const q = 'all' in sc ? c : 'gid' in sc ? query(c, where('gid', '==', sc.gid)) : query(c, where('sid', '==', sc.sid));
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

const where_ = (i: Invite) => i.kind === 'totaal' ? 'hele planner' : i.kind === 'groep' ? i.groupName : [i.groupName, i.speltakName].filter(Boolean).join(' · ');

async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast('Link gekopieerd'); return true; }
  catch { toast('Kopiëren lukt niet; selecteer de link en kopieer hem zelf.'); return false; }
}

/** Lijst met openstaande uitnodigingen: link kopiëren of intrekken. */
export function InviteList({ invites, showWhere = true }: { invites: Invite[]; showWhere?: boolean }) {
  if (!invites.length) return <p className="hint">Geen openstaande uitnodigingen.</p>;
  return <div className="invlist">{invites.map(i => {
    const exp = inviteExpired(i);
    return <div key={i.id} className="invrow">
      <div style={{ minWidth: 0 }}>
        <b className="ell">{i.email}</b>
        <div className="hint ell">{KIND_LABELS[i.kind]}{showWhere ? ` · ${where_(i)}` : ''}{i.transfer ? ' · overdracht' : ''} · {exp ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>verlopen</span> : `geldig t/m ${fmtNL(new Date(i.expiresAt).toISOString().slice(0, 10))}`}</div>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        {!exp && <button className="btn sm ghost" onClick={() => copyText(inviteUrl(i.id))} title="Link kopiëren"><Copy size={14} />Link</button>}
        <ConfirmBtn className="btn sm ghost danger" label={<><X size={14} />Intrekken</>} confirm="Zeker?" onConfirm={() => revokeInvite(i.id).then(() => toast('Uitnodiging ingetrokken')).catch(() => toast('Intrekken mislukt.'))} />
      </div>
    </div>;
  })}</div>;
}

/** Net gemaakte uitnodiging: link tonen met kopiëren en mailen. */
export function InviteLink({ inv, fromName, onClose }: { inv: Invite; fromName: string; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(inv.id);
  const what = `${KIND_LABELS[inv.kind]} voor ${where_(inv)}`;
  const mailto = `mailto:${inv.email}?subject=${encodeURIComponent('Uitnodiging Opkomstplanner: ' + what)}&body=${encodeURIComponent(`Hoi,\n\n${fromName || 'Ik'} nodigt je uit voor de Opkomstplanner als ${what}.\n\nOpen deze link en maak een account aan met dit e-mailadres (${inv.email}):\n${url}\n\nDe link is ${30} dagen geldig.\n\nGroet,\n${fromName}`)}`;
  return <div className="banknote"><span>Uitnodiging als <b>{KIND_LABELS[inv.kind]}</b> voor <b>{inv.email}</b>. Stuur deze link door; hij werkt alleen voor dat e-mailadres en is 30 dagen geldig.</span>
    <code className="mono-code">{url}</code>
    <div className="row"><button className="btn sm" onClick={async () => setCopied(await copyText(url))}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Gekopieerd' : 'Kopiëren'}</button><a className="btn sm" href={mailto}><Mail size={14} />Mailen</a>{onClose && <button className="btn sm ghost" onClick={onClose}>Sluiten</button>}</div></div>;
}
