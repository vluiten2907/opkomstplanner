# Plan Opkomstplanner

Dit is het werkplan dat Claude Code-sessies lezen. De coördinator houdt het bij; voortgang staat in [`voortgang.md`](voortgang.md).

## Werkwijze per stap
1. Vincent geeft een wens aan de **coördinator** (`/coordinator`). Die schrijft de stap hieronder uit en geeft de startregel, bijv. `/stap 1.3`.
2. Vincent opent een **nieuwe Claude Code-sessie** (thread) op deze repo en typt die startregel.
3. De thread werkt op een eigen branch (`claude/<stap>-<naam>`), nooit op `main`. Grote of onduidelijke stappen: eerst in **Plan**-modus.
4. `npm run check` groen; CI groen. PR-beschrijving: wat er gedaan is + **"Wat te testen"** (+ **"Regels publiceren"** als `firestore.rules` wijzigt).
5. In dezelfde PR: `docs/voortgang.md` bijwerken (vinkje, datum, PR-nummer).
6. De coördinator controleert de PR. Vincent zegt "merge" (of merget zelf op GitHub) → automatisch live op conqueston.nl/opkomst; de coördinator controleert de live site.

Een stap is klein genoeg voor één PR die Vincent in een paar minuten kan testen. Stappen die elkaar niet raken mogen tegelijk in aparte threads; de coördinator geeft aan welke dat zijn.

## Stappen

Format per stap: **doel** · wat wel/niet · klaar als · wat te testen.

### Fase 0 — Basis ✓
React + Firebase-versie, speltakken met teamleider/leiding-rechten, uitnodigingslinks, live op Strato via GitHub Actions, rooktest en projectafspraken.

### Fase 1 — In gebruik nemen

- **1.1 Live controle met echt account** _(Vincent, geen thread)_. Registreren op conqueston.nl/opkomst, speltak aanmaken, een tweede adres uitnodigen en laten toetreden. Klaar als dit zonder foutmelding lukt; foutmeldingen gaan naar de coördinator.

- **1.2 Uitnodigingen beheren.** In *Team & instellingen* een lijst met openstaande uitnodigingen (e-mail, rol, rechten, datum, door wie), met knoppen *Link kopiëren* en *Intrekken*.
  Wel: Firestore-query op `invites` per speltak (regel voor `list` door teamleider van die speltak toevoegen), intrekken = document verwijderen (regel bestaat).
  Niet: e-mail versturen. Klaar als: teamleider ziet en trekt in; leiding ziet de lijst niet; ingetrokken link toont "niet gevonden".
  Wat te testen: uitnodiging maken → staat in de lijst → intrekken → link openen geeft "niet gevonden". **Raakt `firestore.rules`.**

- **1.3 Pdf-module pas laden bij gebruik.** jsPDF (en html2canvas/purify) via `import()` bij "PDF maken", zodat het hoofdbestand flink kleiner wordt.
  Klaar als: hoofdbundel < 700 kB, pdf werkt nog (rooktest), knop toont kort "Pdf maken…" tijdens laden.
  Wat te testen: pdf maken vanaf dashboard en vanuit de bouwer.

- **1.4 Oefenomgeving.** Knop op het speltakkenscherm "Oefenomgeving bekijken": een speltak met voorbeelddata (seizoen, opkomsten, kamp, banken) die alleen in de browser leeft (nep-Firebase), met watermerk "VOORBEELD — wijzigingen worden niet opgeslagen".
  Niet: schrijven naar Firestore. Klaar als: zonder account te openen, alle schermen werken, terug naar echte app met één klik.
  Wat te testen: uitgelogd → oefenomgeving → rondklikken → terug.

- **1.5 Wachtwoord-vergeten in het Nederlands.** Controleer de reset-flow; zet in de README hoe de mailtemplate in Firebase (Authentication → Templates → taal Nederlands, afzendernaam "Opkomstplanner") ingesteld wordt; app toont duidelijke melding na versturen.
  Wat te testen: "Wachtwoord vergeten" → mail komt aan in het Nederlands → nieuw wachtwoord werkt.

## Ideeën (nog niet ingepland)
- Uitnodiging automatisch per e-mail laten versturen (vereist Cloud Function of mailserver).
- Afdrukbare jaarplanning (pdf of printweergave) om aan ouders te geven.
- Ouderbrief-sjabloon vanuit de jaarplanning.
