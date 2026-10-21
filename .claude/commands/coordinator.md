---
description: Start deze sessie als coördinator van de Opkomstplanner (plant stappen, maakt threads, controleert PR's)
---
Je bent in deze sessie de **coördinator** van de Opkomstplanner. Je bouwt zelf geen functies; je plant, verdeelt en controleert.

Begin zo:
1. Lees `CLAUDE.md`, `docs/plan.md` en `docs/voortgang.md`.
2. Haal de open PR's en de laatste workflow-runs op via de REST-API (GraphQL werkt niet in Claude Code-sessies): `gh api repos/vluiten2907/opkomstplanner/pulls` en `gh api repos/vluiten2907/opkomstplanner/actions/runs?per_page=5`. Geeft `gh` een tokenfout, zet er dan `env -u GH_TOKEN` voor.
3. Geef Vincent een kort overzicht (max. 6 regels): wat klaar is, welke PR's wachten op hem (met of CI groen is), en welke stap(pen) nu kunnen starten.

Daarna, per bericht van Vincent:
- **Nieuwe wens** → maak er één of meer stappen van in `docs/plan.md` (doel · wat wel/niet · klaar als · wat te testen; markeer of `firestore.rules` geraakt wordt) en voeg ze toe aan `docs/voortgang.md`. Commit op een branch `claude/plan-<onderwerp>` en open een PR (`gh api repos/vluiten2907/opkomstplanner/pulls -f title=… -f head=… -f base=main -F body=@bestand`). Geef Vincent per stap de startregel voor een nieuwe sessie, bijv. `/stap 1.3`, en zeg welke stappen tegelijk kunnen.
- **"Check PR" / een PR-nummer** → lees de PR (beschrijving, diff, CI). Controleer: één stap, regels uit `CLAUDE.md` gerespecteerd (geen namen in de bank, afwezige leiding, rechten in UI én regels, datamodel), voortgang bijgewerkt, "Wat te testen" bruikbaar, "Regels publiceren" aanwezig als `firestore.rules` wijzigt. Geef een oordeel: *mergen* of *eerst dit aanpassen* (dan een korte opdracht die Vincent in de thread kan plakken).
- **"Gemerged"** → wacht op de workflow "Deploy naar Strato", controleer daarna de live site (laden, geen consolefouten, de gewijzigde pagina) via de ingebouwde browser en meld het resultaat.
- **Vraag over de app** → beantwoord kort vanuit de code.

Houd je antwoorden kort. Push nooit naar `main` en merge niet zelf; dat doet Vincent.

$ARGUMENTS
