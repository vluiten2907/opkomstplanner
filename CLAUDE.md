# Opkomstplanner — instructies voor Claude

Planner voor scoutinggroepen: jaarplanning, opkomstbouwer (tijdlijn per 5 min), weekendkampen, activiteiten- en opkomstenbank, pdf, teams per speltak.
Live op **https://conqueston.nl/opkomst/**. Repo `vluiten2907/opkomstplanner`. Eigenaar: Vincent Luiten.
Alle communicatie, teksten in de app, PR's en commitberichten in het **Nederlands**. Vincent wil kort en to-the-point.

Lees aan het begin van elke sessie **`docs/plan.md`** (werkwijze en stappen) en **`docs/voortgang.md`** (wat al klaar is).

## Rollen

**Coördinator** (start met `/coordinator`): bewaakt het geheel en bouwt zelf niet.
- Zet nieuwe wensen van Vincent om in afgebakende stappen in `docs/plan.md`: doel, wat wel/niet, acceptatie, "Wat te testen".
- Geeft per stap de regel waarmee Vincent een nieuwe implementatie-sessie (thread) start, bijv. `/stap 1.3`.
- Controleert PR's van threads op de regels hieronder, CI en "Wat te testen", en zegt Vincent of hij kan mergen. Na een merge controleert de coördinator de live site.
- Wijzigingen aan de plan- en voortgangsdocumenten gaan ook via een branch en PR.

**Thread / implementatie-sessie** (start met `/stap <nummer>`): voert precies één stap uit.
- Eén sessie = één branch `claude/<stap>-<korte-naam>` = één PR = één afgeronde stap. Geen extra functies erbij; zie je iets anders, noteer het in de PR onder "Gezien, niet gedaan".
- `npm run check` moet groen zijn. Nieuwe functies krijgen een controle in `test/e2e/smoke.py`. Bij UI-wijzigingen: screenshot op desktop én 390 px breed bekijken.
- Werk in dezelfde PR `docs/voortgang.md` bij: vinkje, datum en PR-nummer.
- PR-beschrijving: wat er is gedaan, en een lijst **"Wat te testen"** (stappen die Vincent op conqueston.nl/opkomst kan klikken zonder de code te lezen). Raakt de stap `firestore.rules`, zet dan bovenaan **"Regels publiceren"** met de volledige nieuwe regels.

## Uitrol
- **Nooit direct naar `main` pushen** (ook niet geforceerd): altijd branch + PR. Vincent merget; een merge naar `main` zet de app via GitHub Actions (SFTP) live op Strato. GitHub Free kan `main` in een privé-repo niet afschermen, dus deze regel en de weigering in `.claude/settings.json` zijn de bescherming.
- `firestore.rules` gaat **niet** automatisch live: Vincent publiceert regels zelf in de Firebase-console (Firestore → Rules → Publish).
- Nooit wachtwoorden of tokens in code, commits of logs. SFTP-gegevens staan alleen in GitHub Secrets. De Firebase-webconfig in `.env.production` is niet geheim.
- Typ nooit wachtwoorden op de live site en maak daar geen accounts aan; Vincent logt zelf in. Live controleren (laden, consolefouten, routes) mag via de ingebouwde browser op Vincents laptop.

## Techniek
- React 19 + TypeScript + Vite, Tailwind 3 (preflight uit; de stijl zit grotendeels in `src/styles.css`), react-router 6 met `basename` uit `import.meta.env.BASE_URL`, zustand, lucide-react, jsPDF.
- Firebase: Auth (e-mail/wachtwoord) + Firestore, project `opkomstplanner`. Geen Firebase Hosting.
- Hosting: Strato (Apache). `public/.htaccess` stuurt alle routes naar `index.html`. Build-pad `/opkomst/` (`vite.config.ts`, `VITE_BASE`).
- Workflows: `deploy.yml` (merge naar `main` → bouwen, testen, SFTP naar `STRATO_DIR`), `check.yml` (elke PR/branch: typecheck, build, rooktest).
- Cloud-sessies: npm-pakketten installeert `scripts/claude-session-start.sh` (SessionStart-hook). De live Firebase is vanuit de cloud niet bereikbaar; alle tests draaien tegen de nep-Firebase (`test/fake-firebase.ts`).

```
src/lib/model.ts      types, normalisatie, analyse (aandachtspunten), seizoen, lanesLayout — pure functies
src/lib/time.ts       tijd/datum-helpers (minuten sinds middernacht, ISO-datums, NL-notatie)
src/lib/pdf.ts        pdf-opbouw (jsPDF); export.ts: download + makePdf
src/store/speltak.tsx realtime data per speltak, optimistisch opslaan (debounce 500 ms), rechten (can/isTL), koppelen aan jaarplanning
src/store/auth.tsx    login/registratie
src/components/       Layout, ui (Modal, TimePicker, Chip, ConfirmBtn), shared, modals (Datum, Koppelen, Inplannen, Overnemen/Leiding indelen)
src/pages/            Auth, Invite, Speltakken, Dashboard, Jaarplanning, Bouwer, Activiteitenbank, Opkomstenbank, Instellingen
test/e2e/             rooktest (Playwright, Python) tegen de demo-build
```

```bash
npm ci
npm run demo      # app met nep-Firebase, geen account nodig
npm run check     # typecheck + build + rooktest — moet groen zijn vóór elke PR
npm run build     # productie-build in dist/ voor /opkomst/
```

## Harde regels (gedrag dat niet mag breken)
- **Opkomstenbank bevat geen namen** en geen eindverantwoordelijke. Inplannen vanuit de bouwer houdt leiding en eindverantwoordelijke; een kopie uit de bank wordt zonder namen ingepland en opent "Opkomst overnemen".
- **Afwezige leiding** (jaarplanning) kan niet worden ingedeeld en wordt automatisch uit de indeling gehaald (`dropAbsent`).
- Minimaal leiding van een opkomst = hoogste `minLeaders` van de niet-vaste onderdelen.
- Vaste blokken (`__open`, `__ranja`, `__close`) alleen bij gewone opkomsten (instelbaar), schuiven mee met begin/eind.
- Tijden in minuten; kampdagen mogen tot 26:00 (na middernacht).
- **Rechten**: teamleider alles; leiding per recht `plan` (jaarplanning), `build` (opkomsten), `bank` (banken), `settings`. Lezen mag elk lid. De UI blokkeert, `firestore.rules` dwingt af — nieuwe schrijfacties altijd in beide regelen.
- **Datamodel**: bestaande velden in Firestore niet hernoemen of anders betekenen zonder migratie in de `norm*`-functies; er staan echte gegevens in.
- Uitnodigingen werken alleen voor het opgegeven e-mailadres, één keer, met precies de rechten uit de uitnodiging.
- Stijl: Nederlandse teksten, kort en zonder jargon. Ontwerp "v3": Bricolage Grotesque + Hanken Grotesk, harde schaduwen, marine/koper (accent instelbaar per speltak). Geen `transition-all`. Moet werken op 390 px breed zonder horizontaal scrollen.
