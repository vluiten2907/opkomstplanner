---
description: Voer één stap uit docs/plan.md uit als implementatie-thread (branch + PR)
argument-hint: <stapnummer, bijv. 1.3>
---
Je bent een **implementatie-thread** voor stap **$ARGUMENTS** van de Opkomstplanner.

1. Lees `CLAUDE.md`, `docs/plan.md` (vooral stap $ARGUMENTS) en `docs/voortgang.md`. Bestaat de stap niet of is hij al afgevinkt: stop en meld dat.
2. Maak een branch `claude/$ARGUMENTS-<korte-naam>` vanaf de nieuwste `main`. Is de stap groot of staat er iets open in de omschrijving: maak eerst een kort plan en leg het voor.
3. Bouw precies deze stap — niet meer. Iets anders gezien? Noteer het onder "Gezien, niet gedaan" in de PR.
4. Voeg controles toe aan `test/e2e/smoke.py` voor het nieuwe gedrag. Draai `npm run check` tot het groen is. Bij UI-wijzigingen: bekijk screenshots op desktop en 390 px breed.
5. Werk `docs/voortgang.md` bij (vinkje, datum; PR-nummer vul je in na het openen).
6. Commit (Nederlands), push de branch en open een PR naar `main` via de REST-API (`gh api repos/vluiten2907/opkomstplanner/pulls -f title=… -f head=<branch> -f base=main -F body=@bestand`; `gh pr create` werkt niet in Claude Code-sessies; bij een tokenfout `env -u GH_TOKEN` ervoor) met:
   - **Wat is gedaan** (kort)
   - **Wat te testen** — genummerde stappen op conqueston.nl/opkomst, zonder code te hoeven lezen
   - **Regels publiceren** — alleen als `firestore.rules` wijzigt: de volledige nieuwe regels
   - **Gezien, niet gedaan** — optioneel
7. Wacht tot CI ("Check") groen is (`gh api repos/vluiten2907/opkomstplanner/actions/runs?branch=<branch>`) en meld Vincent in twee regels: PR-link en of hij regels moet publiceren. Merge alleen als Vincent "merge" zegt (CI groen; `gh api -X PUT repos/vluiten2907/opkomstplanner/pulls/<nr>/merge -f merge_method=squash`), en controleer daarna de live site.
