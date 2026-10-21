import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './auth';
import { saveAccount } from './beheer';
import { ROOT_EMAIL, type Groep, type Root } from '../lib/types';

/*
 * Beheerrollen van de ingelogde gebruiker:
 * - Beheer (totaal): uid staat in beheer/totaal.ids
 * - Beheer (groep): uid staat in groepen/{gid}.adminIds
 * Teamleider en leiding staan per speltak (zie store/speltak.tsx).
 */
type RolesCtx = {
  ready: boolean; root: Root | null; isRoot: boolean;
  /** Groepen die je beheert (Beheer totaal: alle groepen). */
  groups: Groep[];
  /** Groepen waar je zelf beheerder van bent (ook als je Beheer totaal bent). */
  ownGroups: Groep[];
  isAdmin: boolean;
  isGroupAdmin: (gid: string | null | undefined) => boolean;
  /** Voor- en achternaam uit je profiel; null zolang het laadt. */
  profile: { firstName: string; lastName: string } | null;
};
const Ctx = createContext<RolesCtx>({ ready: false, root: null, isRoot: false, groups: [], ownGroups: [], isAdmin: false, isGroupAdmin: () => false, profile: null });

export const normGroep = (id: string, d: any): Groep => ({ id, name: d.name || '', admins: d.admins || {}, adminIds: d.adminIds || [], createdAt: d.createdAt || 0, createdBy: d.createdBy || '' });

export function RolesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [root, setRoot] = useState<Root | null>(null);
  const [rootReady, setRootReady] = useState(false);
  const [groups, setGroups] = useState<Groep[] | null>(null);
  const uid = user?.uid;
  const [profile, setProfile] = useState<RolesCtx['profile']>(null);
  useEffect(() => {
    setProfile(null);
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), s => { const d = (s.data() || {}) as any; setProfile({ firstName: d.firstName || '', lastName: d.lastName || '' }); }, () => setProfile({ firstName: '', lastName: '' }));
  }, [uid]);

  // Beheer (totaal) volgen; het hoofdaccount maakt het de eerste keer zelf aan.
  useEffect(() => {
    setRoot(null); setRootReady(false);
    if (!user) return;
    // Vindbaar op e-mailadres, zodat beheer en teamleiders je direct kunnen toevoegen.
    saveAccount(user.uid, user.displayName || '', user.email || '').catch(() => {});
    const ref = doc(db, 'beheer', 'totaal');
    let stop = () => {};
    let alive = true;
    (async () => {
      if ((user.email || '').toLowerCase() === ROOT_EMAIL) {
        try {
          const s = await getDoc(ref);
          if (!s.exists()) await setDoc(ref, { ids: [user.uid], people: { [user.uid]: { name: user.displayName || user.email || 'Beheer', email: ROOT_EMAIL, since: Date.now() } } });
        } catch { /* geen rechten (bijv. oude regels): dan gewoon geen beheer */ }
      }
      if (!alive) return;
      stop = onSnapshot(ref, s => {
        const d = s.exists() ? s.data() as any : null;
        setRoot(d && Array.isArray(d.ids) && d.ids.includes(user.uid) ? { ids: d.ids, people: d.people || {} } : null);
        setRootReady(true);
      }, () => { setRoot(null); setRootReady(true); });
    })();
    return () => { alive = false; stop(); };
  }, [user]);

  const isRoot = !!root;
  // Groepen: Beheer totaal ziet alles, anders alleen de groepen waar je beheerder bent.
  useEffect(() => {
    setGroups(null);
    if (!uid || !rootReady) return;
    const q = isRoot ? collection(db, 'groepen') : query(collection(db, 'groepen'), where('adminIds', 'array-contains', uid));
    return onSnapshot(q, s => setGroups(s.docs.map(d => normGroep(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'nl'))), () => setGroups([]));
  }, [uid, rootReady, isRoot]);

  const list = groups || [];
  const ownGroups = list.filter(g => !!uid && g.adminIds.includes(uid));
  const value: RolesCtx = {
    ready: !user || (rootReady && groups !== null), root, isRoot, groups: list, ownGroups,
    isAdmin: isRoot || ownGroups.length > 0,
    isGroupAdmin: gid => isRoot || (!!gid && ownGroups.some(g => g.id === gid)),
    profile,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useRoles = () => useContext(Ctx);
