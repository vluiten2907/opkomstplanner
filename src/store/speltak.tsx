import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as F from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './auth';
import { normOpk, normLib, normPlan, normSettings, type Opk, type Lib, type Plan, type Settings, allBlocks, isKamp, addDaysSafe, presentNames, relabelDays, planTimesDiffer, applyPlanTimes } from '../lib/model';
import { isTeamleider, normPerms, type Member, type PermKey, type Speltak, type Invite, type Perms } from '../lib/types';
import { useRoles } from './roles';
import { createInvite as mkInvite } from './beheer';
import { uid as mkId, clone, fmtT } from '../lib/time';
import { toast } from './toast';
import { ensureLid, normGedeeld, snapshotOf, writeShared, removeShared, sharedId, copyFromShared, countCopy, type Gedeeld } from './groepsbank';

type Ctx = {
  sid: string; sp: Speltak | null; loading: boolean; denied: boolean;
  settings: Settings; opks: Opk[]; lib: Lib[]; plans: Plan[];
  leaders: string[]; myName: string; isTL: boolean; can: (p: PermKey) => boolean;
  /** Beheerder van de groep (of Beheer totaal); mag het team beheren. */
  isAdmin: boolean;
  /** Lid van deze speltak (beheerders hoeven dat niet te zijn). */
  isMember: boolean;
  saveOpk: (o: Opk) => void; deleteOpk: (id: string) => Promise<void>;
  saveLib: (l: Lib) => void; deleteLib: (id: string) => Promise<void>;
  savePlan: (p: Plan) => void; deletePlan: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  setMember: (uid: string, patch: Partial<Member>) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  createInvite: (email: string, kind: 'teamleider' | 'leiding', perms: Perms, transfer?: boolean) => Promise<Invite>;
  getO: (id: string | null | undefined) => Opk | undefined;
  getL: (id: string | null | undefined) => Lib | undefined;
  entryOfOpk: (o: Opk | null | undefined) => Plan | null;
  presentForEntry: (e: Plan | null, o?: Opk | null) => string[];
  presentFor: (o: Opk) => string[];
  linkOpk: (src: Opk, e: Plan, copy: boolean, keepNames: boolean) => Opk;
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
  /** Gedeelde opkomst als kopie in de eigen opkomstenbank zetten. */
  importShared: (g: Gedeeld, title?: string) => Opk;
};
const C = createContext<Ctx>(null as any);

const DEBOUNCE = 500;

/** Waar de speltak opgeslagen wordt: Firestore, of (oefenomgeving) een lokale nabootsing met dezelfde functies. */
export type Backend = { db: any; collection: typeof F.collection; doc: typeof F.doc; onSnapshot: typeof F.onSnapshot; setDoc: typeof F.setDoc;
  deleteDoc: typeof F.deleteDoc; updateDoc: typeof F.updateDoc; arrayRemove: typeof F.arrayRemove; deleteField: typeof F.deleteField };
const REMOTE: Backend = { db, collection: F.collection, doc: F.doc, onSnapshot: F.onSnapshot, setDoc: F.setDoc, deleteDoc: F.deleteDoc, updateDoc: F.updateDoc, arrayRemove: F.arrayRemove, deleteField: F.deleteField };

export function SpeltakProvider({ sid, children, backend, practice = false, onReset }: { sid: string; children: ReactNode; backend?: Backend; practice?: boolean; onReset?: () => void }) {
  const { user } = useAuth();
  const { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, arrayRemove, deleteField, db } = backend || REMOTE;
  const [sp, setSp] = useState<Speltak | null>(null);
  const [opks, setOpks] = useState<Opk[]>([]);
  const [lib, setLib] = useState<Lib[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [opksReady, setOpksReady] = useState(false);
  // lokale, optimistische kopie: wijzigingen tonen direct, opslaan gebeurt met een korte vertraging
  const pending = useRef(new Map<string, { kind: string; obj: any; t: any }>());
  const [, bump] = useState(0);
  // nieuwste opkomsten, voor acties die later (vanuit een melding) worden uitgevoerd
  const opksRef = useRef<Opk[]>([]);

  useEffect(() => {
    if (!user) return;
    setLoading(true); setDenied(false); setOpksReady(false);
    const err = (e: any) => { if (e?.code === 'permission-denied') setDenied(true); setLoading(false); };
    const u1 = onSnapshot(doc(db, 'speltakken', sid), s => {
      if (!s.exists()) { setSp(null); setDenied(true); setLoading(false); return; }
      const d = s.data();
      setSp({ id: s.id, name: d.name || '', groupName: d.groupName || '', createdAt: d.createdAt || 0, createdBy: d.createdBy || '',
        settings: normSettings({ ...d.settings, groupName: d.groupName, speltak: d.name }), members: d.members || {}, memberIds: d.memberIds || [],
        gid: d.gid || null, tlIds: Array.isArray(d.tlIds) ? d.tlIds : null });
      setLoading(false);
    }, err);
    const sub = (name: string, norm: (x: any) => any, set: (v: any[]) => void) =>
      onSnapshot(collection(db, 'speltakken', sid, name), s => {
        const map = new Map<string, any>();
        s.docs.forEach(d => map.set(d.id, norm({ ...d.data(), id: d.id })));
        pending.current.forEach((p, key) => { if (key.startsWith(name + ':')) map.set(p.obj.id, p.obj); });
        set([...map.values()]);
      }, err);
    const u2 = sub('opkomsten', normOpk, (v: Opk[]) => { setOpks(v); setOpksReady(true); }), u3 = sub('activiteiten', normLib, setLib), u4 = sub('planning', normPlan, setPlans);
    return () => { u1(); u2(); u3(); u4(); };
  }, [sid, user]);

  const settings = sp ? sp.settings : normSettings(null);
  useEffect(() => { opksRef.current = opks; }, [opks]);
  const me = user && sp ? sp.members[user.uid] : null;
  const myName = me?.name || user?.displayName || '';
  const roles = useRoles();
  const isTL = isTeamleider(sp, user?.uid);
  const isAdmin = !practice && !!sp && roles.isGroupAdmin(sp.gid);
  const can = (p: PermKey) => !!me && (isTL || !!me.perms?.[p]);
  const leaders = useMemo(() => {
    const names = sp ? Object.values(sp.members).map(m => m.name).filter(Boolean) : [];
    settings.leaders.forEach(n => { if (!names.includes(n)) names.push(n); });
    return names;
  }, [sp, settings.leaders]);

  const queue = (coll: string, obj: any, delay = DEBOUNCE) => {
    const key = coll + ':' + obj.id;
    const p = pending.current.get(key); if (p) clearTimeout(p.t);
    obj.updatedAt = Date.now();
    pending.current.set(key, { kind: coll, obj, t: setTimeout(() => flush(key), delay) });
    bump(x => x + 1);
  };
  const flush = async (key: string) => {
    const p = pending.current.get(key); if (!p) return;
    pending.current.delete(key);
    try { await setDoc(doc(db, 'speltakken', sid, p.kind, p.obj.id), clone(p.obj)); }
    catch (e: any) { toast(e?.code === 'permission-denied' ? 'Je hebt geen rechten om dit op te slaan.' : 'Opslaan mislukt. Controleer je verbinding.'); }
  };
  useEffect(() => { const h = () => pending.current.forEach((_, k) => flush(k)); window.addEventListener('pagehide', h); return () => window.removeEventListener('pagehide', h); }, []);

  const saveOpk = (o: Opk) => { setOpks(a => a.some(x => x.id === o.id) ? a.map(x => x.id === o.id ? o : x) : [...a, o]); queue('opkomsten', o); };
  const saveLib = (l: Lib) => { setLib(a => a.some(x => x.id === l.id) ? a.map(x => x.id === l.id ? l : x) : [...a, l]); queue('activiteiten', l); };
  const savePlan = (p: Plan) => { setPlans(a => a.some(x => x.id === p.id) ? a.map(x => x.id === p.id ? p : x) : [...a, p]); queue('planning', p); };
  const del = (coll: string, id: string) => {
    const key = coll + ':' + id; const p = pending.current.get(key); if (p) { clearTimeout(p.t); pending.current.delete(key); }
    return deleteDoc(doc(db, 'speltakken', sid, coll, id)).catch(() => toast('Verwijderen mislukt.'));
  };
  const deleteOpk = async (id: string) => { setOpks(a => a.filter(x => x.id !== id)); await del('opkomsten', id); };
  const deleteLib = async (id: string) => { setLib(a => a.filter(x => x.id !== id)); await del('activiteiten', id); };
  const deletePlan = async (id: string) => { setPlans(a => a.filter(x => x.id !== id)); await del('planning', id); };
  const saveSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    const { groupName, speltak, ...rest } = next;
    setSp(s => s ? { ...s, settings: next, groupName, name: speltak } : s);
    try { await updateDoc(doc(db, 'speltakken', sid), { settings: rest, groupName, name: speltak }); }
    catch (e: any) { toast(e?.code === 'permission-denied' ? 'Alleen de teamleider kan dit aanpassen.' : 'Opslaan mislukt.'); }
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
    const o = e.opkId ? getO(e.opkId) : null; if (!o || !e.absent.length) return 0;
    let n = 0; const who = new Set<string>();
    if (o.lead && e.absent.includes(o.lead)) { who.add(o.lead); o.lead = ''; n++; }
    allBlocks(o).forEach(b => { const keep = b.names.filter(x => !e.absent.includes(x)); if (keep.length !== b.names.length) { b.names.filter(x => e.absent.includes(x)).forEach(x => who.add(x)); n += b.names.length - keep.length; b.names = keep; } });
    if (n) { saveOpk({ ...o }); if (!quiet) toast(`${[...who].join(', ')} ${who.size === 1 ? 'is' : 'zijn'} afwezig en uit de indeling gehaald.`); }
    return n;
  };
  const linkOpk = (src: Opk, e: Plan, copy: boolean, keepNames: boolean) => {
    let o = src;
    if (copy) {
      o = normOpk(clone(src), settings); o.id = mkId(); allBlocks(o).forEach(b => b.id = mkId()); o.days.forEach(d => d.id = mkId()); o.createdAt = Date.now();
      o.srcId = src.state === 'bank' ? src.id : src.srcId;
      if (src.state === 'bank') { o.lead = ''; if (!isKamp(o)) { o.prep = settings.prepMin; o.post = settings.postMin; } }
    }
    if (!keepNames) allBlocks(o).forEach(b => b.names = []);
    // kamp: de jaarplanning gaat voor; dagen die een weekdag heten krijgen de weekdag van hun datum
    if (isKamp(o)) { e.type = 'kamp'; if (!e.endDate && o.days.length > 1) e.endDate = addDaysSafe(e.date, o.days.length - 1); relabelDays(o, e.date); }
    if (e.opkId && e.opkId !== o.id) { const prev = getO(e.opkId); if (prev) saveOpk({ ...prev, state: 'draft' }); }
    const old = entryOfOpk(o); if (old && old !== e) savePlan({ ...old, opkId: null });
    o.state = 'planned'; e.opkId = o.id; if (e.type === 'geen') e.type = 'opkomst';
    if (o.title) e.topic = o.title; else o.title = e.topic;
    saveOpk({ ...o }); savePlan({ ...e });
    dropAbsent(e, true);
    return o;
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
    const o = e.opkId ? getO(e.opkId) : null;
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
  const inflight = useRef(new Map<string, number>());
  useEffect(() => {
    if (!gid || !shared || !mayShare || loading || !opksReady) return;
    const t = setTimeout(() => {
      const mine = new Map(shared.filter(g => g.sid === sid).map(g => [g.id, g]));
      const want = opks.filter(o => o.state === 'bank' && o.shared);
      want.forEach(o => {
        const id = sharedId(sid, o.id), cur = mine.get(id);
        if (cur && cur.updatedAt === o.updatedAt && cur.speltakName === (sp?.name || '')) return;
        if (inflight.current.get(id) === o.updatedAt) return;
        inflight.current.set(id, o.updatedAt);
        writeShared(gid, snapshotOf(o, settings, sid, sp?.name || '')).catch(() => inflight.current.delete(id));
      });
      const keep = new Set(want.map(o => sharedId(sid, o.id)));
      mine.forEach((_, id) => { if (!keep.has(id) && !inflight.current.has('del:' + id)) { inflight.current.set('del:' + id, 1); removeShared(gid, id).finally(() => inflight.current.delete('del:' + id)); } });
    }, 800);
    return () => clearTimeout(t);
  }, [gid, shared, opks, mayShare, loading, opksReady, sp?.name, settings]);

  const importShared = (g: Gedeeld, title?: string) => {
    const { opk, add } = copyFromShared(g, settings, can('settings'));
    if (title) opk.title = title;
    if (add.length) saveSettings({ categories: [...settings.categories, ...add] });
    saveOpk(opk);
    if (gid) countCopy(gid, g.id).catch(() => {});
    return opk;
  };

  const value: Ctx = { sid, sp, loading, denied, settings, opks, lib, plans, leaders, myName, isTL, can, isAdmin, isMember: !!me,
    saveOpk, deleteOpk, saveLib, deleteLib, savePlan, deletePlan, saveSettings, setMember, removeMember, createInvite,
    getO, getL, entryOfOpk, presentForEntry, presentFor, linkOpk, offerPlanTimes, unlinkEntry, entryFor, peekEntry, entryForDate, dropAbsent, shared, importShared, practice, resetPractice: onReset || null };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useSpeltak = () => useContext(C);
