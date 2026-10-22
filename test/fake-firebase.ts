/*
 * Nep-Firebase voor lokaal proberen en tests (npm run demo).
 * Houdt alles in het geheugen van de browser (localStorage), zonder beveiligingsregels.
 * Alleen de functies die de app gebruikt zijn nagebouwd.
 */
type Listener = () => void;
const LS_FS = 'fake.firestore', LS_AUTH = 'fake.auth';
const load = (k: string, d: any) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
const store: Record<string, any> = load(LS_FS, {});
const listeners = new Set<Listener>();
const persist = () => { try { localStorage.setItem(LS_FS, JSON.stringify(store)); } catch {} listeners.forEach(l => l()); };
const clone = (x: any) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));

/* ---- app ---- */
export function initializeApp(_cfg: any) { return { name: 'fake' }; }

/* ---- auth ---- */
type U = { uid: string; email: string; displayName: string; pw: string; verified?: boolean; mailed?: boolean };
const users: Record<string, U> = load(LS_AUTH + '.users', {});
// Demo-account voor Beheer (totaal): open registratie bestaat niet meer, dus de demo begint hiermee (wachtwoord demo123).
if (!Object.values(users).some(u => u.email === 'vluiten2907@gmail.com')) users.uroot = { uid: 'uroot', email: 'vluiten2907@gmail.com', displayName: 'Beheer (demo)', pw: 'demo123', verified: true };
let current: U | null = load(LS_AUTH + '.current', null);
const authListeners = new Set<(u: any) => void>();
// Oude demo-accounts (van voor de e-mailbevestiging) tellen als bevestigd.
const pub = (u: U | null) => u ? { uid: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.verified !== false, getIdToken: async (_f?: boolean) => 'demo-token' } : null;
const saveAuth = () => { localStorage.setItem(LS_AUTH + '.users', JSON.stringify(users)); localStorage.setItem(LS_AUTH + '.current', JSON.stringify(current)); authListeners.forEach(l => l(pub(current))); };
const err = (code: string) => Object.assign(new Error(code), { code });
export function getAuth() { return { get currentUser() { return pub(current); } }; }
export function onAuthStateChanged(_a: any, cb: (u: any) => void) { authListeners.add(cb); setTimeout(() => cb(pub(current)), 0); return () => authListeners.delete(cb); }
export async function signInWithEmailAndPassword(_a: any, email: string, pw: string) {
  const u = Object.values(users).find(x => x.email === email.toLowerCase()); if (!u || u.pw !== pw) throw err('auth/invalid-credential');
  current = u; saveAuth(); return { user: pub(u) };
}
export async function createUserWithEmailAndPassword(_a: any, email: string, pw: string) {
  email = email.toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
  if (Object.values(users).some(x => x.email === email)) throw err('auth/email-already-in-use');
  if (pw.length < 6) throw err('auth/weak-password');
  const u: U = { uid: 'u' + Math.random().toString(36).slice(2, 10), email, displayName: '', pw, verified: false }; users[u.uid] = u; current = u; saveAuth(); return { user: pub(u) };
}
export async function updateProfile(user: any, p: { displayName?: string }) { const u = users[user.uid]; if (u && p.displayName != null) { u.displayName = p.displayName; if (current?.uid === u.uid) current = u; saveAuth(); } }
export async function sendPasswordResetEmail() { /* niets */ }
// Bevestigingsmail: in de demo telt de link als aangeklikt zodra de mail is 'verstuurd'.
export async function sendEmailVerification(user: any) { const u = users[user.uid]; if (u) { u.mailed = true; saveAuth(); } }
// Test: zet localStorage 'fake.noverify' = '1' om de link pas als aangeklikt te zien na 'fake.clicked' = e-mailadres.
const clicked = (u: U) => localStorage.getItem('fake.noverify') !== '1' || localStorage.getItem('fake.clicked') === u.email;
export async function reload(user: any) { const u = users[user.uid]; if (u && u.mailed && clicked(u)) { u.verified = true; if (current?.uid === u.uid) current = u; localStorage.setItem(LS_AUTH + '.users', JSON.stringify(users)); localStorage.setItem(LS_AUTH + '.current', JSON.stringify(current)); } }
export async function signOut() { current = null; saveAuth(); }
export type User = { uid: string; email: string | null; displayName: string | null };

/* ---- firestore ---- */
type Ref = { kind: 'doc' | 'coll'; path: string; filters?: [string, string, any][] };
export function getFirestore() { return { fake: true }; }
export function collection(parent: any, ...seg: string[]): Ref { const base = parent && parent.path ? parent.path + '/' : ''; return { kind: 'coll', path: base + seg.join('/') }; }
export function doc(parent: any, ...seg: string[]): Ref { const base = parent && parent.path ? parent.path + '/' : ''; return { kind: 'doc', path: base + seg.join('/') }; }
export function query(ref: Ref, ...cons: any[]): Ref { return { ...ref, filters: cons.map(c => c.f) }; }
export function where(field: string, op: string, value: any) { return { f: [field, op, value] }; }
export function serverTimestamp() { return Date.now(); }
class Sentinel { constructor(public op: string, public v?: any) {} }
export const arrayUnion = (...v: any[]) => new Sentinel('union', v);
export const arrayRemove = (...v: any[]) => new Sentinel('remove', v);
export const deleteField = () => new Sentinel('delete');
export const increment = (n: number) => new Sentinel('inc', n);
function applyKey(obj: any, key: string, val: any) {
  const parts = key.split('.'); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
  const last = parts[parts.length - 1];
  if (val instanceof Sentinel) {
    if (val.op === 'delete') delete o[last];
    else if (val.op === 'inc') o[last] = (typeof o[last] === 'number' ? o[last] : 0) + val.v;
    else { const arr = Array.isArray(o[last]) ? [...o[last]] : []; if (val.op === 'union') val.v.forEach((x: any) => { if (!arr.includes(x)) arr.push(x); }); else val.v.forEach((x: any) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }); o[last] = arr; }
  } else o[last] = clone(val);
}
const docsIn = (ref: Ref) => Object.keys(store).filter(p => p.startsWith(ref.path + '/') && !p.slice(ref.path.length + 1).includes('/'))
  .map(p => ({ id: p.slice(ref.path.length + 1), data: () => clone(store[p]) }))
  .filter(d => (ref.filters || []).every(([f, op, v]) => { const x = d.data()[f]; return op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === '==' ? x === v : true; }));
const snap = (ref: Ref) => ref.kind === 'doc'
  ? { id: ref.path.split('/').pop(), exists: () => ref.path in store, data: () => clone(store[ref.path]) }
  : { docs: docsIn(ref) };
export function onSnapshot(ref: Ref, cb: (s: any) => void, _err?: any) { const l = () => cb(snap(ref)); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); }
export async function getDoc(ref: Ref) { return snap(ref); }
export async function getDocs(ref: Ref) { return snap(ref); }
export async function setDoc(ref: Ref, data: any, opts?: { merge?: boolean }) {
  const cur = opts?.merge && store[ref.path] ? store[ref.path] : {};
  const next = clone(cur); Object.entries(data).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist();
}
export async function updateDoc(ref: Ref, patch: any) { if (!(ref.path in store)) throw err('not-found'); const next = clone(store[ref.path]); Object.entries(patch).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist(); }
export async function deleteDoc(ref: Ref) { delete store[ref.path]; persist(); }
export function writeBatch() {
  const ops: (() => Promise<void>)[] = [];
  return { set: (r: Ref, d: any, o?: any) => ops.push(() => setDoc(r, d, o)), update: (r: Ref, p: any) => ops.push(() => updateDoc(r, p)), delete: (r: Ref) => ops.push(() => deleteDoc(r)), commit: async () => { for (const op of ops) await op(); } };
}
