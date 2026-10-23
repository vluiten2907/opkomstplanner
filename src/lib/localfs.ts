/*
 * Kleine Firestore-nabootsing in de browser, voor de oefenomgeving.
 * Bevat alleen wat store/speltak.tsx gebruikt. Alles blijft in localStorage van deze browser.
 */
import { todayISO } from './time';

type Ref = { kind: 'doc' | 'coll'; path: string };
/** Wanneer alles voor het laatst vervangen is (replaceAll) en of er daarna nog iets veranderd is. */
export type LocalMeta = { made: string; touched: boolean };
type Listener = () => void;
class Sentinel { constructor(public op: 'delete' | 'remove', public v?: any[]) {} }

const clone = (x: any) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));

export function createLocalFs(key: string) {
  let store: Record<string, any> = {};
  try { store = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { store = {}; }
  // los bewaard, zodat het nooit als document of collectie meetelt
  let meta: LocalMeta | null = null;
  try { const m = JSON.parse(localStorage.getItem(key + '.meta') || 'null'); if (m && typeof m.made === 'string') meta = { made: m.made, touched: !!m.touched }; } catch { meta = null; }
  const listeners = new Set<Listener>();
  const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* vol of geblokkeerd: dan alleen in het geheugen */ } };
  const persist = () => { save(key, store); listeners.forEach(l => l()); };
  const touch = () => { if (meta && !meta.touched) { meta = { ...meta, touched: true }; save(key + '.meta', meta); } };
  const applyKey = (obj: any, k: string, val: any) => {
    const parts = k.split('.'); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (val instanceof Sentinel) {
      if (val.op === 'delete') delete o[last];
      else o[last] = (Array.isArray(o[last]) ? o[last] : []).filter((x: any) => !val.v!.includes(x));
    } else o[last] = clone(val);
  };
  const join = (parent: any, seg: string[]) => (parent && parent.path ? parent.path + '/' : '') + seg.join('/');
  const snap = (ref: Ref) => ref.kind === 'doc'
    ? { id: ref.path.split('/').pop(), exists: () => ref.path in store, data: () => clone(store[ref.path]) }
    : { docs: Object.keys(store).filter(p => p.startsWith(ref.path + '/') && !p.slice(ref.path.length + 1).includes('/')).map(p => ({ id: p.slice(ref.path.length + 1), data: () => clone(store[p]) })) };
  const fs = {
    db: { local: true } as any,
    doc: (parent: any, ...seg: string[]): any => ({ kind: 'doc', path: join(parent, seg) }),
    collection: (parent: any, ...seg: string[]): any => ({ kind: 'coll', path: join(parent, seg) }),
    // zoals Firestore: (ref, cb, fout) of (ref, opties, cb, fout)
    onSnapshot: (ref: any, a: any, b?: any) => { const cb: (s: any) => void = typeof a === 'function' ? a : b; const l = () => cb(snap(ref)); listeners.add(l); setTimeout(l, 0); return () => { listeners.delete(l); }; },
    setDoc: async (ref: any, data: any) => { const next = {}; Object.entries(data).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; touch(); persist(); },
    updateDoc: async (ref: any, patch: any) => { if (!(ref.path in store)) throw Object.assign(new Error('not-found'), { code: 'not-found' }); const next = clone(store[ref.path]); Object.entries(patch).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; touch(); persist(); },
    deleteDoc: async (ref: any) => { delete store[ref.path]; touch(); persist(); },
    arrayRemove: (...v: any[]): any => new Sentinel('remove', v),
    deleteField: (): any => new Sentinel('delete'),
    /** Is er al iets opgeslagen? */
    isEmpty: () => Object.keys(store).length === 0,
    /** Eén document lezen (null als het er niet is). */
    peek: (path: string) => path in store ? clone(store[path]) : null,
    /** Datum van de laatste replaceAll en of er sindsdien iets veranderd is; null bij data van vóór deze bijhouding. */
    meta: (): LocalMeta | null => meta && { ...meta },
    /** Alles vervangen (bijv. door verse voorbeelddata). */
    replaceAll: (data: Record<string, any>) => { store = clone(data); meta = { made: todayISO(), touched: false }; save(key + '.meta', meta); persist(); },
  };
  return fs;
}
