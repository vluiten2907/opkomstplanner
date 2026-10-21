# Opkomstplanner

Webapp voor scoutinggroepen om opkomsten, weekendkampen en de jaarplanning per speltak te plannen.
React + TypeScript + Vite; gegevens en accounts in Firebase (Firestore + Authentication); gehost op Strato onder **https://conqueston.nl/opkomst/**.

**Structuur**

- Een **speltak** is de werkruimte (bijv. "Vaandrig Leppinkgroep · Scouts"). Alles in de planner hoort bij één speltak.
- Wie een speltak aanmaakt is er **teamleider** en mag alles, inclusief het team beheren.
- De teamleider nodigt **leiding** uit per e-mail. Per persoon stel je rechten in: Jaarplanning, Opkomsten, Banken, Instellingen. Iedereen in het team kan alles bekijken.
- Eén account kan lid zijn van meerdere speltakken, met per speltak een eigen rol. Wisselen via het menu rechtsboven.

## Eenmalig: Firebase inrichten (±10 minuten)

1. <https://console.firebase.google.com> → **Project toevoegen** (bijv. `opkomstplanner`). Google Analytics mag uit.
2. **Build → Authentication → Get started → Sign-in method**: zet **E-mail/wachtwoord** aan.
3. **Authentication → Settings → Authorized domains → Add domain**: `conqueston.nl`.
4. **Build → Firestore Database → Database maken**: *production mode*, locatie `europe-west4` (Nederland).
5. **Firestore → Rules**: plak de inhoud van `firestore.rules` en klik **Publish**. (Of met de CLI: `firebase deploy --only firestore:rules`.)
6. **Projectinstellingen (tandwiel) → Je apps → `</>` Web-app**: naam "Opkomstplanner", Hosting niet nodig. De `firebaseConfig` van het live project staat al in `.env.production`.

## Live zetten op Strato (conqueston.nl/opkomst)

De app is statische bestanden; een `.htaccess` in `public/` stuurt alle routes naar `index.html`. De build staat standaard op pad `/opkomst/`.

**Automatisch via GitHub (aanbevolen)** — elke push naar `main` bouwt de app en zet hem via SFTP op Strato.

1. In de GitHub-repo: **Settings → Secrets and variables → Actions → New repository secret**, maak aan:
   - `STRATO_SFTP_HOST`: de SFTP-server uit het Strato-klantmenu (*Hosting → SFTP/SSH*), bijv. `ssh.strato.de`
   - `STRATO_SFTP_USER` en `STRATO_SFTP_PASSWORD`: je SFTP-login
   - `STRATO_DIR`: de map op de server die bij `conqueston.nl/opkomst/` hoort. Staat conqueston.nl in de hoofdmap, dan `/opkomst`; staat het domein in een eigen map (bijv. `/conqueston`), dan `/conqueston/opkomst`. De hoofdmap zelf wordt geweigerd, zodat de rest van je site nooit overschreven wordt.
   - optioneel `STRATO_SFTP_PORT` als het niet 22 is.
2. Push naar `main` (of **Actions → Deploy naar Strato → Run workflow**). Na een minuut staat de app op <https://conqueston.nl/opkomst/>.

**Handmatig** — `npm install`, `npm run build` (de Firebase-config staat al in `.env.production`), en upload de inhoud van `dist/` (inclusief het verborgen bestand `.htaccess`) naar de map `opkomst` van conqueston.nl.

Let op bij Strato: als de map `opkomst` al een eigen `.htaccess` heeft, vervang die door de meegeleverde. Werkt een link als `conqueston.nl/opkomst/jaarplanning` niet na een refresh, dan is `mod_rewrite` niet actief of ontbreekt `.htaccess`.

## Eerste account en eerste speltak

1. Ga naar <https://conqueston.nl/opkomst/registreren>, vul naam, e-mail en wachtwoord in.
2. Klik **Nieuwe speltak als teamleider**: groepsnaam, speltak, vaste opkomstdag, standaardtijden, kleur. Je bent nu teamleider van die speltak.
3. **Team & instellingen → Leiding uitnodigen**: e-mailadres, rol en rechten → **Uitnodigingslink maken**. Kopieer of mail de link. De genodigde maakt met dat e-mailadres een account en klikt **Toetreden**.
4. Gegevens uit de losse (offline) Opkomstplanner? Daar **Instellingen → Back-up maken**, hier **Instellingen → Back-up terugzetten**.

Registreren staat open voor iedereen met het adres: zo kan een andere groep zelf een speltak beginnen zonder dat jij iets hoeft te doen. Ieder ziet alleen de speltakken waar hij lid van is.

## Lokaal ontwikkelen

Node 20 of nieuwer.

```bash
npm install
npm run dev        # echte Firebase, met .env ingevuld, op http://localhost:5173
npm run demo       # zonder Firebase: nep-database in de browser, handig om rond te klikken
npm run build      # productie-build in dist/ (pad /opkomst/)
```

## Projectstructuur

```
src/
  lib/        model (types, normalisatie, analyse, seizoen), tijdhelpers, pdf, export, firebase-init
  store/      auth (AuthProvider), speltak (SpeltakProvider: realtime data + rechten), toast, modal
  components/ Layout, ui (Modal, TimePicker, Chip…), shared (Strip, StatusPill…), modals (Datum, Koppelen, Overnemen…)
  pages/      Auth, Invite, Speltakken, Dashboard, Jaarplanning, Bouwer, Activiteitenbank, Opkomstenbank, Instellingen
public/.htaccess      routes naar index.html op Strato (Apache)
firestore.rules       beveiligingsregels
.github/workflows/    deploy naar Strato (main) en bouwcontrole (pull requests)
test/fake-firebase.ts nep-Firebase voor npm run demo
```

### Datamodel (Firestore)

```
users/{uid}                        { name, email, speltakIds[] }
speltakken/{sid}                   { name, groupName, settings, members: { uid: { name, email, role, perms } }, memberIds[] }
speltakken/{sid}/opkomsten/{id}    opkomst of kamp (state: draft | bank | planned)
speltakken/{sid}/activiteiten/{id} activiteit uit de activiteitenbank
speltakken/{sid}/planning/{id}     datum in de jaarplanning (onderwerp, planners, afwezig, brief, gekoppelde opkomst)
invites/{token}                    { sid, email, role, perms, invitedBy, usedBy }
```

De regels zorgen ervoor dat alleen leden van een speltak de gegevens ervan lezen, schrijven per onderdeel aan rechten gebonden is, alleen een teamleider leden en uitnodigingen beheert, en een uitnodiging alleen werkt voor het opgegeven e-mailadres en maar één keer.

Het gratis Spark-plan van Firebase is ruim voldoende (50.000 leesacties en 20.000 schrijfacties per dag). Logo's worden verkleind (max 256 px) in het speltakdocument opgeslagen; er is geen Storage nodig.
