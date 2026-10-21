# Backlog

Opdrachten van Vincent en open punten. Claude houdt dit bij: nieuw → *Open*, mee bezig → *Bezig*, opgeleverd → *Klaar* (met datum).

## Bezig

_(niets)_

## Open

- **Live controle met echt account** — registreren, speltak aanmaken en uitnodiging accepteren op conqueston.nl/opkomst door Vincent (bevestigt e-mail/wachtwoord-login en de gepubliceerde regels).
- **Uitnodiging per e-mail laten versturen** — nu kopieer/mail-knop; automatisch versturen vereist een mailserver of Cloud Function (Blaze-plan).
- **Oefenomgeving** — bestond in de losse versie (voorbeelddata met watermerk); nog niet in de online versie.
- **Uitnodigingen beheren** — openstaande uitnodigingen tonen en intrekken in Team & instellingen.
- **Wachtwoord vergeten-mail** — controleren of de Firebase-mail aankomt en eventueel de afzender/tekst in het Nederlands zetten (Authentication → Templates).
- **Rollenstructuur met beheerders** — vier niveaus: Beheer (totaal) → Beheer (groep, per Scouting-vereniging) → Teamleider → Leiding. vluiten2907@gmail.com wordt voorlopig het hoofdaccount (Beheer totaal). Beheer ziet alle teams en teamleiders, nodigt teamleiders uit en (totaal) nodigt andere Scouting-groepen uit. Een account aanmaken kan alleen nog via een uitnodiging; open registratie verdwijnt. Rechten per rol: Beheer (totaal) wijst toe/nodigt uit als Beheer (groep); Beheer (groep) als Teamleider; Teamleider als Leiding. Elke rol kan zijn eigen rol overdragen aan iemand anders. Beheer (totaal) en Beheer (groep) kunnen ook een mede-beheerder op hun eigen niveau aanstellen. Overlapt met *Uitnodigingen beheren*. Raakt datamodel en `firestore.rules`: eerst ontwerp en migratie voorleggen.

## Klaar

- 2026-10-21 — Menubalk op telefoons (o.a. Samsung, 344–412 px): alle zes menu-items in beeld in twee rijen met korte namen, accountknop naast het logo, balk lager en over de volle breedte. Desktop ongewijzigd.
- 2026-10-21 — Leiding die je met de hand bij een onderdeel invult, telt nu mee als aanwezige leiding (bouwer, leiding indelen, dashboard, pdf) en is te kiezen als eindverantwoordelijke.
- 2026-10-21 — Bij "Leiding indelen" heet het veld "Naam" nu "Opkomst titel".
- 2026-10-21 — Kleinere bundel: jsPDF pas bij "PDF maken", pagina's los geladen, Firebase/React in eigen (cachebare) bestanden. Startbundel 1083 kB → ~630 kB (339 → ~200 kB gzip).
- 2026-10-21 — React + Firebase-versie met speltakken, teamleider/leiding-rechten en uitnodigingslinks.
- 2026-10-21 — Inplannen vanuit de bouwer houdt leiding; naar de opkomstenbank zonder namen.
- 2026-10-21 — "Leiding indelen" als tijdlijn met gelijktijdige onderdelen naast elkaar.
- 2026-10-21 — Live op conqueston.nl/opkomst via GitHub Actions + SFTP naar Strato.
- 2026-10-21 — Rooktest (`npm run check`) en projectafspraken (`CLAUDE.md`).
