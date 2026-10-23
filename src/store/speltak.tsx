import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as F from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './auth';
import { normOpk, normLib, normPlan, normSettings, type Opk, type Lib, type Plan, type Settings, allBlocks, copyOpk, isKamp, presentNames, relabelDays, kampStart, kampMismatchNote, planTimesDiffer, applyPlanTimes, fixedBlocks, kampLength, newKamp, newOpk } from '../lib/model';
import { isTeamleider, normPerms, normSpeltak, type Member, type PermKey, type Speltak, type Invite, type Perms } from '../lib/types';
import { useRoles } from './roles';
import { createInvite as mkInvite } from './beheer';
import { addDays, clone, fmtT } from '../lib/time';
import { toast } from './toast';
import { markQueued, settle, track } from './saving';
import { ensureLid, normGedeeld, snapshotOf, sharedSig, writeShared, removeShared, sharedId, copyFromShared, countCopy, type Gedeeld } from './groepsbank';

type Ctx = {
  sid: string; sp: Speltak | null; loading: boolean; denied: boolean;
  /** Nog geen antwoord van de server en de speltak staat niet in de cache (offline of slechte verbinding): opnieuw proberen, niet "Geen toegang". */
  offline: boolean;
  /** Laden mislukt om een andere reden dan rechten (bijv. de daglimiet van de database). */
  loadError: boolean;
  settings: Settings; opks: Opk[]; lib: Lib[]; plans: Plan[];
  leaders: string[]; myName: string; isTL: boolean; can: (p: PermKey) => boolean;
  /** Beheerder van de groep (of Beheer totaal); mag het team beheren. */
  isAdmin: boolean;
  /** Lid van deze speltak (beheerders hoeven dat niet te zijn). */
  isMember: boolean;
  saveOpk: (o: Opk) => void; deleteOpk: (id: string) => Promise<void>;
  /** Concept of bank-opkomst verwijderen: een koppeling in de jaarplanning gaat eerst los, met een melding. */
  removeOpk: (o: Opk) => Promise<void>;
  saveLib: (l: Lib) => void; deleteLib: (id: string) => Promise<void>;
  savePlan: (p: Plan) => void; deletePlan: (id: string) => Promise<void>;
  /** Slaat alleen de gegeven velden op. Lijsten (categorieën, namen) via een functie op de nieuwste instellingen. Geeft false bij een fout. */
  saveSettings: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => Promise<boolean>;
  /** Alles wat nog wacht nu wegschrijven en (max. 3 s) wachten op de server; bijv. voor uitloggen. */
  flushAll: () => Promise<void>;
  /** Mag opkomsten koppelen, ontkoppelen en inplannen: schrijft zowel de jaarplanning als de opkomst. */
  canLink: boolean;
  setMember: (uid: string, patch: Partial<Member>) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  createInvite: (email: string, kind: 'teamleider' | 'leiding', perms: Perms, transfer?: boolean) => Promise<Invite>;
  getO: (id: string | null | undefined) => Opk | undefined;
  /** Nieuwste versie van een opkomst, voor acties die later komen (bijv. Ongedaan maken in een melding). */
  latestO: (id: string) => Opk | undefined;
  /** Gekoppelde opkomst van een rij in de jaarplanning, of null. */
  opkOf: (e: Plan | null | undefined) => Opk | null;
  getL: (id: string | null | undefined) => Lib | undefined;
  entryOfOpk: (o: Opk | null | undefined) => Plan | null;
  presentForEntry: (e: Plan | null, o?: Opk | null) => string[];
  presentFor: (o: Opk) => string[];
  linkOpk: (src: Opk, e: Plan, copy: boolean, keepNames: boolean) => Opk;
  /** Nieuwe, lege opkomst (of kamp) voor een rij in de jaarplanning: het onderwerp wordt de titel, eigen tijden gaan mee, en hij is meteen gekoppeld. Past `e` aan. */
  newForEntry: (e: Plan, kamp: boolean) => Opk;
  /** Wijken de tijden in de jaarplanning af van de (net gekoppelde) opkomst? Dan een melding met de knop om ze over te nemen. Geeft true als die melding er staat. */
  offerPlanTimes: (o: Opk, e: Plan, prefix?: string) => boolean;
  unlinkEntry: (e: Plan) => void;
  entryFor: (key: string) => Plan;
  peekEntry: (key: string) => Plan | null;
  entryForDate: (iso: string) => Plan;
  dropAbsent: (e: Plan, quiet?: boolean) => number;
  /** Groepsbank: null = (nog) niet beschikbaar, bijv. speltak zonder groep. */
  shared: Gedeeld[] | null;
  /** Oefenomgeving: voorbeelddata die alleen in deze browser staat. */
  practice: boolean;
  /** Oefenomgeving: voorbeelddata terugzetten. */
  resetPractice: (() => void) | null;
  /** Oefenomgeving: datum (ISO) van voorbeelddata die achterloopt, anders null. */
  practiceFrom: string | null;
  /** Gedeelde opkomst als kopie in de eigen opkomstenbank zetten; `dropped`: categorieën die je nog niet hebt en niet mag toevoegen. */
  importShared: (g: Gedeeld, title?: string) => { opk: Opk; dropped: string[] };
  /** Nieuwste stand van alles (data en functies), voor acties die later komen, bijv. Ongedaan maken in een melding. */
  latest: () => Ctx;
};
const C = createContext<Ctx>(null as any);

const DEBOUNCE = 500;

type Ready = Record<'sp' | 'opkomsten' | 'activiteiten' | 'planning', 'wait' | 'ok' | 'fail'>;
const WAIT: Ready = { sp: 'wait', opkomsten: 'wait', activiteiten: 'wait', planning: 'wait' };

/** Foutmelding bij opslaan, per oorzaak. Offline is geen fout: Firestore wacht dan tot er weer verbinding is. */
export function saveErrorText(e: any) {
  if (e?.code === 'permission-denied') return 'Je hebt geen rechten om dit op te slaan.';
  if (e?.code === 'invalid-argument' && /size|bytes|longer than|too large/i.test(String(e?.message || ''))) return 'Opslaan mislukt: dit is te groot. Maak het kleiner en probeer het opnieuw.';
  return 'Opslaan mislukt. Probeer het opnieuw.';
}

/** Waar de speltak opgeslagen wordt: Firestore, of (oefenomgeving) een lokale nabootsing met dezelfde functies. */
export type Backend = { db: any; collection: typeof F.collection; doc: typeof F.doc; onSnapshot: typeof F.onSnapshot; setDoc: typeof F.setDoc;
  deleteDoc: typeof F.deleteDoc; updateDoc: typeof F.updateDoc; arrayRemove: typeof F.arrayRemove; deleteField: typeof F.deleteField };
const REMOTE: Backend = { db, collection: F.collection, doc: F.doc, onSnapshot: F.onSnapshot, setDoc: F.setDoc, deleteDoc: F.deleteDoc, updateDoc: F.updateDoc, arrayRemove: F.arrayRemove, deleteField: F.deleteField };

export function SpeltakProvider({ sid, children, backend, practice = false, practiceFrom = null, onReset }: { sid: string; children: ReactNode; backend?: Backend; practice?: boolean; practiceFrom?: string | null; onReset?: () => void }) {
  const { user } = useAuth();
  const { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, arrayRemove, deleteField, db } = backend || REMOTE;
  const [sp, setSp] = useState<Speltak | null>(null);
  const [opks, setOpks] = useState<Opk[]>([]);
  const [lib, setLib] = useState<Lib[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  // Per bron: nog bezig, binnen, of mislukt. Pagina's tonen pas iets als alle vier klaar zijn (bij echte Firestore komen ze los binnen).
  const [ready, setReady] = useState<Ready>(WAIT);
  const loading = Object.values(ready).includes('wait');
  // opkomsten echt binnen van de server (niet mislukt, niet alleen een mogelijk onvolledige cache):
  // pas dan de groepsbank bijwerken, anders zou daar verdwijnen wat (nog) niet in de cache staat
  const [opksServer, setOpksServer] = useState(false);
  const opksReady = ready.opkomsten === 'ok' && opksServer;
  // geen toegang (fout van de server) of de speltak bestaat niet (bevestigd door de server)
  const [denied, setDenied] = useState(false);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // lokale, optimistische kopie: wijzigingen tonen direct, opslaan gebeurt met een korte vertraging
  const pending = useRef(new Map<string, { sid: string; kind: string; obj: any; t: any }>());
  const [, bump] = useState(0);
  // nieuwste opkomsten, voor acties die later (vanuit een melding) worden uitgevoerd
  const opksRef = useRef<Opk[]>([]);
  const plansRef = useRef<Plan[]>([]);

  useEffect(() => {
    if (!user) return;
    setReady(WAIT); setDenied(false); setMissing(false); setOffline(false); setOpksServer(false);
    const mark = (k: keyof Ready, v: 'ok' | 'fail') => setReady(r => r[k] === v ? r : { ...r, [k]: v });
    // ook bij een fout klaar, anders blijft de pagina eeuwig laden
    const err = (k: keyof Ready) => (e: any) => { if (e?.code === 'permission-denied') setDenied(true); else setLoadError(true); mark(k, 'fail'); };
    // Met includeMetadataChanges komt er ook een melding als de server alleen bevestigt wat de cache al zei
    // (bijv. "bestaat niet"), anders bleef het scherm na "Geen verbinding" hangen.
    let lastRaw = '';
    const u1 = onSnapshot(doc(db, 'speltakken', sid), { includeMetadataChanges: true }, s => {
      if (!s.exists()) {
        // Offline of slechte verbinding: Firestore meldt eerst "bestaat niet" uit een lege cache. Wachten op de server.
        if (s.metadata?.fromCache) { setOffline(true); return; }
        lastRaw = ''; setSp(null); setMissing(true); setOffline(false); mark('sp', 'fail'); return;
      }
      setOffline(false); setMissing(false);
      // alleen de status veranderd (bijv. bevestigd door de server): niets opnieuw tekenen
      const raw = JSON.stringify(s.data());
      if (raw !== lastRaw) { lastRaw = raw; setSp(normSpeltak(s.id, s.data())); }
      mark('sp', 'ok');
    }, err('sp'));
    const sub = (name: 'opkomsten' | 'activiteiten' | 'planning', norm: (x: any) => any, set: (v: any[]) => void) => {
      const ref = collection(db, 'speltakken', sid, name);
      let first = true;
      const next = (s: F.QuerySnapshot) => {
        // opkomsten: onthouden wanneer de server ze heeft bevestigd (zie opksReady)
        if (name === 'opkomsten' && !s.metadata?.fromCache) setOpksServer(true);
        // Eerste antwoord alleen uit de cache (offline, of de server heeft nog niet geantwoord): zonder blijvende cache is dat
        // (bijna) altijd leeg of onvolledig. Nog niet als geladen tellen, anders tonen de pagina's lege lijsten zodra de speltak
        // binnen is, en maakt typen in de jaarplanning een tweede rij voor dezelfde datum. Pas het eerste antwoord van de server telt.
        if (first && s.metadata?.fromCache) return;
        // alleen de status veranderd: de lijst is hetzelfde gebleven
        if (!first && typeof s.docChanges === 'function' && s.docChanges().length === 0) return;
        first = false;
        const map = new Map<string, any>();
        s.docs.forEach(d => map.set(d.id, norm({ ...d.data(), id: d.id })));
        pending.current.forEach(p => { if (p.sid === sid && p.kind === name) map.set(p.obj.id, p.obj); });
        set([...map.values()]);
        mark(name, 'ok');
      };
      // met includeMetadataChanges komt de bevestiging van de server ook als er niets verandert (een lege lijst blijft leeg)
      return onSnapshot(ref, { includeMetadataChanges: true }, next, err(name));
    };
    const u2 = sub('opkomsten', normOpk, setOpks), u3 = sub('activiteiten', normLib, setLib), u4 = sub('planning', normPlan, setPlans);
    return () => { u1(); u2(); u3(); u4(); };
  }, [sid, user]);

  const settings = sp ? sp.settings : normSettings(null);
  // nieuwste instellingen, ook vlak na een eigen wijziging (voor lijsten die je snel na elkaar aanpast)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => { opksRef.current = opks; }, [opks]);
  useEffect(() => { plansRef.current = plans; }, [plans]);
  const me = user && sp ? sp.members[user.uid] : null;
  const myName = me?.name || user?.displayName || '';
  const roles = useRoles();
  const isTL = isTeamleider(sp, user?.uid);
  const isAdmin = !practice && !!sp && roles.isGroupAdmin(sp.gid);
  const can = (p: PermKey) => !!me && (isTL || !!me.perms?.[p]);
  // Koppelen schrijft de jaarplanning (plan of build) én de opkomst (build of bank); zo dwingen de regels het ook af.
  const canLink = (can('plan') || can('build')) && (can('build') || can('bank'));
  const leaders = useMemo(() => {
    const names = sp ? Object.values(sp.members).map(m => m.name).filter(Boolean) : [];
    settings.leaders.forEach(n => { if (!names.includes(n)) names.push(n); });
    return names;
  }, [sp, settings.leaders]);

  const queue = (coll: string, obj: any, delay = DEBOUNCE) => {
    const key = sid + '/' + coll + ':' + obj.id;
    const p = pending.current.get(key); if (p) clearTimeout(p.t);
    obj.updatedAt = Date.now();
    pending.current.set(key, { sid, kind: coll, obj, t: setTimeout(() => flush(key), delay) });
    markQueued(key, true);
    bump(x => x + 1);
  };
  // Gebruikt alleen vaste dingen (backend, ref), dus werkt ook nog na het sluiten van de speltak.
  const flush = (key: string) => {
    const p = pending.current.get(key); if (!p) return Promise.resolve();
    clearTimeout(p.t); pending.current.delete(key); markQueued(key, false);
    return track(setDoc(doc(db, 'speltakken', p.sid, p.kind, p.obj.id), clone(p.obj))).then(() => {}, (e: any) => { toast(saveErrorText(e)); });
  };
  const flushNow = () => { [...pending.current.keys()].forEach(k => { flush(k); }); };
  const flushAll = () => { flushNow(); return settle(); };
  // Tabblad naar de achtergrond (telefoon: andere app), sluiten of herladen: direct wegschrijven, niet op de vertraging wachten.
  // Is er dan nog iets onderweg, dan vraagt de browser of je echt weg wilt (dat regelt saving.ts, ook buiten de speltak).
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'hidden') flushNow(); };
    window.addEventListener('pagehide', flushNow); document.addEventListener('visibilitychange', vis); window.addEventListener('beforeunload', flushNow);
    return () => { window.removeEventListener('pagehide', flushNow); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', flushNow); };
  }, []);

  const saveOpk = (o: Opk) => { setOpks(a => a.some(x => x.id === o.id) ? a.map(x => x.id === o.id ? o : x) : [...a, o]); queue('opkomsten', o); };
  const saveLib = (l: Lib) => { setLib(a => a.some(x => x.id === l.id) ? a.map(x => x.id === l.id ? l : x) : [...a, l]); queue('activiteiten', l); };
  const savePlan = (p: Plan) => { setPlans(a => a.some(x => x.id === p.id) ? a.map(x => x.id === p.id ? p : x) : [...a, p]); queue('planning', p); };
  const del = (coll: string, id: string) => {
    const key = sid + '/' + coll + ':' + id; const p = pending.current.get(key); if (p) { clearTimeout(p.t); pending.current.delete(key); markQueued(key, false); }
    return track(deleteDoc(doc(db, 'speltakken', sid, coll, id))).catch((e: any) => toast(e?.code === 'permission-denied' ? 'Je hebt geen rechten om dit te verwijderen.' : 'Verwijderen mislukt. Probeer het opnieuw.'));
  };
  const deleteOpk = async (id: string) => { setOpks(a => a.filter(x => x.id !== id)); await del('opkomsten', id); };
  const deleteLib = async (id: string) => { setLib(a => a.filter(x => x.id !== id)); await del('activiteiten', id); };
  const deletePlan = async (id: string) => { setPlans(a => a.filter(x => x.id !== id)); await del('planning', id); };
  const removeOpk = async (o: Opk) => {
    const e = plans.find(p => p.opkId === o.id); if (e) savePlan({ ...e, opkId: null });
    const used = opks.some(x => x.state === 'planned' && x.srcId === o.id);
    // Ongedaan maken: terug met hetzelfde id (verwijzingen kloppen weer) en de koppeling terug als de rij nog vrij is.
    // Een gedeelde bank-opkomst zet de synchronisatie vanzelf terug in de groepsbank.
    const back = clone(o);
    const undo = () => {
      if (opksRef.current.some(x => x.id === back.id)) return;
      saveOpk(clone(back));
      const cur = e && plansRef.current.find(p => p.id === e.id);
      if (cur && !cur.opkId) savePlan({ ...cur, opkId: back.id });
    };
    toast(o.state === 'bank' ? `"${o.title || 'Opkomst'}" uit de bank verwijderd${used ? '. Ingeplande opkomsten blijven staan' : ''}` : 'Concept verwijderd', { label: 'Ongedaan maken', fn: undo });
    await deleteOpk(o.id);
  };
  // Alleen de gewijzigde velden wegschrijven ('settings.accent', 'groupName', 'name'): twee wijzigingen vlak na elkaar,
  // of door twee mensen tegelijk, overschrijven elkaar dan niet, en het logo gaat niet bij elke klik mee.
  const saveSettings = async (p: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    const cur = settingsRef.current, patch = typeof p === 'function' ? p(cur) : p;
    const keys = (Object.keys(patch) as (keyof Settings)[]).filter(k => patch[k] !== undefined);
    if (!keys.length) return true;
    const upd: Record<string, unknown> = {}, prev: Partial<Settings> = {};
    keys.forEach(k => { upd[k === 'groupName' ? 'groupName' : k === 'speltak' ? 'name' : 'settings.' + k] = patch[k]; (prev as any)[k] = cur[k]; });
    const apply = (x: Partial<Settings>) => {
      settingsRef.current = { ...settingsRef.current, ...x };
      setSp(s => s && { ...s, settings: { ...s.settings, ...x }, ...(x.groupName !== undefined ? { groupName: x.groupName } : {}), ...(x.speltak !== undefined ? { name: x.speltak } : {}) });
    };
    apply(patch);
    try { await track(updateDoc(doc(db, 'speltakken', sid), upd)); return true; }
    catch (e: any) {
      // terugzetten, behalve wat intussen alweer is aangepast
      const back: Partial<Settings> = {}; keys.forEach(k => { if (settingsRef.current[k] === patch[k]) (back as any)[k] = prev[k]; });
      apply(back); toast(saveErrorText(e)); return false;
    }
  };
  const setMember = async (uidX: string, patch: Partial<Member>) => {
    const cur = sp?.members[uidX]; if (!cur) return;
    await updateDoc(doc(db, 'speltakken', sid), { ['members.' + uidX]: { ...cur, ...patch, perms: normPerms(patch.perms || cur.perms) } });
  };
  const removeMember = async (uidX: string) => {
    await updateDoc(doc(db, 'speltakken', sid), { ['members.' + uidX]: deleteField(), memberIds: arrayRemove(uidX), ...(sp?.tlIds?.includes(uidX) ? { tlIds: arrayRemove(uidX) } : {}) });
  };
  const createInvite = (email: string, kind: 'teamleider' | 'leiding', perms: Perms, transfer = false) => practice ? Promise.reject(new Error('oefenen')) :
    mkInvite({ kind, email, gid: sp?.gid || null, groupName: sp?.groupName || '', sid, speltakName: sp?.name || '', perms, transfer },
      { uid: user!.uid, name: myName || user?.email || '', email: user?.email || '' });

  /* ---- afgeleiden en koppelingen (zelfde logica als de losse versie) ---- */
  const getO = (id: string | null | undefined) => opks.find(o => o.id === id);
  const latestO = (id: string) => opksRef.current.find(o => o.id === id);
  const opkOf = (e: Plan | null | undefined) => (e && e.opkId && getO(e.opkId)) || null;
  const getL = (id: string | null | undefined) => lib.find(l => l.id === id);
  const entryOfOpk = (o: Opk | null | undefined) => (o && plans.find(p => p.opkId === o.id)) || null;
  const presentForEntry = (e: Plan | null, o?: Opk | null) => presentNames(leaders, e ? e.absent : [], o);
  const presentFor = (o: Opk) => { const e = o.state === 'planned' ? entryOfOpk(o) : null; return e ? presentForEntry(e, o) : [...leaders]; };
  const peekEntry = (key: string) => {
    if (!key) return null;
    if (key.startsWith('s:')) return plans.find(p => p.slot === key.slice(2)) || null;
    return plans.find(p => p.id === key) || null;
  };
  const entryFor = (key: string) => {
    let e = peekEntry(key);
    if (!e && key.startsWith('s:')) { e = { ...normPlan({ slot: key.slice(2), date: key.slice(2) }) }; savePlan(e); }
    return e!;
  };
  const entryForDate = (iso: string) => {
    let e = plans.find(p => p.date === iso);
    if (e) return e;
    const isSlot = new Date(iso + 'T12:00:00').getDay() === settings.opkDay && !plans.some(p => p.slot === iso);
    e = normPlan({ slot: isSlot ? iso : null, date: iso }); savePlan(e); return e;
  };
  const dropAbsent = (e: Plan, quiet?: boolean) => {
    // Zonder recht op opkomsten alleen de afwezigheid opslaan; wie de opkomst opent, haalt ze er later stil uit.
    if (!(can('build') || can('bank'))) return 0;
    const o = opkOf(e); if (!o || !e.absent.length) return 0;
    let n = 0; const who = new Set<string>();
    if (o.lead && e.absent.includes(o.lead)) { who.add(o.lead); o.lead = ''; n++; }
    allBlocks(o).forEach(b => { const keep = b.names.filter(x => !e.absent.includes(x)); if (keep.length !== b.names.length) { b.names.filter(x => e.absent.includes(x)).forEach(x => who.add(x)); n += b.names.length - keep.length; b.names = keep; } });
    if (n) { saveOpk({ ...o }); if (!quiet) toast(`${[...who].join(', ')} ${who.size === 1 ? 'is' : 'zijn'} afwezig en uit de indeling gehaald.`); }
    return n;
  };
  const linkOpk = (src: Opk, e: Plan, copy: boolean, keepNames: boolean) => {
    let o = src;
    if (copy) {
      o = copyOpk(src, settings);
      o.srcId = src.state === 'bank' ? src.id : src.srcId;
      if (src.state === 'bank') { o.lead = ''; if (!isKamp(o)) { o.prep = settings.prepMin; o.post = settings.postMin; } }
    }
    if (!keepNames) allBlocks(o).forEach(b => b.names = []);
    // kamp: de jaarplanning gaat voor; dagen die een weekdag heten krijgen de weekdag van hun datum.
    // Zonder "tot en met" begint een kamp vr–zo op de vaste zaterdag op de vrijdag ervoor (de vaste dag valt binnen het kamp: niet "verzet").
    if (isKamp(o)) {
      e.type = 'kamp';
      if (!e.endDate) { e.date = kampStart(o, e.date); if (o.days.length > 1) e.endDate = addDays(e.date, o.days.length - 1); }
      relabelDays(o, e.date);
    }
    if (e.opkId && e.opkId !== o.id) { const prev = getO(e.opkId); if (prev) saveOpk({ ...prev, state: 'draft' }); }
    const old = entryOfOpk(o); if (old && old !== e) savePlan({ ...old, opkId: null });
    o.state = 'planned'; e.opkId = o.id; if (e.type === 'geen') e.type = 'opkomst';
    if (o.title) e.topic = o.title; else o.title = e.topic;
    saveOpk({ ...o }); savePlan({ ...e });
    dropAbsent(e, true);
    // kamp dat niet bij de rij past (bijv. vr–zo op een rij za–zo): de dagen tellen vanaf de datum, dus melden in plaats van stil laten schuiven
    const note = kampMismatchNote(o, e.date, e.endDate); if (note) toast(note, undefined, 8000);
    return o;
  };
  const newForEntry = (e: Plan, kamp: boolean) => {
    let o: Opk;
    // kamp: dagen vanaf de datum in de jaarplanning, zonder "tot en met" t/m zondag
    if (kamp) o = newKamp(settings, kampLength(e.date, e.endDate), e.date, e.type === 'kamp' ? e.start : null, e.type === 'kamp' ? e.end : null);
    else {
      o = newOpk(settings);
      // eigen tijden uit de jaarplanning (bijv. een ochtendopkomst) gaan mee; vaste blokken schuiven mee
      if (e.type === 'opkomst' && e.start != null && e.end != null && e.end > e.start) { o.start = e.start; o.end = e.end; o.blocks = fixedBlocks(settings, e.start, e.end); }
    }
    o.title = e.topic; saveOpk(o); return linkOpk(o, e, false, true);
  };
  const offerPlanTimes = (o: Opk, e: Plan, prefix = '') => {
    if (!can('build') || !planTimesDiffer(settings, e, o)) return false;
    const st = e.start!, en = e.end!;
    toast(`${prefix ? prefix + ' ' : ''}In de jaarplanning staat ${fmtT(st)}–${fmtT(en)}, de opkomst is ${fmtT(o.start)}–${fmtT(o.end)}.`, { label: 'Tijden uit jaarplanning gebruiken', fn: () => {
      const cur = opksRef.current.find(x => x.id === o.id); if (!cur) return;
      const c = clone(cur); applyPlanTimes(c, st, en); saveOpk(c); toast(`Opkomst staat nu op ${fmtT(c.start)}–${fmtT(c.end)}`);
    } });
    return true;
  };
  const unlinkEntry = (e: Plan) => {
    const o = opkOf(e);
    if (o) { e.topic = o.title || e.topic; saveOpk({ ...o, state: 'draft' }); }
    savePlan({ ...e, opkId: null });
  };

  /* ---- groepsbank ---- */
  const gid = practice ? null : sp?.gid || null;
  const isMemberNow = !!me;
  const [shared, setShared] = useState<Gedeeld[] | null>(null);
  useEffect(() => {
    setShared(null);
    if (!user || !gid || !(isMemberNow || isAdmin)) return;
    let stop = () => {}, alive = true, retried = false;
    const listen = () => {
      stop = onSnapshot(collection(db, 'groepen', gid, 'gedeeld'), s => setShared(s.docs.map(d => normGedeeld(d.id, d.data()))), async (e: any) => {
        // lidmaatschap van de groep ontbreekt of hoort bij een speltak waar je niet meer in zit: opnieuw vastleggen
        if (e?.code === 'permission-denied' && isMemberNow && !retried && alive) { retried = true; try { await ensureLid(gid, user.uid, sid, true); if (alive) listen(); } catch { setShared(null); } }
      });
    };
    (async () => { if (isMemberNow) { try { await ensureLid(gid, user.uid, sid); } catch { /* volgt bij fout hierboven */ } } if (alive) listen(); })();
    return () => { alive = false; stop(); };
  }, [user, gid, sid, isMemberNow, isAdmin]);

  // Eigen bank en groepsbank gelijk houden: gedeelde bank-opkomsten erin, de rest eruit.
  const mayShare = isMemberNow && (can('bank') || can('build'));
  // wat nu onderweg is naar de groepsbank: handtekening per gedeelde opkomst, of 'del' bij weghalen
  const inflight = useRef(new Map<string, string>());
  useEffect(() => {
    if (!gid || !shared || !mayShare || loading || !opksReady) return;
    const t = setTimeout(() => {
      const mine = new Map(shared.filter(g => g.sid === sid).map(g => [g.id, g]));
      const want = opks.filter(o => o.state === 'bank' && o.shared);
      want.forEach(o => {
        // opnieuw delen als de opkomst, de speltaknaam of een gebruikte categorie (naam, kleur) anders is dan in de groepsbank
        const id = sharedId(sid, o.id), cur = mine.get(id), snap = snapshotOf(o, settings, sid, sp?.name || ''), sig = sharedSig(snap);
        if (cur && sharedSig(cur) === sig) return;
        if (inflight.current.get(id) === sig) return;
        inflight.current.set(id, sig);
        writeShared(gid, snap).catch(() => {}).finally(() => { if (inflight.current.get(id) === sig) inflight.current.delete(id); });
      });
      const keep = new Set(want.map(o => sharedId(sid, o.id)));
      mine.forEach((_, id) => { if (!keep.has(id) && !inflight.current.has('del:' + id)) { inflight.current.set('del:' + id, 'del'); removeShared(gid, id).catch(() => {}).finally(() => inflight.current.delete('del:' + id)); } });
    }, 800);
    return () => clearTimeout(t);
  }, [gid, shared, opks, mayShare, loading, opksReady, sp?.name, settings]);

  const importShared = (g: Gedeeld, title?: string) => {
    const { opk, add, dropped } = copyFromShared(g, settings, can('settings'));
    if (title) opk.title = title;
    if (add.length) saveSettings(s => ({ categories: [...s.categories, ...add.filter(a => !s.categories.some(c => c.id === a.id))] }));
    saveOpk(opk);
    if (gid) countCopy(gid, g.id).catch(() => {});
    return { opk, dropped };
  };

  const latestRef = useRef<Ctx>(null as any);
  const value: Ctx = { sid, sp, loading, denied: denied || missing, offline, loadError, flushAll, canLink, settings, opks, lib, plans, leaders, myName, isTL, can, isAdmin, isMember: !!me,
    saveOpk, deleteOpk, removeOpk, saveLib, deleteLib, savePlan, deletePlan, saveSettings, setMember, removeMember, createInvite,
    getO, latestO, opkOf, getL, entryOfOpk, presentForEntry, presentFor, linkOpk, newForEntry, offerPlanTimes, unlinkEntry, entryFor, peekEntry, entryForDate, dropAbsent, shared, importShared, practice, resetPractice: onReset || null, practiceFrom,
    latest: () => latestRef.current };
  latestRef.current = value;
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useSpeltak = () => useContext(C);
