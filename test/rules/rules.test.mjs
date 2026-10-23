// Tests voor firestore.rules (draai via test/rules/run.sh).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, arrayRemove, deleteField, writeBatch } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-opk', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
const ROOT = 'vluiten2907@gmail.com';
const as = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
// account waarvan het e-mailadres nog niet is bevestigd
const unv = (uid, email) => env.authenticatedContext(uid, { email, email_verified: false }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const ALL = { plan: true, build: true, bank: true, settings: true }, NONE = { plan: false, build: false, bank: false, settings: false };
const far = Date.now() + 20 * 864e5;
let fails = 0, n = 0;
async function t(name, fn) { n++; try { await fn(); console.log('OK   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + (e?.message || e).toString().split('\n')[0]); } }
// toetreden zoals de app het doet: in één batch met het markeren van de uitnodiging
const joinB = (db, path, patch, inviteId, uid) => { const b = writeBatch(db); b.update(doc(db, path), patch); b.update(doc(db, 'invites/' + inviteId), { usedBy: uid }); return b.commit(); };
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
await t('groep: groep hernoemen, groepsnaam van de speltak mee', async () => {
  const b = writeBatch(ga); b.update(doc(ga, 'groepen/g1'), { name: 'G1 nieuw' }); b.update(doc(ga, 'speltakken/s1'), { groupName: 'G1 nieuw' });
  await assertSucceeds(b.commit());
});
await t('groep: iemand beheerder maken', () => assertSucceeds(updateDoc(doc(ga, 'groepen/g1'), { adminIds: arrayUnion('tl'), 'admins.tl': { name: 'TL', email: 'tl@t.nl', since: 1 } })));

await seed();
/* ---- teamleider ---- */
const tl = as('tl', 'tl@t.nl');
await t('teamleider: leiding uitnodigen', () => assertSucceeds(setDoc(doc(tl, 'invites/n7'), inv({}))));
await t('teamleider: uitnodiging met te lange naam niet', () => assertFails(setDoc(doc(tl, 'invites/n7c'), inv({ invitedByName: 'x'.repeat(61) }))));
await t('teamleider: leiding uitnodigen met verkeerde gid niet', () => assertFails(setDoc(doc(tl, 'invites/n7b'), inv({ gid: 'g2' }))));
await t('teamleider: teamleider uitnodigen niet', () => assertFails(setDoc(doc(tl, 'invites/n8'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL }))));
await t('teamleider: rol overdragen via teamleider-uitnodiging niet (extra teamleider aanstellen doet de beheerder)', () => assertFails(setDoc(doc(tl, 'invites/n9'), inv({ kind: 'teamleider', role: 'teamleider', perms: ALL, transfer: true }))));
await t('teamleider: rol overdragen via uitnodiging als leiding met alle rechten', () => assertSucceeds(setDoc(doc(tl, 'invites/n9b'), inv({ perms: ALL, transfer: true }))));
await t('teamleider: uitnodigingen speltak lijsten', () => assertSucceeds(getDocs(query(collection(tl, 'invites'), where('sid', '==', 's1')))));
await t('teamleider: geen groep-uitnodiging', () => assertFails(setDoc(doc(tl, 'invites/n10'), inv({ kind: 'groep', role: null, sid: null }))));
await t('teamleider: rechten leiding aanpassen', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.perms': ALL })));
await t('teamleider: losse instelling opslaan (punt-pad)', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'settings.accent': 'blauw', name: 'Scouts nieuw' })));
// onder een groep hoort de groepsnaam bij de groep (kop, pdf, uitnodigingen): die past de beheerder aan
await t('teamleider: groepsnaam van speltak onder een groep: nee', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'settings.accent': 'blauw', groupName: 'Nep groep' })));
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
await t('leiding zonder recht Instellingen: instelling niet opslaan', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { 'settings.accent': 'rood' })));
await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s1'), { 'members.ld.perms': { ...NONE, settings: true } }));
await t('leiding met recht Instellingen: instelling en speltaknaam opslaan', () => assertSucceeds(updateDoc(doc(ld, 'speltakken/s1'), { 'settings.accent': 'rood', name: 'Scouts 2' })));
await t('leiding met recht Instellingen: groepsnaam van speltak onder een groep: nee', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { groupName: 'Nep groep' })));
await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s1'), { 'members.ld.perms': NONE }));
await t('verlaten en anderen eruit: nee', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: [] })));
await t('verlaten en vreemde erbij: nee', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: ['tl', 'evil'] })));
await t('verlaten maar in de ledenlijst blijven: nee', () => assertFails(updateDoc(doc(ld, 'speltakken/s1'), { memberIds: ['tl'] })));
await t('leiding: speltak verlaten', () => assertSucceeds(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: ['tl'] })));
await seed();
await t('leiding: speltak verlaten zoals de app (arrayRemove)', () => assertSucceeds(updateDoc(doc(ld, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: arrayRemove('ld') })));
await t('na verlaten: teamleider leest de speltak nog', () => assertSucceeds(getDoc(doc(as('tl', 'tl@t.nl'), 'speltakken/s1'))));

/* ---- teamleiders blijven in het team ---- */
await seed();
await t('enige teamleider haalt zichzelf niet uit memberIds', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { memberIds: ['ld'] })));
await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s1'), { tlIds: ['tl', 'tl2'], memberIds: ['tl', 'ld', 'tl2'], 'members.tl2': { name: 'TL2', email: 'tl2@t.nl', role: 'teamleider', perms: ALL, since: 1 } }));
await t('teamleider haalt mede-teamleider niet uit team', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.tl2': deleteField(), memberIds: ['tl', 'ld'] })));
await t('teamleider haalt zichzelf niet uit memberIds', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { memberIds: ['ld', 'tl2'] })));
// members en memberIds lopen niet uiteen: geen onzichtbare leden, geen mede-teamleider uit beeld
await t('teamleider voegt lid toe zonder members-regel: nee', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { memberIds: arrayUnion('ghost') })));
await t('teamleider wist members-regel van mede-teamleider: nee', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.tl2': deleteField() })));
await t('teamleider treedt af en zet iemand zonder members-regel in tlIds: nee', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.tl.role': 'leiding', memberIds: arrayUnion('ghost'), tlIds: ['tl2', 'ghost'] })));
await t('beheerder voegt lid toe zonder members-regel: nee', () => assertFails(updateDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1'), { memberIds: arrayUnion('ghost') })));
await t('beheerder wist members-regel en laat memberIds staan: nee', () => assertFails(updateDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1'), { 'members.ld': deleteField() })));
await t('beheerder hernoemt speltak (team ongewijzigd)', () => assertSucceeds(updateDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1'), { name: 'Scouts' })));
await t('teamleider voegt lid toe met members-regel', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.nw2': { name: 'NW2', email: 'nw2@t.nl', role: 'leiding', perms: NONE, since: 1 }, memberIds: arrayUnion('nw2') })));
await t('teamleider: leiding uit het team halen', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld': deleteField(), memberIds: arrayRemove('ld') })));
await t('teamleider: aftreden naast mede-teamleider', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.tl.role': 'leiding', tlIds: ['tl2'] })));
await t('mede-teamleider leest de speltak nog', () => assertSucceeds(getDoc(doc(as('tl2', 'tl2@t.nl'), 'speltakken/s1'))));

/* ---- rol overdragen: leiding met alle rechten, daarna draagt de teamleider zelf over ---- */
await seed();
await t('overdracht: teamleider nodigt opvolger uit als leiding', () => assertSucceeds(setDoc(doc(tl, 'invites/nTr'), inv({ email: 'opv@t.nl', perms: ALL, transfer: true }))));
const opv = as('opv', 'opv@t.nl');
await t('overdracht: opvolger treedt niet toe als teamleider', () => assertFails(joinB(opv, 'speltakken/s1', { 'members.opv': { name: 'O', email: 'opv@t.nl', role: 'teamleider', perms: ALL, inviteId: 'nTr', since: 1 }, memberIds: arrayUnion('opv'), tlIds: arrayUnion('opv') }, 'nTr', 'opv')));
await t('overdracht: opvolger treedt toe als leiding', () => assertSucceeds(joinB(opv, 'speltakken/s1', { 'members.opv': { name: 'O', email: 'opv@t.nl', role: 'leiding', perms: ALL, inviteId: 'nTr', since: 1 }, memberIds: arrayUnion('opv') }, 'nTr', 'opv')));
await t('overdracht: opvolger maakt zichzelf geen teamleider', () => assertFails(updateDoc(doc(opv, 'speltakken/s1'), { tlIds: arrayUnion('opv') })));
await t('overdracht: teamleider draagt zijn rol over', () => assertSucceeds(updateDoc(doc(tl, 'speltakken/s1'), { 'members.opv.role': 'teamleider', 'members.tl.role': 'leiding', tlIds: ['opv'] })));
await t('overdracht: oud-teamleider is geen teamleider meer', () => assertFails(updateDoc(doc(tl, 'speltakken/s1'), { 'members.ld.perms': ALL })));

/* ---- alleen recht Jaarplanning: planning wel, opkomsten niet (koppelen vraagt ook Opkomsten of Banken) ---- */
await seed();
await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s1'), { 'members.ld.perms': { ...NONE, plan: true } }));
await t('alleen jaarplanning: planning aanpassen', () => assertSucceeds(setDoc(doc(ld, 'speltakken/s1/planning/p1'), { date: '2026-11-07', opkId: null })));
await t('alleen jaarplanning: opkomst aanpassen niet', () => assertFails(setDoc(doc(ld, 'speltakken/s1/opkomsten/o1'), { title: 'y', state: 'planned' })));

/* ---- Banken en Opkomsten apart: de regels volgen de knoppen in de app ---- */
const asPerms = (perms) => env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s1'), { 'members.ld.perms': { ...NONE, ...perms } }));
const opk = (id) => doc(ld, 'speltakken/s1/opkomsten/' + id);
await seed();
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  for (const [id, state] of [['oP', 'planned'], ['oD', 'draft'], ['oD2', 'draft'], ['oD3', 'draft'], ['oB', 'bank'], ['oB2', 'bank'], ['oB3', 'bank']]) await setDoc(doc(db, 'speltakken/s1/opkomsten/' + id), { title: id, state });
  await setDoc(doc(db, 'speltakken/s1/activiteiten/a1'), { title: 'Spel' });
});
await asPerms({ bank: true });
await t('alleen banken: bank-opkomst bewerken', () => assertSucceeds(setDoc(opk('oB'), { title: 'Bank 2', state: 'bank' })));
await t('alleen banken: nieuwe opkomst in de bank', () => assertSucceeds(setDoc(opk('oN'), { title: 'Nieuw', state: 'bank' })));
await t('alleen banken: concept in de bank zetten', () => assertSucceeds(setDoc(opk('oD'), { title: 'oD', state: 'bank' })));
await t('alleen banken: ingeplande opkomst wijzigen niet', () => assertFails(setDoc(opk('oP'), { title: 'Hack', state: 'planned' })));
await t('alleen banken: ingeplande opkomst in de bank zetten niet', () => assertFails(setDoc(opk('oP'), { title: 'oP', state: 'bank' })));
await t('alleen banken: ingeplande opkomst verwijderen niet', () => assertFails(deleteDoc(opk('oP'))));
await t('alleen banken: concept aanpassen niet', () => assertFails(setDoc(opk('oD2'), { title: 'Hack', state: 'draft' })));
await t('alleen banken: concept aanmaken niet', () => assertFails(setDoc(opk('oN2'), { title: 'Nieuw', state: 'draft' })));
await t('alleen banken: bank-opkomst inplannen niet (vraagt ook Jaarplanning)', () => assertFails(setDoc(opk('oN3'), { title: 'Kopie', state: 'planned' })));
await t('alleen banken: concept verwijderen niet', () => assertFails(deleteDoc(opk('oD2'))));
await t('alleen banken: bank-opkomst verwijderen', () => assertSucceeds(deleteDoc(opk('oB2'))));
await t('alleen banken: activiteit bewaren', () => assertSucceeds(setDoc(doc(ld, 'speltakken/s1/activiteiten/a1'), { title: 'Spel 2' })));
await asPerms({ bank: true, plan: true });
await t('banken + jaarplanning: kopie uit de bank inplannen', () => assertSucceeds(setDoc(opk('oK'), { title: 'Kopie', state: 'planned' })));
await t('banken + jaarplanning: ingeplande opkomst ontkoppelen', () => assertSucceeds(setDoc(opk('oP'), { title: 'oP', state: 'draft' })));
await t('banken + jaarplanning: nieuwe opkomst in de bank', () => assertSucceeds(setDoc(opk('oN5'), { title: 'Nieuw', state: 'bank' })));
await t('banken + jaarplanning: nieuw concept aanmaken niet (vraagt Opkomsten)', () => assertFails(setDoc(opk('oN6'), { title: 'Leeg', state: 'draft' })));
await t('banken + jaarplanning: nieuwe opkomst zonder status niet', () => assertFails(setDoc(opk('oN7'), { title: 'Leeg' })));
await t('banken + jaarplanning: bank-opkomst bewerken', () => assertSucceeds(setDoc(opk('oB'), { title: 'Bank 3', state: 'bank' })));
await t('banken + jaarplanning: bank-opkomst zelf inplannen niet (een kopie wel)', () => assertFails(setDoc(opk('oB'), { title: 'Bank 3', state: 'planned' })));
await asPerms({ build: true });
await t('alleen opkomsten: ingeplande opkomst wijzigen', () => assertSucceeds(setDoc(opk('oK'), { title: 'Kopie 2', state: 'planned' })));
await t('alleen opkomsten: concept verwijderen', () => assertSucceeds(deleteDoc(opk('oD2'))));
await t('alleen opkomsten: nieuw concept aanmaken', () => assertSucceeds(setDoc(opk('oN8'), { title: 'Nieuw', state: 'draft' })));
await t('alleen opkomsten: kopie uit de bank als concept', () => assertSucceeds(setDoc(opk('oN9'), { title: 'Bank 3 (kopie)', state: 'draft', srcId: null })));
await t('alleen opkomsten: kopie uit de bank inplannen', () => assertSucceeds(setDoc(opk('oN10'), { title: 'Bank 3', state: 'planned', srcId: 'oB' })));
await t('alleen opkomsten: bank-opkomst bewerken niet', () => assertFails(setDoc(opk('oB'), { title: 'Hack', state: 'bank' })));
await t('alleen opkomsten: bank-opkomst uit de bank halen niet', () => assertFails(setDoc(opk('oB'), { title: 'Bank 3', state: 'draft' })));
await t('alleen opkomsten: bank-opkomst verwijderen niet', () => assertFails(deleteDoc(opk('oB'))));
await t('alleen opkomsten: bank-opkomst aanmaken niet', () => assertFails(setDoc(opk('oN11'), { title: 'Nieuw', state: 'bank' })));
await t('alleen opkomsten: concept in de bank zetten niet', () => assertFails(setDoc(opk('oD3'), { title: 'oD3', state: 'bank' })));
await t('alleen opkomsten: ingeplande opkomst in de bank zetten niet', () => assertFails(setDoc(opk('oK'), { title: 'Kopie 2', state: 'bank' })));
await t('alleen opkomsten: activiteit bewaren niet', () => assertFails(setDoc(doc(ld, 'speltakken/s1/activiteiten/a1'), { title: 'Hack' })));
await t('alleen opkomsten: nieuwe activiteit niet', () => assertFails(setDoc(doc(ld, 'speltakken/s1/activiteiten/a2'), { title: 'Nieuw' })));
await t('alleen opkomsten: activiteit verwijderen niet', () => assertFails(deleteDoc(doc(ld, 'speltakken/s1/activiteiten/a1'))));
await asPerms({ build: true, bank: true });
await t('opkomsten + banken: bank-opkomst bewerken', () => assertSucceeds(setDoc(opk('oB'), { title: 'Bank 4', state: 'bank' })));
await t('opkomsten + banken: concept in de bank zetten', () => assertSucceeds(setDoc(opk('oD3'), { title: 'oD3', state: 'bank' })));
await t('opkomsten + banken: nieuwe opkomst in de bank', () => assertSucceeds(setDoc(opk('oN12'), { title: 'Nieuw', state: 'bank' })));
await t('opkomsten + banken: ingeplande opkomst wijzigen', () => assertSucceeds(setDoc(opk('oK'), { title: 'Kopie 3', state: 'planned', srcId: 'oB' })));
await t('opkomsten + banken: bank-opkomst verwijderen', () => assertSucceeds(deleteDoc(opk('oB3'))));
await t('beheerder groep: bank-opkomst verwijderen', () => assertSucceeds(deleteDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1/opkomsten/oN12'))));
await t('beheerder groep: activiteit verwijderen', () => assertSucceeds(deleteDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1/activiteiten/a1'))));

/* ---- uitnodigingen accepteren ---- */
await seed();
const nw = as('nw', 'new@t.nl');
const mem = (role, inviteId, perms) => ({ name: 'N', email: 'x', role, perms, inviteId, since: 1 });
const ldJoin = (who, role, id = 'iLd', perms = NONE) => ({ ['members.' + who]: mem(role, id, perms), memberIds: arrayUnion(who) });
await t('accepteren leiding met ander e-mailadres niet', () => assertFails(joinB(as('zz', 'zz@t.nl'), 'speltakken/s1', ldJoin('zz', 'leiding'), 'iLd', 'zz')));
await t('accepteren leiding met onbevestigd e-mailadres niet', () => assertFails(joinB(unv('nw', 'new@t.nl'), 'speltakken/s1', ldJoin('nw', 'leiding'), 'iLd', 'nw')));
await t('accepteren leiding als teamleider niet', () => assertFails(joinB(nw, 'speltakken/s1', ldJoin('nw', 'teamleider'), 'iLd', 'nw')));
await t('toetreden zonder de uitnodiging als gebruikt te markeren: nee', () => assertFails(updateDoc(doc(nw, 'speltakken/s1'), ldJoin('nw', 'leiding'))));
await t('accepteren leiding', () => assertSucceeds(joinB(nw, 'speltakken/s1', ldJoin('nw', 'leiding'), 'iLd', 'nw')));
await t('opnieuw toetreden met dezelfde uitnodiging: nee', async () => {
  await assertSucceeds(updateDoc(doc(as('tl', 'tl@t.nl'), 'speltakken/s1'), { 'members.nw': deleteField(), memberIds: arrayRemove('nw') }));
  await assertFails(joinB(nw, 'speltakken/s1', ldJoin('nw', 'leiding'), 'iLd', 'nw'));
  await assertFails(updateDoc(doc(nw, 'speltakken/s1'), ldJoin('nw', 'leiding')));
});
const nt = as('nt', 'newtl@t.nl');
await t('uitnodiging als gebruikt markeren met onbevestigd e-mailadres: nee', () => assertFails(updateDoc(doc(unv('nt', 'newtl@t.nl'), 'invites/iTl'), { usedBy: 'nt' })));
await t('accepteren teamleider zonder tlIds niet', () => assertFails(joinB(nt, 'speltakken/s1', ldJoin('nt', 'teamleider', 'iTl', ALL), 'iTl', 'nt')));
await t('accepteren teamleider', () => assertSucceeds(joinB(nt, 'speltakken/s1', { ...ldJoin('nt', 'teamleider', 'iTl', ALL), tlIds: arrayUnion('nt') }, 'iTl', 'nt')));
const ol = as('ol', 'old@t.nl');
await t('oude uitnodiging oude speltak: met tlIds niet', () => assertFails(joinB(ol, 'speltakken/s0', { ...ldJoin('ol', 'teamleider', 'iOld', ALL), tlIds: arrayUnion('ol') }, 'iOld', 'ol')));
await t('oude uitnodiging oude speltak: zonder tlIds', () => assertSucceeds(joinB(ol, 'speltakken/s0', ldJoin('ol', 'teamleider', 'iOld', ALL), 'iOld', 'ol')));
await t('verlopen uitnodiging niet', () => assertFails(joinB(as('lt', 'late@t.nl'), 'speltakken/s1', ldJoin('lt', 'leiding', 'iExp'), 'iExp', 'lt')));
const g2 = as('ga2', 'ga2@t.nl');
const gaJoin = { 'admins.ga2': { name: 'G', email: 'ga2@t.nl', since: 1, inviteId: 'iGa' }, adminIds: arrayUnion('ga2') };
await t('beheer groep: toetreden zonder markeren niet', () => assertFails(updateDoc(doc(g2, 'groepen/g1'), gaJoin)));
await t('accepteren beheer groep', () => assertSucceeds(joinB(g2, 'groepen/g1', gaJoin, 'iGa', 'ga2')));
await t('beheer groep met leiding-uitnodiging niet', () => assertFails(joinB(nw, 'groepen/g1', { 'admins.nw': { name: 'G', email: 'x', since: 1, inviteId: 'iLd' }, adminIds: arrayUnion('nw') }, 'iLd', 'nw')));
const r2 = as('r2', 'r2@t.nl');
const rootJoin = { 'people.r2': { name: 'R', email: 'r2@t.nl', since: 1, inviteId: 'iRoot' }, ids: arrayUnion('r2') };
await t('beheer totaal: toetreden zonder markeren niet', () => assertFails(updateDoc(doc(r2, 'beheer/totaal'), rootJoin)));
await t('accepteren beheer totaal', () => assertSucceeds(joinB(r2, 'beheer/totaal', rootJoin, 'iRoot', 'r2')));
await t('nieuwe beheer totaal leest alles', () => assertSucceeds(getDocs(collection(r2, 'speltakken'))));
await seed();
await t('uitnodiging als gebruikt markeren', () => assertSucceeds(updateDoc(doc(nw, 'invites/iLd'), { usedBy: 'nw' })));
await t('beheer groep: opnieuw toetreden met dezelfde uitnodiging niet', async () => {
  await assertSucceeds(joinB(g2, 'groepen/g1', gaJoin, 'iGa', 'ga2'));
  await assertSucceeds(updateDoc(doc(ga, 'groepen/g1'), { 'admins.ga2': deleteField(), adminIds: ['ga'] }));
  await assertFails(joinB(g2, 'groepen/g1', gaJoin, 'iGa', 'ga2'));
});

/* ---- oude speltak (nog niet gekoppeld) blijft werken ---- */
await seed();
const otl = as('otl', 'otl@t.nl');
await t('oud: teamleider leest eigen speltak', () => assertSucceeds(getDoc(doc(otl, 'speltakken/s0'))));
await t('oud: teamleider nodigt leiding uit', () => assertSucceeds(setDoc(doc(otl, 'invites/n20'), inv({ sid: 's0', gid: null, invitedBy: 'otl' }))));
await t('oud: speltak zonder gid: groepsnaam wel aanpassen', () => assertSucceeds(updateDoc(doc(otl, 'speltakken/s0'), { groupName: 'Oude groep nieuw', 'settings.accent': 'blauw' })));
await t('oud: teamleider legt tlIds vast', () => assertSucceeds(updateDoc(doc(otl, 'speltakken/s0'), { tlIds: ['otl'] })));
await t('oud: groep-beheerder ziet hem niet', () => assertFails(getDoc(doc(ga, 'speltakken/s0'))));
await t('mijn speltakken lijsten', () => assertSucceeds(getDocs(query(collection(otl, 'speltakken'), where('memberIds', 'array-contains', 'otl')))));

/* ---- groepsbank (opkomsten delen binnen de groep) ---- */
await seed();
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  const BANK = { plan: false, build: false, bank: true, settings: false };
  const BUILD = { plan: false, build: true, bank: false, settings: false };
  await setDoc(doc(db, 'speltakken/s2'), { name: 'Welpen', groupName: 'G1', gid: 'g1', createdBy: 'ga', settings: {}, tlIds: [], memberIds: ['w', 'wn', 'wb'],
    members: { w: { name: 'W', email: 'w@t.nl', role: 'leiding', perms: BANK, since: 1 }, wn: { name: 'WN', email: 'wn@t.nl', role: 'leiding', perms: NONE, since: 1 },
      wb: { name: 'WB', email: 'wb@t.nl', role: 'leiding', perms: BUILD, since: 1 } } });
  await setDoc(doc(db, 'speltakken/s3'), { name: 'Anders', groupName: 'G2', gid: 'g2', createdBy: 'root', settings: {}, tlIds: ['z'], memberIds: ['z'],
    members: { z: { name: 'Z', email: 'z@t.nl', role: 'teamleider', perms: ALL, since: 1 } } });
});
const snapOf = (sid, oid, extra = {}) => ({ sid, oid, speltakName: 'S', catDefs: [], opk: { title: 'Bos', lead: '', blocks: [] }, updatedAt: 1, ...extra });
const tl1 = as('tl', 'tl@t.nl'), w = as('w', 'w@t.nl'), wn = as('wn', 'wn@t.nl'), z = as('z', 'z@t.nl'), ld1 = as('ld', 'ld@t.nl');
await t('groepsbank: lid legt groepslidmaatschap vast', () => assertSucceeds(setDoc(doc(tl1, 'groepen/g1/leden/tl'), { sid: 's1', since: 1 })));
await t('groepsbank: lidmaatschap met speltak van andere groep niet', () => assertFails(setDoc(doc(z, 'groepen/g1/leden/z'), { sid: 's3', since: 1 })));
await t('groepsbank: lidmaatschap via speltak waar je niet in zit niet', () => assertFails(setDoc(doc(z, 'groepen/g1/leden/z'), { sid: 's1', since: 1 })));
await t('groepsbank: lidmaatschap voor een ander niet', () => assertFails(setDoc(doc(tl1, 'groepen/g1/leden/ld'), { sid: 's1', since: 1 })));
await t('groepsbank: teamleider deelt opkomst', () => assertSucceeds(setDoc(doc(tl1, 'groepen/g1/gedeeld/s1_o1'), snapOf('s1', 'o1'))));
await t('groepsbank: delen met verkeerd id niet', () => assertFails(setDoc(doc(tl1, 'groepen/g1/gedeeld/xx'), snapOf('s1', 'o2'))));
await t('groepsbank: delen met eindverantwoordelijke niet', () => assertFails(setDoc(doc(tl1, 'groepen/g1/gedeeld/s1_o3'), snapOf('s1', 'o3', { opk: { title: 'x', lead: 'Piet' } }))));
await t('groepsbank: delen in andere groep niet', () => assertFails(setDoc(doc(tl1, 'groepen/g2/gedeeld/s1_o1'), snapOf('s1', 'o1'))));
await t('groepsbank: leiding zonder recht deelt niet', () => assertFails(setDoc(doc(ld1, 'groepen/g1/gedeeld/s1_o4'), snapOf('s1', 'o4'))));
await t('groepsbank: leiding met recht Banken deelt', () => assertSucceeds(setDoc(doc(w, 'groepen/g1/gedeeld/s2_o9'), snapOf('s2', 'o9'))));
// de opkomstenbank hoort bij Banken: met alleen Opkomsten niets in de groepsbank aanmaken, overschrijven of weghalen
const wb = as('wb', 'wb@t.nl');
await t('groepsbank: alleen Opkomsten deelt niet', () => assertFails(setDoc(doc(wb, 'groepen/g1/gedeeld/s2_o8'), snapOf('s2', 'o8'))));
await t('groepsbank: alleen Opkomsten overschrijft niet', () => assertFails(setDoc(doc(wb, 'groepen/g1/gedeeld/s2_o9'), snapOf('s2', 'o9', { updatedAt: 5, opk: { title: 'Anders', lead: '', blocks: [] } }), { merge: true })));
await t('groepsbank: alleen Opkomsten verwijdert niet', () => assertFails(deleteDoc(doc(wb, 'groepen/g1/gedeeld/s2_o9'))));
await t('groepsbank: leiding met recht Banken werkt bij en haalt weg', async () => {
  await assertSucceeds(setDoc(doc(w, 'groepen/g1/gedeeld/s2_o7'), snapOf('s2', 'o7')));
  await assertSucceeds(setDoc(doc(w, 'groepen/g1/gedeeld/s2_o7'), snapOf('s2', 'o7', { updatedAt: 2 }), { merge: true }));
  await assertSucceeds(deleteDoc(doc(w, 'groepen/g1/gedeeld/s2_o7')));
});
await t('groepsbank: andere speltak overschrijft niet', () => assertFails(setDoc(doc(w, 'groepen/g1/gedeeld/s1_o1'), snapOf('s1', 'o1', { updatedAt: 2 }))));
await t('groepsbank: lezen zonder lidmaatschap niet', () => assertFails(getDocs(collection(wn, 'groepen/g1/gedeeld'))));
await t('groepsbank: lid legt vast en leest', async () => { await assertSucceeds(setDoc(doc(wn, 'groepen/g1/leden/wn'), { sid: 's2', since: 1 })); await assertSucceeds(getDocs(collection(wn, 'groepen/g1/gedeeld'))); });
await t('groepsbank: andere groep leest niet', async () => { await setDoc(doc(z, 'groepen/g2/leden/z'), { sid: 's3', since: 1 }); await assertFails(getDocs(collection(z, 'groepen/g1/gedeeld'))); });
await t('groepsbank: beheerder groep leest', () => assertSucceeds(getDocs(collection(ga, 'groepen/g1/gedeeld'))));
await t('groepsbank: kopiëren telt +1', () => assertSucceeds(updateDoc(doc(wn, 'groepen/g1/gedeeld/s1_o1'), { copies: 1 })));
await t('groepsbank: teller +5 niet', () => assertFails(updateDoc(doc(wn, 'groepen/g1/gedeeld/s1_o1'), { copies: 6 })));
await t('groepsbank: lid wijzigt inhoud niet', () => assertFails(updateDoc(doc(wn, 'groepen/g1/gedeeld/s1_o1'), { 'opk.title': 'Hack' })));
await t('groepsbank: eigenaar werkt bij (teller blijft)', () => assertSucceeds(setDoc(doc(tl1, 'groepen/g1/gedeeld/s1_o1'), snapOf('s1', 'o1', { updatedAt: 3 }), { merge: true })));
await t('groepsbank: eigenaar zet teller niet terug', () => assertFails(setDoc(doc(tl1, 'groepen/g1/gedeeld/s1_o1'), { ...snapOf('s1', 'o1'), copies: 0 }, { merge: true })));
await t('groepsbank: andere speltak verwijdert niet', () => assertFails(deleteDoc(doc(w, 'groepen/g1/gedeeld/s1_o1'))));
await t('groepsbank: eigenaar haalt delen weg', () => assertSucceeds(deleteDoc(doc(tl1, 'groepen/g1/gedeeld/s1_o1'))));
await t('groepsbank: wie de speltak verlaat leest niet meer', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'speltakken/s2'), { memberIds: ['w'] }));
  await assertFails(getDocs(collection(wn, 'groepen/g1/gedeeld')));
});

/* ---- accounts, direct toevoegen, verwijderen ---- */
await seed();
await t('account: niet met onbevestigd e-mailadres', () => assertFails(setDoc(doc(unv('x', 'x@t.nl'), 'accounts/x@t.nl'), { uid: 'x', name: 'X', email: 'x@t.nl', updatedAt: 1 })));
await t('account: eigen account opslaan', () => assertSucceeds(setDoc(doc(as('x', 'x@t.nl'), 'accounts/x@t.nl'), { uid: 'x', name: 'X', email: 'x@t.nl', updatedAt: 1 })));
await t('account: andermans e-mailadres niet', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'accounts/y@t.nl'), { uid: 'x', name: 'X', email: 'y@t.nl', updatedAt: 1 })));
await t('account: met andere uid niet', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'accounts/x@t.nl'), { uid: 'tl', name: 'X', email: 'x@t.nl', updatedAt: 1 })));
await t('account: opzoeken met account', () => assertSucceeds(getDoc(doc(as('tl', 'tl@t.nl'), 'accounts/x@t.nl'))));
await t('account: opzoeken zonder account niet', () => assertFails(getDoc(doc(anon(), 'accounts/x@t.nl'))));
await t('account: lijst niet', () => assertFails(getDocs(collection(as('tl', 'tl@t.nl'), 'accounts'))));
const ga3 = as('ga', 'ga@t.nl'), tl3 = as('tl', 'tl@t.nl');
await t('groep: bestaand account direct als leiding', () => assertSucceeds(updateDoc(doc(ga3, 'speltakken/s1'), { 'members.x': { name: 'X', email: 'x@t.nl', role: 'leiding', perms: NONE, since: 1 }, memberIds: arrayUnion('x') })));
await t('teamleider: bestaand account direct als leiding', () => assertSucceeds(updateDoc(doc(tl3, 'speltakken/s1'), { 'members.y': { name: 'Y', email: 'y@t.nl', role: 'leiding', perms: NONE, since: 1 }, memberIds: arrayUnion('y') })));
await t('groep: teamleider vervangen door opvolger', () => assertSucceeds(updateDoc(doc(ga3, 'speltakken/s1'), { 'members.tl': deleteField(), 'members.ld.role': 'teamleider', memberIds: ['ld', 'x', 'y'], tlIds: ['ld'] })));
await seed();
await t('teamleider: speltak verwijderen niet', () => assertFails(deleteDoc(doc(as('tl', 'tl@t.nl'), 'speltakken/s1'))));
await t('teamleider: opkomst verwijderen mag (bouwen)', () => assertSucceeds(deleteDoc(doc(as('tl', 'tl@t.nl'), 'speltakken/s1/opkomsten/o1'))));
await seed();
await t('andere groep: speltak verwijderen niet', () => assertFails(deleteDoc(doc(as('zz', 'zz@t.nl'), 'speltakken/s1'))));
await t('groep: inhoud speltak verwijderen', () => assertSucceeds(deleteDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1/opkomsten/o1'))));
await t('groep: speltak verwijderen', () => assertSucceeds(deleteDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s1'))));
await t('groep: inhoud nog steeds niet bewerken', () => assertFails(setDoc(doc(as('ga', 'ga@t.nl'), 'speltakken/s0/opkomsten/o2'), { title: 'y' })));

/* ---- namen uniek per groep ---- */
await seed();
await t('namen: vrij controleren zonder account', () => assertSucceeds(getDoc(doc(anon(), 'groepen/g1/namen/akela'))));
await t('namen: zonder uitnodiging of lidmaatschap niet', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'groepen/g1/namen/akela'), { uid: 'x', name: 'Akela' })));
await t('namen: met uitnodiging, e-mail niet bevestigd, niet', () => assertFails(setDoc(doc(unv('nw', 'new@t.nl'), 'groepen/g1/namen/akela'), { uid: 'nw', name: 'Akela', inviteId: 'iLd' })));
await t('namen: met uitnodiging voor andere groep niet', () => assertFails(setDoc(doc(as('nw', 'new@t.nl'), 'groepen/g2/namen/akela'), { uid: 'nw', name: 'Akela', inviteId: 'iLd' })));
await t('namen: met andermans uitnodiging niet', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'groepen/g1/namen/akela'), { uid: 'x', name: 'Akela', inviteId: 'iLd' })));
await t('namen: te lange naam niet', () => assertFails(setDoc(doc(as('nw', 'new@t.nl'), 'groepen/g1/namen/lang'), { uid: 'nw', name: 'x'.repeat(61), inviteId: 'iLd' })));
await t('namen: eigen naam vastleggen met uitnodiging', () => assertSucceeds(setDoc(doc(as('nw', 'new@t.nl'), 'groepen/g1/namen/akela'), { uid: 'nw', name: 'Akela', inviteId: 'iLd' })));
await t('namen: eigen naam vastleggen als lid van de groep', async () => {
  const ld = as('ld', 'ld@t.nl');
  await assertSucceeds(setDoc(doc(ld, 'groepen/g1/leden/ld'), { sid: 's1' }));
  await assertSucceeds(setDoc(doc(ld, 'groepen/g1/namen/kaa'), { uid: 'ld', name: 'Kaa' }));
});
await t('namen: bezette naam niet overnemen', () => assertFails(setDoc(doc(as('y', 'y@t.nl'), 'groepen/g1/namen/akela'), { uid: 'y', name: 'Akela' })));
await t('namen: voor een ander niet (geen beheerder)', () => assertFails(setDoc(doc(as('x', 'x@t.nl'), 'groepen/g1/namen/baloe'), { uid: 'y', name: 'Baloe' })));
await t('namen: beheerder legt vast voor een ander', () => assertSucceeds(setDoc(doc(as('ga', 'ga@t.nl'), 'groepen/g1/namen/baloe'), { uid: 'y', name: 'Baloe' })));
await t('namen: andere groep mag dezelfde naam', () => assertSucceeds(setDoc(doc(as('root', ROOT), 'groepen/g2/namen/akela'), { uid: 'z', name: 'Akela' })));
await t('namen: lijst alleen beheerder', async () => { await assertFails(getDocs(collection(as('x', 'x@t.nl'), 'groepen/g1/namen'))); await assertSucceeds(getDocs(collection(as('ga', 'ga@t.nl'), 'groepen/g1/namen'))); });
await t('namen: ander verwijdert niet', () => assertFails(deleteDoc(doc(as('y', 'y@t.nl'), 'groepen/g1/namen/akela'))));
await t('namen: beheerder geeft vrij', () => assertSucceeds(deleteDoc(doc(as('ga', 'ga@t.nl'), 'groepen/g1/namen/akela'))));

/* ---- groep verwijderen: groepsleden opruimen ---- */
await seed();
await setDoc(doc(as('tl', 'tl@t.nl'), 'groepen/g1/leden/tl'), { sid: 's1', since: 1 });
await t('groep weg: lid ziet ledenlijst niet', () => assertFails(getDocs(collection(as('tl', 'tl@t.nl'), 'groepen/g1/leden'))));
await t('groep weg: ander verwijdert groepslid niet', () => assertFails(deleteDoc(doc(as('z', 'z@t.nl'), 'groepen/g1/leden/tl'))));
await t('groep weg: Beheer totaal leest ledenlijst', () => assertSucceeds(getDocs(collection(as('root', ROOT), 'groepen/g1/leden'))));
await t('groep weg: Beheer totaal ruimt groepslid op', () => assertSucceeds(deleteDoc(doc(as('root', ROOT), 'groepen/g1/leden/tl'))));
await t('groep weg: Beheer totaal verwijdert de groep', () => assertSucceeds(deleteDoc(doc(as('root', ROOT), 'groepen/g1'))));
await t('groep weg: beheerder groep verwijdert de groep niet', async () => { await seed(); await assertFails(deleteDoc(doc(as('ga', 'ga@t.nl'), 'groepen/g1'))); });

await env.cleanup();
console.log(`\n${n - fails}/${n} geslaagd`);
process.exit(fails ? 1 : 0);
