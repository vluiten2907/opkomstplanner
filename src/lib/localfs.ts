/*
 * Kleine Firestore-nabootsing in de browser, voor de oefenomgeving.
 * Bevat alleen wat store/speltak.tsx gebruikt. Alles blijft in localStorage van deze browser.
 */
type Ref = { kind: 'doc' | 'coll'; path: string };
type Listener = () => void;
class Sentinel { constructor(public op: 'delete' | 'remove', public v?: any[]) {} }

const clone = (x: any) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));

export function createLocalFs(key: string) {
  let store: Record<string, any> = {};
  try { store = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { store = {}; }
  const listeners = new Set<Listener>();
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(store)); } catch { /* vol of geblokkeerd: dan alleen in het geheugen */ } listeners.forEach(l => l()); };
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
    onSnapshot: (ref: any, cb: (s: any) => void, _err?: any) => { const l = () => cb(snap(ref)); listeners.add(l); setTimeout(l, 0); return () => { listeners.delete(l); }; },
    setDoc: async (ref: any, data: any) => { const next = {}; Object.entries(data).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist(); },
    updateDoc: async (ref: any, patch: any) => { if (!(ref.path in store)) throw Object.assign(new Error('not-found'), { code: 'not-found' }); const next = clone(store[ref.path]); Object.entries(patch).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist(); },
    deleteDoc: async (ref: any) => { delete store[ref.path]; persist(); },
    arrayRemove: (...v: any[]): any => new Sentinel('remove', v),
    deleteField: (): any => new Sentinel('delete'),
    /** Is er al iets opgeslagen? */
    isEmpty: () => Object.keys(store).length === 0,
    /** Alles vervangen (bijv. door verse voorbeelddata). */
    replaceAll: (data: Record<string, any>) => { store = clone(data); persist(); },
  };
  return fs;
}
