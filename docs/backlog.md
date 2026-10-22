# Backlog

Opdrachten van Vincent en open punten. Claude houdt dit bij: nieuw → *Open*, mee bezig → *Bezig*, opgeleverd → *Klaar* (met datum).

## Bezig

_(niets)_


## Open

- **Live controle met echt account** — registreren, speltak aanmaken en uitnodiging accepteren op conqueston.nl/opkomst door Vincent (bevestigt e-mail/wachtwoord-login en de gepubliceerde regels).

## Klaar
- 2026-10-22 — Beveiligingscontrole + fixes: e-mailadres bevestigen na account aanmaken (nodig voor uitnodiging accepteren en vindbaar zijn voor beheer; melding met *Ik heb bevestigd* / *Mail opnieuw sturen*), map `api/` op de server helemaal dicht behalve het mailscript, teller met hash, max. 20 uitnodigingsmails per afzender per dag, namen in uitnodigingen max. 60 tekens en zonder links, namen vastleggen alleen met uitnodiging of als lid van de groep, beveiligingsheaders, jsPDF 4.2.1 / react-router 6.30.6 / Firebase 11.10. Nieuwe `firestore.rules` (129 emulatortests). Rapport: https://claude.ai/artifact/Dtb9Tj5YhNgqHeCS7GnHzT
- 2026-10-22 — Scoutinggroep verwijderen (alleen Beheer totaal): knop *Groep verwijderen* onderaan de groepskaart op Beheer, bevestigen door de groepsnaam te typen, met overzicht van wat er weggaat. Weg: alle speltakken met opkomsten, activiteiten en jaarplanning, groepsbank, namen, groepsleden, open uitnodigingen, beheerders en de groep. Inlogaccounts blijven bestaan (website kan die niet wissen); na afloop een lijst van wie nergens meer bij hoort, om eventueel in de Firebase-console te verwijderen. Nieuwe `firestore.rules`: beheerder mag `groepen/{gid}/leden` lezen en opruimen.
- 2026-10-22 — Jaarplanning opent standaard op *Komende 3 maanden* (vandaag + 13 weken) i.p.v. het hele seizoen; een andere keuze blijft staan zolang het tabblad open is.
- 2026-10-21 — Verwijderen uit de banken: prullenbakje (twee keer klikken) op elke kaart in de opkomstenbank en de activiteitenbank, ook voor afgeronde opkomsten en activiteiten, en *Verwijderen* in de opkomstbouwer bij een bank-opkomst (bovenaan en op de startpagina). Ingeplande opkomsten en opkomsten die een activiteit gebruiken blijven staan; een gedeelde opkomst verdwijnt ook uit *Groep* (kopieën van andere speltakken blijven). Recht: banken. Geen nieuwe regels.
- 2026-10-21 — Wachtwoord vergeten: de resetmail gaat in het Nederlands, na het resetten een knop terug naar inloggen (als conqueston.nl bij Authorized domains staat), en de bevestiging noemt de spammap. Eigen afzender (noreply@conqueston.nl) bewust overgeslagen.
- 2026-10-21 — Bewerken uit de bank bevestigen: opkomsten (bouwer en zijpaneel) en activiteiten uit de eigen bank worden niet meer automatisch opgeslagen. Onderaan *Annuleren*, *Opslaan* en *Opslaan als kopie* (met eigen naam). Namen zijn uniek per bank (hoofdletters/spaties tellen niet), ook bij *In bank*, *Bewaren in activiteitenbank* en kopiëren uit de groep. Weggaan met niet-opgeslagen wijzigingen vraagt eerst.
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
