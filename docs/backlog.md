# Backlog

Opdrachten van Vincent en open punten. Claude houdt dit bij: nieuw → *Open*, mee bezig → *Bezig*, opgeleverd → *Klaar* (met datum).

## Bezig

_(niets)_

## Open

- **Live controle met echt account** — registreren, speltak aanmaken en uitnodiging accepteren op conqueston.nl/opkomst door Vincent (bevestigt e-mail/wachtwoord-login en de gepubliceerde regels).
- **Uitnodiging per e-mail laten versturen** — nu kopieer/mail-knop; automatisch versturen vereist een mailserver of Cloud Function (Blaze-plan).
- **Bundel kleiner maken** — hoofdbestand ~1 MB (jsPDF + Firebase). Pdf-module pas laden bij "PDF maken" (dynamic import).
- **Oefenomgeving** — bestond in de losse versie (voorbeelddata met watermerk); nog niet in de online versie.
- **Uitnodigingen beheren** — openstaande uitnodigingen tonen en intrekken in Team & instellingen.
- **Wachtwoord vergeten-mail** — controleren of de Firebase-mail aankomt en eventueel de afzender/tekst in het Nederlands zetten (Authentication → Templates).

- **"Naam" wordt "Opkomst titel" bij Leiding indelen** — het veld heet nu "naam", maar bedoeld is de titel van de opkomst.
- **Menubalk valt buiten beeld** — op sommige apparaten valt de menubalk bovenin buiten het scherm.
- **Handmatig toegevoegde leiding telt niet mee** — leiding die je met de hand toevoegt, wordt later niet meegeteld als aanwezige leiding.
- **Rollenstructuur met beheerders** — vier niveaus: Beheer (totaal) → Beheer (groep, per Scouting-vereniging) → Teamleider → Leiding. vluiten2907@gmail.com wordt voorlopig het hoofdaccount (Beheer totaal). Beheer ziet alle teams en teamleiders, nodigt teamleiders uit en (totaal) nodigt andere Scouting-groepen uit. Een account aanmaken kan alleen nog via een uitnodiging; open registratie verdwijnt. Overlapt met *Uitnodigingen beheren*. Raakt datamodel en `firestore.rules`: eerst ontwerp en migratie voorleggen.

## Klaar

- 2026-10-21 — React + Firebase-versie met speltakken, teamleider/leiding-rechten en uitnodigingslinks.
- 2026-10-21 — Inplannen vanuit de bouwer houdt leiding; naar de opkomstenbank zonder namen.
- 2026-10-21 — "Leiding indelen" als tijdlijn met gelijktijdige onderdelen naast elkaar.
- 2026-10-21 — Live op conqueston.nl/opkomst via GitHub Actions + SFTP naar Strato.
- 2026-10-21 — Rooktest (`npm run check`) en projectafspraken (`CLAUDE.md`).
