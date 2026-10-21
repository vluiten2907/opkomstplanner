import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, deleteField, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './auth';
import { normOpk, normLib, normPlan, normSettings, type Opk, type Lib, type Plan, type Settings, allBlocks, isKamp, addDaysSafe, presentNames } from '../lib/model';
import { normPerms, type Member, type PermKey, type Speltak, type Invite, type Perms, type Role } from '../lib/types';
import { uid as mkId, clone } from '../lib/time';
import { toast } from './toast';

type Ctx = {
  sid: string; sp: Speltak | null; loading: boolean; denied: boolean;
  settings: Settings; opks: Opk[]; lib: Lib[]; plans: Plan[];
  leaders: string[]; myName: string; isTL: boolean; can: (p: PermKey) => boolean;
  saveOpk: (o: Opk) => void; deleteOpk: (id: string) => Promise<void>;
  saveLib: (l: Lib) => void; deleteLib: (id: string) => Promise<void>;
  savePlan: (p: Plan) => void; deletePlan: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  setMember: (uid: string, patch: Partial<Member>) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  createInvite: (email: string, role: Role, perms: Perms) => Promise<Invite>;
  getO: (id: string | null | undefined) => Opk | undefined;
  getL: (id: string | null | undefined) => Lib | undefined;
  entryOfOpk: (o: Opk | null | undefined) => Plan | null;
  presentForEntry: (e: Plan | null, o?: Opk | null) => string[];
  presentFor: (o: Opk) => string[];
  linkOpk: (src: Opk, e: Plan, copy: boolean, keepNames: boolean) => Opk;
  unlinkEntry: (e: Plan) => void;
  entryFor: (key: string) => Plan;
  peekEntry: (key: string) => Plan | null;
  entryForDate: (iso: string) => Plan;
  dropAbsent: (e: Plan, quiet?: boolean) => number;
};
const C = createContext<Ctx>(null as any);

const DEBOUNCE = 500;

export function SpeltakProvider({ sid, children }: { sid: string; children: ReactNode }) {
  const { user } = useAuth();
  const [sp, setSp] = useState<Speltak | null>(null);
  const [opks, setOpks] = useState<Opk[]>([]);
  const [lib, setLib] = useState<Lib[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // lokale, optimistische kopie: wijzigingen tonen direct, opslaan gebeurt met een korte vertraging
  const pending = useRef(new Map<string, { kind: string; obj: any; t: any }>());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true); setDenied(false);
    const err = (e: any) => { if (e?.code === 'permission-denied') setDenied(true); setLoading(false); };
    const u1 = onSnapshot(doc(db, 'speltakken', sid), s => {
      if (!s.exists()) { setSp(null); setDenied(true); setLoading(false); return; }
      const d = s.data();
      setSp({ id: s.id, name: d.name || '', groupName: d.groupName || '', createdAt: d.createdAt || 0, createdBy: d.createdBy || '',
        settings: normSettings({ ...d.settings, groupName: d.groupName, speltak: d.name }), members: d.members || {}, memberIds: d.memberIds || [] });
      setLoading(false);
    }, err);
    const sub = (name: string, norm: (x: any) => any, set: (v: any[]) => void) =>
      onSnapshot(collection(db, 'speltakken', sid, name), s => {
        const map = new Map<string, any>();
        s.docs.forEach(d => map.set(d.id, norm({ ...d.data(), id: d.id })));
        pending.current.forEach((p, key) => { if (key.startsWith(name + ':')) map.set(p.obj.id, p.obj); });
        set([...map.values()]);
      }, err);
    const u2 = sub('opkomsten', normOpk, setOpks), u3 = sub('activiteiten', normLib, setLib), u4 = sub('planning', normPlan, setPlans);
    return () => { u1(); u2(); u3(); u4(); };
  }, [sid, user]);

  const settings = sp ? sp.settings : normSettings(null);
  const me = user && sp ? sp.members[user.uid] : null;
  const myName = me?.name || user?.displayName || '';
  const isTL = me?.role === 'teamleider';
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
    await updateDoc(doc(db, 'speltakken', sid), { ['members.' + uidX]: deleteField(), memberIds: arrayRemove(uidX) });
  };
  const createInvite = async (email: string, role: Role, perms: Perms) => {
    const id = mkId() + mkId();
    const inv: Invite = { id, sid, speltakName: sp?.name || '', groupName: sp?.groupName || '', email: email.trim().toLowerCase(), role, perms: normPerms(perms),
      invitedBy: user!.uid, invitedByName: myName, createdAt: Date.now(), usedBy: null };
    await setDoc(doc(db, 'invites', id), inv);
    return inv;
  };

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
    if (isKamp(o)) { e.type = 'kamp'; if (!e.endDate && o.days.length > 1) e.endDate = addDaysSafe(e.date, o.days.length - 1); }
    if (e.opkId && e.opkId !== o.id) { const prev = getO(e.opkId); if (prev) saveOpk({ ...prev, state: 'draft' }); }
    const old = entryOfOpk(o); if (old && old !== e) savePlan({ ...old, opkId: null });
    o.state = 'planned'; e.opkId = o.id; if (e.type === 'geen') e.type = 'opkomst';
    if (o.title) e.topic = o.title; else o.title = e.topic;
    saveOpk({ ...o }); savePlan({ ...e });
    dropAbsent(e, true);
    return o;
  };
  const unlinkEntry = (e: Plan) => {
    const o = e.opkId ? getO(e.opkId) : null;
    if (o) { e.topic = o.title || e.topic; saveOpk({ ...o, state: 'draft' }); }
    savePlan({ ...e, opkId: null });
  };

  const value: Ctx = { sid, sp, loading, denied, settings, opks, lib, plans, leaders, myName, isTL, can,
    saveOpk, deleteOpk, saveLib, deleteLib, savePlan, deletePlan, saveSettings, setMember, removeMember, createInvite,
    getO, getL, entryOfOpk, presentForEntry, presentFor, linkOpk, unlinkEntry, entryFor, peekEntry, entryForDate, dropAbsent };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useSpeltak = () => useContext(C);

/* ---- speltak aanmaken / uitnodiging accepteren ---- */
export async function createSpeltak(uidX: string, name: string, groupName: string, speltakName: string, settings: Settings) {
  const id = mkId() + mkId();
  const { groupName: _g, speltak: _s, ...rest } = settings;
  const member: Member = { name, email: '', role: 'teamleider', perms: { plan: true, build: true, bank: true, settings: true }, since: Date.now() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'speltakken', id), { name: speltakName, groupName, createdAt: Date.now(), createdBy: uidX, settings: rest, members: { [uidX]: member }, memberIds: [uidX] });
  batch.set(doc(db, 'users', uidX), { speltakIds: arrayUnion(id) }, { merge: true });
  await batch.commit();
  return id;
}
export async function readInvite(token: string): Promise<Invite | null> {
  const s = await getDoc(doc(db, 'invites', token));
  return s.exists() ? ({ ...(s.data() as any), id: s.id } as Invite) : null;
}
export async function acceptInvite(inv: Invite, uidX: string, name: string, email: string) {
  const member: Member = { name, email: email.toLowerCase(), role: inv.role, perms: normPerms(inv.perms), inviteId: inv.id, since: Date.now() };
  await updateDoc(doc(db, 'speltakken', inv.sid), { ['members.' + uidX]: member, memberIds: arrayUnion(uidX) });
  await updateDoc(doc(db, 'invites', inv.id), { usedBy: uidX });
  await setDoc(doc(db, 'users', uidX), { speltakIds: arrayUnion(inv.sid) }, { merge: true });
}
