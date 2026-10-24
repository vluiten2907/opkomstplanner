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
// Standaard zegt Firebase niet of er een account is (e-mail-enumeratiebescherming). Test: 'fake.noenum' = '1' → user-not-found voor een onbekend adres.
export async function sendPasswordResetEmail(_a: any, email: string) {
  if (localStorage.getItem('fake.noenum') === '1' && !Object.values(users).some(x => x.email === String(email || '').trim().toLowerCase())) throw err('auth/user-not-found');
}
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
// Testhaken: localStorage 'fake.failWrite' / 'fake.failListen' = foutcode laat schrijven of luisteren in een speltak mislukken
// ('too-big' = document te groot); 'fake.delayListen' = vertraging in ms. Alleen voor de rooktest.
const failCode = (k: string, path: string) => { const c = localStorage.getItem(k); return c && path.startsWith('speltakken/') ? c : ''; };
const failErr = (c: string) => c === 'too-big'
  ? Object.assign(new Error('Document cannot be written because its size (1,300,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes.'), { code: 'invalid-argument' })
  : err(c);
/*
 * Twee leesregels uit firestore.rules nagebootst, omdat de app er anders op moet reageren:
 * - de lijst met uitnodigingen alleen per niveau: Beheer (totaal), beheerder van de groep (gid in de zoekvraag)
 *   of teamleider van de speltak (sid in de zoekvraag);
 * - beheer/totaal lezen alleen als je erin staat (of als het nog niet bestaat); een listener stopt dan met een fout.
 */
const inRoot = (u: string) => (store['beheer/totaal']?.ids || []).includes(u);
function invitesDenied(ref: Ref) {
  if (ref.kind !== 'coll' || ref.path !== 'invites') return false;
  const u = current?.uid; if (!u) return true;
  if (inRoot(u)) return false;
  const eq: Record<string, any> = {}; (ref.filters || []).forEach(([k, op, v]) => { if (op === '==') eq[k] = v; });
  if (typeof eq.gid === 'string' && (store['groepen/' + eq.gid]?.adminIds || []).includes(u)) return false;
  const sp = typeof eq.sid === 'string' ? store['speltakken/' + eq.sid] : null;
  return !(sp && (sp.memberIds || []).includes(u) && (Array.isArray(sp.tlIds) ? sp.tlIds.includes(u) : sp.members?.[u]?.role === 'teamleider'));
}
const rootDenied = (ref: Ref) => ref.kind === 'doc' && ref.path === 'beheer/totaal' && ref.path in store && !(current && inRoot(current.uid));
// Testhaak 'fake.offlineFirst' = ms: een speltak komt eerst als "bestaat niet" uit een lege cache (zoals Firestore offline doet),
// pas na ms het echte document (de verbinding is terug). De lijsten in de speltak (opkomsten, activiteiten, planning) komen eerst
// leeg uit de cache en pas 'fake.offlineSlow' ms na het document van de server (een trage verbinding). Alleen voor de rooktest.
// 'fake.offlineList' = ms: zo komt ook de lijst met je speltakken (Mijn speltakken) eerst leeg uit de cache.
const offlineFirst = (ref: Ref) => {
  if (ref.kind === 'coll' && ref.path === 'speltakken') return Number(localStorage.getItem('fake.offlineList')) || 0;
  const ms = Number(localStorage.getItem('fake.offlineFirst')) || 0;
  if (!ms) return 0;
  if (ref.kind === 'doc' && /^speltakken\/[^/]+$/.test(ref.path)) return ms;
  if (ref.kind === 'coll' && /^speltakken\/[^/]+\/(opkomsten|activiteiten|planning)$/.test(ref.path)) return ms + (Number(localStorage.getItem('fake.offlineSlow')) || 0);
  return 0;
};
// Testhaak 'fake.offlineCached' = ms: zoals Firestore offline met een geheugencache. Het speltakdocument komt eerst als bestaand uit de cache;
// de lijsten in de speltak komen uit de cache met wat dit tabblad al eens van de server had (anders leeg), en pas na ms van de server.
// `seen`: paden die in dit tabblad (sinds het laden van de pagina) al een antwoord van de server kregen.
const seen = new Set<string>();
const offlineCached = (ref: Ref) => {
  const ms = Number(localStorage.getItem('fake.offlineCached')) || 0;
  if (!ms) return 0;
  return (ref.kind === 'doc' && /^speltakken\/[^/]+$/.test(ref.path)) || (ref.kind === 'coll' && /^speltakken\/[^/]+\/(opkomsten|activiteiten|planning)$/.test(ref.path)) ? ms : 0;
};
const memSnap = (ref: Ref) => {
  if (ref.kind === 'doc') return { id: ref.path.split('/').pop(), exists: () => ref.path in store, data: () => clone(store[ref.path]), metadata: { fromCache: true } };
  const docs = seen.has(ref.path) ? docsIn(ref) : [];
  return { docs, empty: !docs.length, size: docs.length, metadata: { fromCache: true }, docChanges: () => docs };
};
const cacheSnap = (ref: Ref) => ref.kind === 'doc'
  ? { id: ref.path.split('/').pop(), exists: () => false, data: () => undefined, metadata: { fromCache: true } }
  : { docs: [], empty: true, size: 0, metadata: { fromCache: true }, docChanges: () => [] };
// Zoals Firestore: onSnapshot(ref, cb, onErr) of onSnapshot(ref, opties, cb, onErr).
export function onSnapshot(ref: Ref, a: any, b?: any, c?: any) {
  const [cb, onErr]: [(s: any) => void, ((e: any) => void) | undefined] = typeof a === 'function' ? [a, b] : [b, c];
  const f = failCode('fake.failListen', ref.path);
  if (f) { const t = setTimeout(() => onErr?.(failErr(f)), 0); return () => clearTimeout(t); }
  if (invitesDenied(ref)) { const t = setTimeout(() => onErr?.(err('permission-denied')), 0); return () => clearTimeout(t); }
  if (ref.kind === 'doc' && ref.path === 'beheer/totaal') {
    const g = () => { if (rootDenied(ref)) { listeners.delete(g); onErr?.(err('permission-denied')); } else cb(snap(ref)); };
    listeners.add(g); setTimeout(() => { if (listeners.has(g)) g(); }, 0); return () => listeners.delete(g);
  }
  const l = () => { seen.add(ref.path); cb(snap(ref)); };
  const off = offlineFirst(ref);
  if (off) {
    const t0 = setTimeout(() => cb(cacheSnap(ref)), 0);
    const t = setTimeout(() => { listeners.add(l); l(); }, off);
    return () => { clearTimeout(t0); clearTimeout(t); listeners.delete(l); };
  }
  const mem = offlineCached(ref);
  if (mem) {
    const t0 = setTimeout(() => cb(memSnap(ref)), 0);
    const t = setTimeout(() => { listeners.add(l); l(); }, mem);
    return () => { clearTimeout(t0); clearTimeout(t); listeners.delete(l); };
  }
  // Testhaak 'fake.delayListen' = ms: lijsten in een speltak komen later binnen, zoals bij echte Firestore (los van het speltakdocument).
  const d = ref.kind === 'coll' ? Number(failCode('fake.delayListen', ref.path)) || 0 : 0;
  if (d) { const t = setTimeout(() => { listeners.add(l); l(); }, d); return () => { clearTimeout(t); listeners.delete(l); }; }
  listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l);
}
// Testhaak 'fake.lag' = ms: eenmalig lezen (getDoc, getDocs) en setDoc duren zo lang, op elk pad, zoals bij echte Firestore
// (bijv. dubbel Enter terwijl een uitnodiging nog wordt gemaakt). Alleen voor de rooktest.
const lag = async () => { const ms = Number(localStorage.getItem('fake.lag')) || 0; if (ms) await new Promise(r => setTimeout(r, ms)); };
export async function getDoc(ref: Ref) { await lag(); return snap(ref); }
export async function getDocs(ref: Ref) { await lag(); if (invitesDenied(ref)) throw err('permission-denied'); return snap(ref); }
// Testhaak 'fake.holdWrite' = ms: schrijven in een speltak duurt zo lang (trage of geen verbinding). Alleen voor de rooktest.
const hold = async (path: string) => { const ms = Number(failCode('fake.holdWrite', path)) || 0; if (ms) await new Promise(r => setTimeout(r, ms)); };
export async function setDoc(ref: Ref, data: any, opts?: { merge?: boolean }) {
  const f = failCode('fake.failWrite', ref.path); if (f) throw failErr(f);
  await hold(ref.path); await lag();
  const cur = opts?.merge && store[ref.path] ? store[ref.path] : {};
  const next = clone(cur); Object.entries(data).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist();
}
export async function updateDoc(ref: Ref, patch: any) { const f = failCode('fake.failWrite', ref.path); if (f) throw failErr(f); await hold(ref.path); if (!(ref.path in store)) throw err('not-found'); const next = clone(store[ref.path]); Object.entries(patch).forEach(([k, v]) => applyKey(next, k, v)); store[ref.path] = next; persist(); }
export async function deleteDoc(ref: Ref) { delete store[ref.path]; persist(); }
export function writeBatch() {
  const ops: (() => Promise<void>)[] = [];
  return { set: (r: Ref, d: any, o?: any) => ops.push(() => setDoc(r, d, o)), update: (r: Ref, p: any) => ops.push(() => updateDoc(r, p)), delete: (r: Ref) => ops.push(() => deleteDoc(r)), commit: async () => { for (const op of ops) await op(); } };
}

// Testhaak: een ander apparaat wijzigt of verwijdert een document (data null = verwijderen). Alleen voor de rooktest.
(globalThis as any).__fakeRemote = (path: string, data: any) => { if (data === null) delete store[path]; else store[path] = clone(data); persist(); };
