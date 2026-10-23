#!/usr/bin/env bash
# Zet dist/ via SFTP op Strato (gebruikt door .github/workflows/deploy.yml).
# Nodig: HOST, USER, PASS en DIR (map op de server; "." = de inlogmap). Optioneel: PORT (22), BEWAAR_DAGEN (7).
#
# Volgorde: eerst de nieuwe bestanden in assets/, dan index.html en de rest; zo verwijst index.html nooit naar iets
# wat er nog niet staat. Oude bestanden in assets/ blijven nog BEWAAR_DAGEN staan: een tabblad dat nog open staat met
# een vorige versie kan zijn pagina's dan blijven laden. Wanneer een bestand voor het laatst in een versie zat,
# staat op de server in assets-bewaard.txt ("tijd naam" per regel).
set -euo pipefail
: "${HOST:?}" "${USER:?}" "${PASS:?}" "${DIR:?}"
PORT="${PORT:-22}"; DAGEN="${BEWAAR_DAGEN:-7}"
LIJST=assets-bewaard.txt
WERK=$(mktemp -d); trap 'rm -rf "$WERK"' EXIT
test -d dist/assets || { echo "dist/assets ontbreekt: eerst bouwen"; exit 1; }

lf() { lftp -p "$PORT" -u "$USER","$PASS" "sftp://$HOST" -e "set sftp:auto-confirm yes; set net:max-retries 2; set net:timeout 20; $1; bye"; }

# 1. Wat staat er nu: de bewaarlijst en de bestanden in assets/ (bij de eerste keer allebei leeg)
lf "get -O $WERK $DIR/$LIJST" > /dev/null 2>&1 || : > "$WERK/$LIJST"
{ lf "cls -1 $DIR/assets/" 2> /dev/null || true; } | sed 's|.*/||' | grep -v '^$' > "$WERK/server.txt" || true

# 2. Nieuwe bewaarlijst en wat weg mag (ouder dan DAGEN en niet in deze versie)
python3 - "$WERK" "$LIJST" "$DAGEN" <<'PY'
import os, sys, time
werk, lijst, dagen = sys.argv[1], sys.argv[2], int(sys.argv[3])
nu, grens = int(time.time()), int(sys.argv[3]) * 86400
nieuw = set(os.listdir('dist/assets'))
gezien = {}
for regel in open(os.path.join(werk, lijst), encoding='utf-8'):
    t, _, naam = regel.strip().partition(' ')
    if naam and t.isdigit(): gezien[naam] = int(t)
server = {r.strip() for r in open(os.path.join(werk, 'server.txt'), encoding='utf-8') if r.strip()}
bewaar, weg = {n: nu for n in nieuw}, []
for naam in server - nieuw:
    t = gezien.get(naam, nu)  # niet in de lijst (van vóór deze lijst bestond): vanaf nu bewaren
    if nu - t >= grens: weg.append(naam)
    else: bewaar[naam] = t
with open(os.path.join(werk, 'nieuw-' + lijst), 'w', encoding='utf-8') as f:
    f.writelines(f'{t} {n}\n' for n, t in sorted(bewaar.items()))
with open(os.path.join(werk, 'weg.txt'), 'w', encoding='utf-8') as f:
    f.writelines(n + '\n' for n in sorted(weg))
print(f'assets: {len(nieuw)} in deze versie, {len(bewaar) - len(nieuw)} oude bewaard, {len(weg)} weg (ouder dan {dagen} dagen)')
PY

# 3. Uploaden: eerst assets/, dan de rest; daarna oude assets opruimen en de lijst bijwerken
OPRUIMEN=""
while IFS= read -r naam; do
  case "$naam" in *[!A-Za-z0-9._-]*|"") continue;; esac  # alleen gewone bestandsnamen (zoals Vite ze maakt)
  OPRUIMEN="$OPRUIMEN rm -f $DIR/assets/$naam;"
done < "$WERK/weg.txt"
lf "mkdir -p -f $DIR/assets;
  mirror --reverse --verbose dist/assets/ $DIR/assets;
  mirror --reverse --verbose --exclude-glob assets/ dist/ $DIR;
  $OPRUIMEN
  put $WERK/nieuw-$LIJST -o $DIR/$LIJST"
