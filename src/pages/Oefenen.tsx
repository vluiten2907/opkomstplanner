import { useState } from 'react';
import type { User } from 'firebase/auth';
import { FixedAuth } from '../store/auth';
import { NoRoles } from '../store/roles';
import { SpeltakProvider } from '../store/speltak';
import { createLocalFs } from '../lib/localfs';
import { oefenData, OEFEN_NAME, OEFEN_SID, OEFEN_UID } from '../lib/oefendata';
import SpeltakPages from '../SpeltakPages';
import { toast } from '../store/toast';

/*
 * Oefenomgeving: een voorbeeldspeltak die helemaal in deze browser draait.
 * Er gaat niets naar Firebase; inloggen is niet nodig.
 */
const fs = createLocalFs('opk.oefen.v1');
if (fs.isEmpty()) fs.replaceAll(oefenData());

const USER = { uid: OEFEN_UID, email: 'jij@voorbeeld.nl', displayName: OEFEN_NAME } as unknown as User;

export default function Oefenen() {
  const [gen, setGen] = useState(0);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    // eerst de speltak sluiten, zodat wijzigingen die nog wachten niet over de verse data heen komen
    setBusy(true);
    setTimeout(() => { fs.replaceAll(oefenData()); setGen(g => g + 1); setBusy(false); toast('De voorbeelddata staat er weer'); }, 700);
  };
  if (busy) return <div className="loading">Voorbeelddata terugzetten…</div>;
  return <FixedAuth user={USER}><NoRoles>
    <SpeltakProvider key={gen} sid={OEFEN_SID} backend={fs as any} practice onReset={reset}><SpeltakPages /></SpeltakProvider>
  </NoRoles></FixedAuth>;
}
