import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail, type User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type AuthCtx = {
  user: User | null; ready: boolean;
  login: (email: string, pw: string) => Promise<void>;
  register: (name: string, email: string, pw: string) => Promise<void>;
  reset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setReady(true); }), []);
  const value: AuthCtx = {
    user, ready,
    async login(email, pw) { await signInWithEmailAndPassword(auth, email.trim(), pw); },
    async register(name, email, pw) {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await updateProfile(cred.user, { displayName: name.trim() });
      await setDoc(doc(db, 'users', cred.user.uid), { name: name.trim(), email: email.trim().toLowerCase(), createdAt: serverTimestamp() }, { merge: true });
      setUser({ ...cred.user, displayName: name.trim() } as User);
    },
    async reset(email) { await sendPasswordResetEmail(auth, email.trim()); },
    async logout() { await signOut(auth); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

/** Vaste, nep-ingelogde gebruiker (oefenomgeving): niets gaat naar Firebase. */
export function FixedAuth({ user, children }: { user: User; children: ReactNode }) {
  const no = async () => { throw new Error('oefenen'); };
  return <Ctx.Provider value={{ user, ready: true, login: no, register: no, reset: no, logout: async () => {} }}>{children}</Ctx.Provider>;
}

export function authError(e: any): string {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mailadres of wachtwoord klopt niet.';
  if (c.includes('email-already-in-use')) return 'Er bestaat al een account met dit e-mailadres.';
  if (c.includes('weak-password')) return 'Kies een wachtwoord van minstens 6 tekens.';
  if (c.includes('invalid-email')) return 'Dit is geen geldig e-mailadres.';
  if (c.includes('too-many-requests')) return 'Te veel pogingen. Probeer het straks opnieuw.';
  if (c.includes('network')) return 'Geen verbinding. Controleer je internet.';
  return 'Er ging iets mis: ' + (e?.message || c || 'onbekende fout');
}
