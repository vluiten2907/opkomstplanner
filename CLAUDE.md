# Opkomstplanner — projectafspraken

Planner voor scoutinggroepen: jaarplanning, opkomstbouwer (tijdlijn per 5 min), weekendkampen, activiteiten- en opkomstenbank, pdf, teams per speltak.
Live: **https://conqueston.nl/opkomst/** · Repo: `vluiten2907/opkomstplanner` · Eigenaar: Vincent Luiten (communiceert in het Nederlands, kort en direct).

## Werkafspraak: Claude is coördinator

Vincent geeft per bericht een opdracht ("voeg X toe", "Y moet anders"). Claude:

1. **Begrijpt en plant** – zegt in één zin wat er gaat gebeuren. Alleen bij een echt open keuze (meerdere redelijke uitkomsten, of iets dat data of rechten raakt) één korte vraag; anders gewoon doen.
2. **Zet het op de backlog** – nieuwe opdrachten en ideeën in `docs/backlog.md` (*Bezig* → *Klaar*). Grote opdrachten worden opgeknipt.
3. **Implementeert** – zelf, of via subagents voor losse, parallelle deelklussen (bijv. een nieuwe pagina en een regelwijziging tegelijk). Claude blijft verantwoordelijk voor het geheel en controleert het werk van subagents.
4. **Controleert** – `npm run check` (typecheck + build + rooktest) moet slagen. Bij UI-wijzigingen: screenshot bekijken (desktop én 390 px breed). Nieuwe functies krijgen een controle in `test/e2e/smoke.py`.
5. **Levert op** – commit op `main` en push. GitHub Actions bouwt en zet het via SFTP op Strato; daarna controleert Claude de live site (laden, geen consolefouten).
6. **Meldt kort** – wat er veranderd is, wat getest is, en wat Vincent eventueel zelf moet doen. Geen opsomming van stappen.

Wijzigingen aan `firestore.rules` gaan **niet** automatisch live: Vincent plakt ze in de Firebase-console (Firestore → Rules → Publish). Claude meldt dat expliciet en levert de volledige regels.

Iets wat niet terug te draaien is (data wissen, regels die bestaande gebruikers buitensluiten, datamodel omgooien zonder migratie) altijd eerst voorleggen.

## Techniek

- React 19 + TypeScript + Vite, Tailwind 3 (preflight uit; de stijl zit grotendeels in `src/styles.css`), react-router 6 met `basename` uit `import.meta.env.BASE_URL`, zustand, lucide-react, jsPDF.
- Firebase: Auth (e-mail/wachtwoord) + Firestore. Project `opkomstplanner`; config in `.env.production` (niet geheim). Geen Firebase Hosting.
- Hosting: Strato (Apache). `public/.htaccess` stuurt alle routes naar `index.html`. Build-pad `/opkomst/` (`vite.config.ts`, `VITE_BASE`).
- Deploy: `.github/workflows/deploy.yml` bij push op `main` (secrets `STRATO_SFTP_HOST/USER/PASSWORD`, `STRATO_DIR`). `check.yml` bouwt bij pull requests.

## Code

```
src/lib/model.ts      types, normalisatie, analyse (aandachtspunten), seizoen, lanesLayout — pure functies
src/lib/time.ts       tijd/datum-helpers (minuten sinds middernacht, ISO-datums, NL-notatie)
src/lib/pdf.ts        pdf-opbouw (jsPDF), export.ts: download + makePdf
src/store/speltak.tsx realtime data per speltak, optimistisch opslaan (debounce 500 ms), rechten (can/isTL), koppelen aan jaarplanning
src/store/auth.tsx    login/registratie
src/components/       Layout, ui (Modal, TimePicker, Chip, ConfirmBtn), shared, modals (Datum, Koppelen, Inplannen, Overnemen/Leiding indelen)
src/pages/            Auth, Invite, Speltakken, Dashboard, Jaarplanning, Bouwer, Activiteitenbank, Opkomstenbank, Instellingen
src/lib/localfs.ts + oefendata.ts, pages/Oefenen.tsx  oefenomgeving op /s/oefen: voorbeelddata in localStorage, geen Firestore, watermerk
test/fake-firebase.ts nep-Firebase (localStorage) voor `npm run demo` en de rooktest
```

Regels die de code bewaakt (niet breken):
- Er is geen aparte eindverantwoordelijke meer: dat is *Planning door* (`plannersOf`: planners uit de jaarplanning + een oude `o.lead`). Opkomstenbank bevat **geen namen**. Inplannen vanuit de bouwer houdt leiding; een kopie uit de bank wordt zonder namen ingepland en opent "Opkomst overnemen".
- Afwezige leiding (jaarplanning) kan niet worden ingedeeld en wordt automatisch uit de indeling gehaald (`dropAbsent`).
- Dashboard-kaart: dubbelklik (of dubbel tikken) op titel, omschrijving, tijden, locatie of een vak met namen om het daar aan te passen; volgt dezelfde rechten.
- Minimaal leiding van een opkomst = hoogste `minLeaders` van de niet-vaste onderdelen.
- Vaste blokken (`__open`, `__ranja`, `__close`) alleen bij gewone opkomsten, schuiven mee met begin/eind.
- Tijden in minuten; kampdagen mogen tot 26:00 (na middernacht).
- Rechten: teamleider alles; leiding per recht `plan` (jaarplanning), `build` (opkomsten), `bank` (banken), `settings`. Lezen mag elk lid. UI verbergt/blokkeert, `firestore.rules` dwingt af — bij nieuwe schrijfacties beide bijwerken.
- Rollen: Beheer (totaal) `beheer/totaal.ids` → Beheer (groep) `groepen/{gid}.adminIds` → Teamleider `speltakken/{sid}.tlIds` (oude speltakken zonder `tlIds`: `members[uid].role`) → Leiding. Hoofdaccount vluiten2907@gmail.com (`ROOT_EMAIL`, ook in de regels). Beheerders lezen speltakken van hun groep alleen-lezen; alleen de groepsbeheerder stelt een extra teamleider aan; een teamleider kan alleen overdragen/aftreden. Nooit de laatste op een niveau weghalen.
- Namen zijn uniek per groep (`groepen/{gid}/namen/{naam}` → uid); bij uitnodiging accepteren en direct toevoegen vastleggen, Beheer vult aan.
- Account aanmaken kan alleen via een uitnodiging (`invites/{token}`, `kind` = rol, 30 dagen geldig, openbaar leesbaar: de link is het geheim). Code: `src/store/roles.tsx`, `src/store/beheer.ts`, `src/pages/Beheer.tsx`.

Stijl: Nederlandse UI-teksten, kort en zonder jargon. Ontwerp "v3": Bricolage Grotesque + Hanken Grotesk, harde schaduwen, marine/koper (accent instelbaar). Geen `transition-all`. Moet werken op 390 px breed zonder horizontaal scrollen.

## Commando's

```bash
npm ci
npm run dev       # echte Firebase (lokaal), http://localhost:5173
npm run demo      # nep-Firebase; inloggen als vluiten2907@gmail.com / demo123 (Beheer totaal)
npm run check     # typecheck + build + rooktest (Playwright, test/e2e/) — moet groen zijn vóór elke push
npm run build     # productie-build in dist/ voor /opkomst/
bash test/rules/run.sh   # firestore.rules testen met de emulator (Java nodig), los van check
```

In de Claude-omgeving: Playwright/Chromium staat klaar (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); conqueston.nl is vanuit de shell niet bereikbaar, live controleren gaat via de ingebouwde browser op Vincents laptop. Commits met naam/e-mail van Vincent als auteur.
