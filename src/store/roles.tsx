import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './auth';
import { saveAccount } from './beheer';
import { normAdmins, ROOT_EMAIL, type Groep, type Root } from '../lib/types';

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
  /** Beheer (totaal) opnieuw ophalen, bijv. net nadat je via een uitnodiging bent toegetreden (de vorige poging werd geweigerd). */
  recheck: () => void;
};
const Ctx = createContext<RolesCtx>({ ready: false, root: null, isRoot: false, groups: [], ownGroups: [], isAdmin: false, isGroupAdmin: () => false, profile: null, recheck: () => {} });

export const normGroep = (id: string, d: any): Groep => ({ id, name: typeof d.name === 'string' ? d.name : '', admins: normAdmins(d.admins), adminIds: Array.isArray(d.adminIds) ? d.adminIds : [], createdAt: d.createdAt || 0, createdBy: d.createdBy || '' });

export function RolesProvider({ children }: { children: ReactNode }) {
  const { user, verified } = useAuth();
  // Beheer (totaal) per gebruiker en per poging: zolang de nieuwste poging nog niets heeft opgeleverd, is het nog niet klaar
  // (zo flitst na toetreden niet even "geen beheerder").
  const [check, setCheck] = useState(0);
  const rootKey = (user?.uid || '') + ':' + check;
  const [rootSnap, setRootSnap] = useState<{ key: string; root: Root | null } | null>(null);
  const rootReady = rootSnap?.key === rootKey;
  const root = rootReady ? rootSnap!.root : null;
  const [groups, setGroups] = useState<Groep[] | null>(null);
  const uid = user?.uid;
  const [profile, setProfile] = useState<RolesCtx['profile']>(null);
  useEffect(() => {
    setProfile(null);
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), s => { const d = (s.data() || {}) as any; setProfile({ firstName: d.firstName || '', lastName: d.lastName || '' }); }, () => setProfile({ firstName: '', lastName: '' }));
  }, [uid]);

  // Vindbaar op e-mailadres, zodat beheer en teamleiders je direct kunnen toevoegen. Pas na bevestigen van je e-mailadres.
  const pf = profile ? profile.firstName + '\n' + profile.lastName : null;
  useEffect(() => {
    if (!user || !verified) return;
    saveAccount(user.uid, user.displayName || '', user.email || '', profile || undefined).catch(() => {});
  }, [uid, verified, pf]);

  // Beheer (totaal) volgen; het hoofdaccount maakt het de eerste keer zelf aan.
  useEffect(() => {
    if (!user) return;
    const key = rootKey;
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
      // Wie (nog) niet in Beheer (totaal) staat, mag het niet lezen: dan stopt deze listener met een fout. recheck() begint opnieuw.
      stop = onSnapshot(ref, s => {
        const d = s.exists() ? s.data() as any : null;
        setRootSnap({ key, root: d && Array.isArray(d.ids) && d.ids.includes(user.uid) ? { ids: d.ids, people: normAdmins(d.people) } : null });
      }, () => setRootSnap({ key, root: null }));
    })();
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, check]);

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
    recheck: () => setCheck(n => n + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useRoles = () => useContext(Ctx);

/** Geen beheerrollen (oefenomgeving). */
export function NoRoles({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={{ ready: true, root: null, isRoot: false, groups: [], ownGroups: [], isAdmin: false, isGroupAdmin: () => false, profile: null, recheck: () => {} }}>{children}</Ctx.Provider>;
}
