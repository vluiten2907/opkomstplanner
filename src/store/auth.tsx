import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail, sendEmailVerification, reload, type User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type AuthCtx = {
  user: User | null; ready: boolean;
  /** E-mailadres bevestigd via de link in de mail (firestore.rules eist dit bij uitnodigingen en accounts). */
  verified: boolean;
  /** Bevestigingsmail (opnieuw) sturen. */
  sendVerify: () => Promise<void>;
  /** Na klikken op de link: gegevens verversen. Geeft true als het adres nu bevestigd is. */
  refresh: () => Promise<boolean>;
  login: (email: string, pw: string) => Promise<void>;
  register: (name: string, email: string, pw: string) => Promise<void>;
  reset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setVerified(!!u?.emailVerified); setReady(true); }), []);
  const value: AuthCtx = {
    user, ready, verified,
    sendVerify: () => sendVerifyMail(),
    async refresh() {
      const u = auth.currentUser; if (!u) return false;
      await reload(u);
      const ok = !!auth.currentUser?.emailVerified;
      // nieuw token ophalen, anders ziet Firestore het bevestigde adres nog niet
      if (ok) await auth.currentUser!.getIdToken(true);
      setVerified(ok);
      return ok;
    },
    async login(email, pw) { await signInWithEmailAndPassword(auth, email.trim(), pw); },
    async register(name, email, pw) {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await updateProfile(cred.user, { displayName: name.trim() });
      await setDoc(doc(db, 'users', cred.user.uid), { name: name.trim(), email: email.trim().toLowerCase(), createdAt: serverTimestamp() }, { merge: true });
      await sendVerifyMail().catch(() => {});
      setUser({ ...cred.user, displayName: name.trim() } as User);
      setVerified(false);
    },
    async reset(email) {
      // Mail in het Nederlands, met na het resetten een knop terug naar het inlogscherm.
      auth.languageCode = 'nl';
      const url = `${window.location.origin}${import.meta.env.BASE_URL}inloggen`;
      try { await sendPasswordResetEmail(auth, email.trim(), { url }); }
      catch (e: any) {
        // Domein niet toegestaan in Firebase (Authorized domains): dan zonder terugknop.
        if (e?.code === 'auth/unauthorized-continue-uri' || e?.code === 'auth/invalid-continue-uri') await sendPasswordResetEmail(auth, email.trim());
        else throw e;
      }
    },
    async logout() {
      // de laatste speltak hoort bij dit account: wie hierna inlogt, begint niet in een speltak waar hij geen lid van is
      try { localStorage.removeItem('opk.sid'); } catch { /* geen opslag */ }
      await signOut(auth);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

/** Bevestigingsmail sturen, in het Nederlands, met daarna een knop terug naar de pagina waar je was. */
async function sendVerifyMail() {
  const u = auth.currentUser; if (!u) return;
  auth.languageCode = 'nl';
  try { await sendEmailVerification(u, { url: window.location.href }); }
  catch (e: any) {
    if (e?.code === 'auth/unauthorized-continue-uri' || e?.code === 'auth/invalid-continue-uri') await sendEmailVerification(u);
    else throw e;
  }
  try { sessionStorage.setItem(MAILED, (u.email || '').toLowerCase()); } catch { /* geen opslag: dan zegt de melding niet dat er een mail is */ }
}
const MAILED = 'opk.verifymail';
/** Is er in deze sessie echt een bevestigingsmail naar dit adres gestuurd? (Oude accounts kregen er nooit een.) */
export function verifyMailSent(email: string | null | undefined) {
  try { return !!email && sessionStorage.getItem(MAILED) === email.toLowerCase(); } catch { return false; }
}

/** Vaste, nep-ingelogde gebruiker (oefenomgeving): niets gaat naar Firebase. */
export function FixedAuth({ user, children }: { user: User; children: ReactNode }) {
  const no = async () => { throw new Error('oefenen'); };
  return <Ctx.Provider value={{ user, ready: true, verified: true, sendVerify: no, refresh: async () => true, login: no, register: no, reset: no, logout: async () => {} }}>{children}</Ctx.Provider>;
}

export function authError(e: any): string {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mailadres of wachtwoord klopt niet.';
  if (c.includes('email-already-in-use')) return 'Er bestaat al een account met dit e-mailadres.';
  if (c.includes('weak-password')) return 'Kies een wachtwoord van minstens 6 tekens.';
  if (c.includes('invalid-email')) return 'Dit is geen geldig e-mailadres.';
  if (c.includes('too-many-requests')) return 'Te veel pogingen. Probeer het straks opnieuw.';
  if (c.includes('network')) return 'Geen verbinding. Controleer je internet.';
  if (c.includes('user-disabled')) return 'Dit account is uitgeschakeld.';
  // de echte fout (vaak Engelse tekst van Firebase) alleen in de console
  console.error(e);
  return 'Er ging iets mis. Probeer het opnieuw.';
}
