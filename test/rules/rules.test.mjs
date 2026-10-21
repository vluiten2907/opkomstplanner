// Tests voor firestore.rules (draai via test/rules/run.sh).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, deleteField } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-opk', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
const ROOT = 'vluiten2907@gmail.com';
const as = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const ALL = { plan: true, build: true, bank: true, settings: true }, NONE = { plan: false, build: false, bank: false, settings: false };
const far = Date.now() + 20 * 864e5;
let fails = 0, n = 0;
async function t(name, fn) { n++; try { await fn(); console.log('OK   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + (e?.message || e).toString().split('\n')[0]); } }
const inv = (o) => ({ kind: 'leiding', email: 'x@t.nl', gid: 'g1', groupName: 'G1', sid: 's1', speltakName: 'Scouts', role: 'leiding', perms: NONE, invitedBy: 'tl', invitedByName: 'TL', createdAt: Date.now(), expiresAt: far, usedBy: null, transfer: false, ...o });

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'beheer/totaal'), { ids: ['root'], people: { root: { name: 'V', email: ROOT, since: 1 } } });
    await setDoc(doc(db, 'groepen/g1'), { name: 'G1', admins: { ga: { name: 'GA', email: 'ga@t.nl', since: 1 } }, adminIds: ['ga'], createdAt: 1, createdBy: 'root' });
    await setDoc(doc(db, 'groepen/g2'), { name: 'G2', admins: {}, adminIds: [], createdAt: 1, createdBy: 'root' });
    await setDoc(doc(db, 'speltakken/s1'), { name: 'Scouts', groupName: 'G1', gid: 'g1', createdBy: 'ga', settings: {}, tlIds: ['tl'], memberIds: ['tl', 'ld'],
      members: { tl: { name: 'TL', email: 'tl@t.nl', role: 'teamleider', perms: ALL, since: 1 }, ld: { name: 'LD', email: 'ld@t.nl', role: 'leiding', perms: NONE, since: 1 } } });
    await setDoc(doc(db, 'speltakken/s1/opkomsten/o1'), { title: 'x' });
    await setDoc(doc(db, 'speltakken/s0'), { name: 'Oud', groupName: 'Oude groep', createdBy: 'otl', settings: {}, memberIds: ['otl'],
      members: { otl: { name: 'OTL', email: 'otl@t.nl', role: 'teamleider', perms: ALL, since: 1 } } });
    await setDoc(doc(db, 'invites/iLd'), inv({ email: 'new@t.nl' }));
    await setDoc(doc(db, 'invites/iTl'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL, email: 'newtl@t.nl', invitedBy: 'ga' }));
    await setDoc(doc(db, 'invites/iOld'), { sid: 's0', speltakName: 'Oud', groupName: 'Oude groep', email: 'old@t.nl', role: 'teamleider', perms: ALL, invitedBy: 'otl', invitedByName: 'OTL', createdAt: 1, usedBy: null });
    await setDoc(doc(db, 'invites/iGa'), inv({ kind: 'groep', role: null, sid: null, perms: NONE, email: 'ga2@t.nl', invitedBy: 'root' }));
    await setDoc(doc(db, 'invites/iRoot'), inv({ kind: 'totaal', role: null, sid: null, gid: null, perms: NONE, email: 'r2@t.nl', invitedBy: 'root' }));
    await setDoc(doc(db, 'invites/iExp'), inv({ email: 'late@t.nl', expiresAt: Date.now() - 1000 }));
  });
}

/* ---- hoofdaccount ---- */
await env.clearFirestore();
await t('hoofdaccount leest niet-bestaand beheer/totaal', () => assertSucceeds(getDoc(doc(as('root', ROOT), 'beheer/totaal'))));
await t('ander account kan beheer/totaal niet aanmaken', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'beheer/totaal'), { ids: ['x'], people: { x: {} } })));
await t('hoofdaccount maakt beheer/totaal aan', () => assertSucceeds(setDoc(doc(as('root', ROOT), 'beheer/totaal'), { ids: ['root'], people: { root: { name: 'V' } } })));
await t('hoofdaccount kan het niet opnieuw overschrijven met andere ids', () => assertFails(setDoc(doc(as('root', ROOT), 'beheer/totaal'), { ids: [], people: {} })));

await seed();
/* ---- account zonder rol ---- */
const x = as('x', 'x@t.nl');
await t('zonder rol: speltak niet lezen', () => assertFails(getDoc(doc(x, 'speltakken/s1'))));
await t('zonder rol: geen speltak aanmaken', () => assertFails(setDoc(doc(x, 'speltakken/sx'), { gid: 'g1', createdBy: 'x', memberIds: [], tlIds: [], members: {} })));
await t('zonder rol: groepen niet lijsten', () => assertFails(getDocs(collection(x, 'groepen'))));
await t('zonder rol: beheer/totaal niet lezen', () => assertFails(getDoc(doc(x, 'beheer/totaal'))));
await t('uitnodiging openen zonder account', () => assertSucceeds(getDoc(doc(anon(), 'invites/iLd'))));
await t('uitnodigingen lijsten zonder rol: nee', () => assertFails(getDocs(collection(x, 'invites'))));

/* ---- Beheer (totaal) ---- */
const r = as('root', ROOT);
await t('totaal: alle speltakken lijsten', () => assertSucceeds(getDocs(collection(r, 'speltakken'))));
await t('totaal: alle groepen lijsten', () => assertSucceeds(getDocs(collection(r, 'groepen'))));
await t('totaal: alle uitnodigingen lijsten', () => assertSucceeds(getDocs(collection(r, 'invites'))));
await t('totaal: groep aanmaken', () => assertSucceeds(setDoc(doc(r, 'groepen/g3'), { name: 'G3', admins: {}, adminIds: [], createdAt: 1, createdBy: 'root' })));
await t('totaal: oude speltak koppelen', () => assertSucceeds(updateDoc(doc(r, 'speltakken/s0'), { gid: 'g2', groupName: 'G2', tlIds: ['otl'] })));
await t('totaal: groep-beheerder uitnodigen', () => assertSucceeds(setDoc(doc(r, 'invites/n1'), inv({ kind: 'groep', role: null, sid: null, gid: 'g2', invitedBy: 'root' }))));
await t('totaal: mede-beheer totaal uitnodigen', () => assertSucceeds(setDoc(doc(r, 'invites/n2'), inv({ kind: 'totaal', role: null, sid: null, gid: null, invitedBy: 'root' }))));
await t('totaal: laatste niet weghalen', () => assertFails(updateDoc(doc(r, 'beheer/totaal'), { ids: [], 'people.root': deleteField() })));
await t('totaal: inhoud speltak lezen', () => assertSucceeds(getDoc(doc(r, 'speltakken/s1/opkomsten/o1'))));

await seed();
/* ---- Beheer (groep) ---- */
const ga = as('ga', 'ga@t.nl');
await t('groep: eigen groep lezen', () => assertSucceeds(getDoc(doc(ga, 'groepen/g1'))));
await t('groep: andere groep niet lezen', () => assertFails(getDoc(doc(ga, 'groepen/g2'))));
await t('groep: groepen lijsten (eigen)', () => assertSucceeds(getDocs(query(collection(ga, 'groepen'), where('adminIds', 'array-contains', 'ga')))));
await t('groep: speltakken van groep lijsten', () => assertSucceeds(getDocs(query(collection(ga, 'speltakken'), where('gid', '==', 'g1')))));
await t('groep: speltakken andere groep niet', () => assertFails(getDocs(query(collection(ga, 'speltakken'), where('gid', '==', 'g2')))));
await t('groep: inhoud lezen', () => assertSucceeds(getDoc(doc(ga, 'speltakken/s1/opkomsten/o1'))));
await t('groep: inhoud niet bewerken', () => assertFails(setDoc(doc(ga, 'speltakken/s1/opkomsten/o1'), { title: 'y' })));
await t('groep: speltak aanmaken in eigen groep', () => assertSucceeds(setDoc(doc(ga, 'speltakken/s2'), { name: 'Welpen', groupName: 'G1', gid: 'g1', createdBy: 'ga', settings: {}, members: {}, memberIds: [], tlIds: [] })));
await t('groep: speltak aanmaken in andere groep niet', () => assertFails(setDoc(doc(ga, 'speltakken/s3'), { name: 'W', gid: 'g2', createdBy: 'ga', settings: {}, members: {}, memberIds: [], tlIds: [] })));
await t('groep: teamleider uitnodigen', () => assertSucceeds(setDoc(doc(ga, 'invites/n3'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL, invitedBy: 'ga' }))));
await t('groep: mede-beheerder uitnodigen', () => assertSucceeds(setDoc(doc(ga, 'invites/n4'), inv({ kind: 'groep', role: null, sid: null, invitedBy: 'ga' }))));
await t('groep: beheer totaal uitnodigen niet', () => assertFails(setDoc(doc(ga, 'invites/n5'), inv({ kind: 'totaal', role: null, sid: null, gid: null, invitedBy: 'ga' }))));
await t('groep: beheerder voor andere groep niet', () => assertFails(setDoc(doc(ga, 'invites/n6'), inv({ kind: 'groep', role: null, sid: null, gid: 'g2', invitedBy: 'ga' }))));
await t('groep: uitnodigingen van groep lijsten', () => assertSucceeds(getDocs(query(collection(ga, 'invites'), where('gid', '==', 'g1')))));
await t('groep: uitnodiging intrekken', () => assertSucceeds(deleteDoc(doc(ga, 'invites/iLd'))));
await t('groep: extra teamleider aanstellen', () => assertSucceeds(updateDoc(doc(ga, 'speltakken/s1'), { 'members.ld.role': 'teamleider', tlIds: ['tl', 'ld'] })));
await t('groep: speltak niet naar andere groep', () => assertFails(updateDoc(doc(ga, 'speltakken/s1'), { gid: 'g2' })));
await t('groep: laatste beheerder blijft', () => assertFails(updateDoc(doc(ga, 'groepen/g1'), { adminIds: [], 'admins.ga': deleteField() })));
await t('groep: iemand beheerder maken', () => assertSucceeds(updateDoc(doc(ga, 'groepen/g1'), { adminIds: arrayUnion('tl'), 'admins.tl': { name: 'TL', email: 'tl@t.nl', since: 1 } })));

await seed();
/* ---- teamleider ---- */
const tl = as('tl', 'tl@t.nl');
await t('teamleider: leiding uitnodigen', () => assertSucceeds(setDoc(doc(tl, 'invites/n7'), inv({}))));
await t('teamleider: leiding uitnodigen met verkeerde gid niet', () => assertFails(setDoc(doc(tl, 'invites/n7b'), inv({ gid: 'g2' }))));
await t('teamleider: teamleider uitnodigen niet', () => assertFails(setDoc(doc(tl, 'invites/n8'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL }))));
await t('teamleider: rol overdragen via uitnodiging', () => assertSucceeds(setDoc(doc(tl, 'invites/n9'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL, transfer: true }))));
await t('teamleider: uitnodigingen speltak lijsten', () => assertSucceeds(getDocs(query(collection(tl, 'invites'), where('sid', '==', 's1')))));
await t('teamleider: geen groep-uitnodiging', () => assertFails(setDoc(doc(tl, 'invites/n10'), inv({ kind: 'groep', role: null, sid: null }))));
await t('teamleider: rechten leiding aanpassen', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.perms': ALL })));
await t('teamleider: extra teamleider aanstellen niet', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.role': 'teamleider', tlIds: ['tl', 'ld'] })));
await t('teamleider: niet als laatste aftreden', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.tl.role': 'leiding', tlIds: [] })));
await t('teamleider: overdragen aan leiding', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.role': 'teamleider', 'members.tl.role': 'leiding', tlIds: ['ld'] })));
await t('oud-teamleider is nu geen teamleider meer', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.perms': NONE })));
await t('teamleider: groep niet lezen', () => assertFails(getDoc(doc(as('ld', 'ld@t.nl'), 'groepen/g1'))));

await seed();
/* ---- leiding ---- */
const ld = as('ld', 'ld@t.nl');
await t('leiding: speltak lezen', () => assertSucceeds(getDoc(doc(ld, 'speltakken/s1'))));
await t('leiding: niemand uitnodigen', () => assertFails(setDoc(doc(ld, 'invites/n11'), inv({ invitedBy: 'ld' }))));
await t('leiding: uitnodigingen niet lijsten', () => assertFails(getDocs(query(collection(ld, 'invites'), where('sid', '==', 's1')))));
await t('leiding: zichzelf geen rechten geven', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld.perms': ALL })));
await t('leiding: speltak verlaten', () => assertSucceeds(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: ['tl'] })));

/* ---- uitnodigingen accepteren ---- */
await seed();
const nw = as('nw', 'new@t.nl');
const mem = (role, inviteId, perms) => ({ name: 'N', email: 'x', role, perms, inviteId, since: 1 });
await t('accepteren leiding met ander e-mailadres niet', () => assertFails(updateDoc(doc(as('zz', 'zz@t.nl'), 'speltakken/s1'), { 'members.zz': mem('leiding', 'iLd', NONE), memberIds: arrayUnion('zz') })));
await t('accepteren leiding als teamleider niet', () => assertFails(updateDoc(doc(nw, 'speltakken/s1'), { 'members.nw': mem('teamleider', 'iLd', NONE), memberIds: arrayUnion('nw') })));
await t('accepteren leiding', () => assertSucceeds(updateDoc(doc(nw, 'speltakken/s1'), { 'members.nw': mem('leiding', 'iLd', NONE), memberIds: arrayUnion('nw') })));
await t('uitnodiging als gebruikt markeren', () => assertSucceeds(updateDoc(doc(nw, 'invites/iLd'), { usedBy: 'nw' })));
const nt = as('nt', 'newtl@t.nl');
await t('accepteren teamleider zonder tlIds niet', () => assertFails(updateDoc(doc(nt, 'speltakken/s1'), { 'members.nt': mem('teamleider', 'iTl', ALL), memberIds: arrayUnion('nt') })));
await t('accepteren teamleider', () => assertSucceeds(updateDoc(doc(nt, 'speltakken/s1'), { 'members.nt': mem('teamleider', 'iTl', ALL), memberIds: arrayUnion('nt'), tlIds: arrayUnion('nt') })));
const ol = as('ol', 'old@t.nl');
await t('oude uitnodiging oude speltak: met tlIds niet', () => assertFails(updateDoc(doc(ol, 'speltakken/s0'), { 'members.ol': mem('teamleider', 'iOld', ALL), memberIds: arrayUnion('ol'), tlIds: arrayUnion('ol') })));
await t('oude uitnodiging oude speltak: zonder tlIds', () => assertSucceeds(updateDoc(doc(ol, 'speltakken/s0'), { 'members.ol': mem('teamleider', 'iOld', ALL), memberIds: arrayUnion('ol') })));
await t('verlopen uitnodiging niet', () => assertFails(updateDoc(doc(as('lt', 'late@t.nl'), 'speltakken/s1'), { 'members.lt': mem('leiding', 'iExp', NONE), memberIds: arrayUnion('lt') })));
const g2 = as('ga2', 'ga2@t.nl');
await t('accepteren beheer groep', () => assertSucceeds(updateDoc(doc(g2, 'groepen/g1'), { 'admins.ga2': { name: 'G', email: 'ga2@t.nl', since: 1, inviteId: 'iGa' }, adminIds: arrayUnion('ga2') })));
await t('beheer groep met leiding-uitnodiging niet', () => assertFails(updateDoc(doc(nw, 'groepen/g1'), { 'admins.nw': { name: 'G', email: 'x', since: 1, inviteId: 'iLd' }, adminIds: arrayUnion('nw') })));
const r2 = as('r2', 'r2@t.nl');
await t('accepteren beheer totaal', () => assertSucceeds(updateDoc(doc(r2, 'beheer/totaal'), { 'people.r2': { name: 'R', email: 'r2@t.nl', since: 1, inviteId: 'iRoot' }, ids: arrayUnion('r2') })));
await t('nieuwe beheer totaal leest alles', () => assertSucceeds(getDocs(collection(r2, 'speltakken'))));

/* ---- oude speltak (nog niet gekoppeld) blijft werken ---- */
await seed();
const otl = as('otl', 'otl@t.nl');
await t('oud: teamleider leest eigen speltak', () => assertSucceeds(getDoc(doc(otl, 'speltakken/s0'))));
await t('oud: teamleider nodigt leiding uit', () => assertSucceeds(setDoc(doc(otl, 'invites/n20'), inv({ sid: 's0', gid: null, invitedBy: 'otl' }))));
await t('oud: teamleider legt tlIds vast', () => assertSucceeds(updateDoc(doc(otl, 'speltakken/s0'), { tlIds: ['otl'] })));
await t('oud: groep-beheerder ziet hem niet', () => assertFails(getDoc(doc(ga, 'speltakken/s0'))));
await t('mijn speltakken lijsten', () => assertSucceeds(getDocs(query(collection(otl, 'speltakken'), where('memberIds', 'array-contains', 'otl')))));

await env.cleanup();
console.log(`\n${n - fails}/${n} geslaagd`);
process.exit(fails ? 1 : 0);
