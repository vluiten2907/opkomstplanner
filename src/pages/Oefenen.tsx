import { useState } from 'react';
import type { User } from 'firebase/auth';
import { FixedAuth } from '../store/auth';
import { NoRoles } from '../store/roles';
import { SpeltakProvider } from '../store/speltak';
import { createLocalFs } from '../lib/localfs';
import { oefenData, OEFEN_NAME, OEFEN_SID, OEFEN_UID } from '../lib/oefendata';
import SpeltakPages from '../SpeltakPages';
import { toast } from '../store/toast';
import { dayDiff, toISO, todayISO } from '../lib/time';

/*
 * Oefenomgeving: een voorbeeldspeltak die helemaal in deze browser draait.
 * Er gaat niets naar Firebase; inloggen is niet nodig.
 */
const fs = createLocalFs('opk.oefen.v1');
/** Na zoveel dagen liggen de datums van de voorbeelddata niet meer rond vandaag. */
const OLD_DAYS = 7;
/** Datum van de voorbeelddata (oudere opslag zonder bijhouding: aanmaakdatum van de speltak). */
const madeOn = () => { const m = fs.meta(); if (m) return m.made; const t = fs.peek('speltakken/' + OEFEN_SID)?.createdAt; return t ? toISO(new Date(t)) : ''; };
const isOld = () => { const d = madeOn(); return !!d && dayDiff(d, todayISO()) >= OLD_DAYS; };
// leeg, of oud en niets aan veranderd: stil verse voorbeelddata. Wel iets veranderd: niets weggooien, de oefenbalk meldt het.
if (fs.isEmpty() || (fs.meta()?.touched === false && isOld())) fs.replaceAll(oefenData());

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
    <SpeltakProvider key={gen} sid={OEFEN_SID} backend={fs as any} practice practiceFrom={isOld() ? madeOn() : null} onReset={reset}><SpeltakPages /></SpeltakProvider>
  </NoRoles></FixedAuth>;
}
