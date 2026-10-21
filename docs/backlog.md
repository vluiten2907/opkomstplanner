# Backlog

Opdrachten van Vincent en open punten. Claude houdt dit bij: nieuw → *Open*, mee bezig → *Bezig*, opgeleverd → *Klaar* (met datum).

## Bezig

_(niets)_


## Open

- **Bewerken uit de bank bevestigen** — een opkomst of activiteit uit je eigen bank wordt na bewerken niet meer automatisch opgeslagen. Onderaan: *Annuleren*, *Opslaan* en *Opslaan als kopie* (met nieuwe naam). Bestaat de naam al in de bank, dan moet je een andere naam kiezen.
- **Live controle met echt account** — registreren, speltak aanmaken en uitnodiging accepteren op conqueston.nl/opkomst door Vincent (bevestigt e-mail/wachtwoord-login en de gepubliceerde regels).
- **Wachtwoord vergeten-mail** — controleren of de Firebase-mail aankomt en eventueel de afzender/tekst in het Nederlands zetten (Authentication → Templates).

## Klaar
- 2026-10-21 — Oefenomgeving: knop op de inlogpagina en bij Mijn speltakken (ook zonder account, `/oefenen`). Voorbeeldspeltak Welpen met jaarplanning, uitgewerkte opkomsten, weekendkamp en gevulde banken; watermerk OEFENEN op elke pagina en in de pdf. Alles blijft in de browser (raakt Firestore niet, geen nieuwe regels nodig); *Opnieuw beginnen* zet de voorbeelddata terug.
- 2026-10-21 — Concepten verwijderen: knop *Verwijderen* (twee keer klikken) bij elk concept op de startpagina van de Opkomstbouwer en in de bouwer zelf, naast de bestaande knop in de Opkomstenbank. Voor teamleider en leiding met bouwrecht.
- Beheer: speltakken uitklapbaar met leiding, rechten per leiding aanpassen (bekijken mag altijd).
- Mijn account (voor- en achternaam, ook bij registreren), e-mail en volledige naam in het leidingoverzicht.
- Namen (zoals Akela) uniek binnen een groep: groepen/{gid}/namen, gecontroleerd bij account aanmaken en toevoegen.
- Beheer: bestaand account direct toevoegen (teamleider/leiding), leidingoverzicht per groep met verwijderen en teamleider wisselen (opvolger kiezen), speltak volledig verwijderen, beheerder groep alleen uit de leiding. Nieuwe regels: accounts + verwijderen.

- 2026-10-21 — Opkomsten delen binnen de groep: opkomstenbank met tabbladen *Onze bank* en *Groep*. Bank-opkomsten worden standaard (zonder namen) gedeeld met de andere speltakken van de Scouting-groep; per opkomst uit te zetten. Vanuit *Groep* met één knop kopiëren naar de eigen bank (losse kopie, categorieën op naam gekoppeld), filteren per speltak en categorie, "Al in onze bank" en teller. Nieuwe `firestore.rules` (`groepen/{gid}/gedeeld` en `leden`, 23 extra emulatortests).
- Beheer: groepen standaard ingeklapt (klik op de naam), beheerder groep maakt bij bestaande leden/teamleiders aan (vinkje), leiding uitnodigen per speltak vanaf Beheer.

- 2026-10-21 — Rollen en beheerders: Beheer (totaal) → Beheer (groep) → Teamleider → Leiding. Beheer-pagina met groepen, speltakken en teamleiders; oude speltakken koppelen aan een groep. Account aanmaken alleen via uitnodiging (30 dagen geldig). Openstaande uitnodigingen zien, link kopiëren en intrekken op elk niveau. Overdragen, mede-beheerders en aftreden. Nieuwe `firestore.rules` (73 emulatortests).
- 2026-10-21 — Menubalk op telefoons (o.a. Samsung, 344–412 px): alle zes menu-items in beeld in twee rijen met korte namen, accountknop naast het logo, balk lager en over de volle breedte. Desktop ongewijzigd.
- 2026-10-21 — Leiding die je met de hand bij een onderdeel invult, telt nu mee als aanwezige leiding (bouwer, leiding indelen, dashboard, pdf) en is te kiezen als eindverantwoordelijke.
- 2026-10-21 — "Naam" heet nu "Opkomst titel" bij Leiding indelen, in de opkomstbouwer en in de opkomstenbank; in de activiteitenbank "Titel van de activiteit".
- 2026-10-21 — Kleinere bundel: jsPDF pas bij "PDF maken", pagina's los geladen, Firebase/React in eigen (cachebare) bestanden. Startbundel 1083 kB → ~630 kB (339 → ~200 kB gzip).
- 2026-10-21 — React + Firebase-versie met speltakken, teamleider/leiding-rechten en uitnodigingslinks.
- 2026-10-21 — Inplannen vanuit de bouwer houdt leiding; naar de opkomstenbank zonder namen.
- 2026-10-21 — "Leiding indelen" als tijdlijn met gelijktijdige onderdelen naast elkaar.
- 2026-10-21 — Live op conqueston.nl/opkomst via GitHub Actions + SFTP naar Strato.
- 2026-10-21 — Rooktest (`npm run check`) en projectafspraken (`CLAUDE.md`).
