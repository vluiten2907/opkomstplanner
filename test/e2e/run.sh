#!/usr/bin/env bash
# Lint + typecheck + unit-tests + productiebuild + rooktest tegen de demo-build (nep-Firebase).
# Gebruik: bash test/e2e/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=${E2E_PORT:-4173}
# lint: fouten (bijv. rules-of-hooks) laten de controle falen, waarschuwingen niet
npx oxlint --quiet
npx tsc -p tsconfig.app.json --noEmit
# pure functies (src/lib/model.ts, src/lib/time.ts); Node haalt de types zelf weg
node --experimental-strip-types --disable-warning=ExperimentalWarning --test-reporter=spec --test 'test/unit/*.test.ts'
npm run build > /dev/null
# jsPDF hoort niet in de startbundel (wordt pas bij "PDF maken" geladen)
if grep -l "jsPDF.API" $(grep -o 'assets/[^"]*\.js' dist/index.html | sed 's|^|dist/|') > /dev/null; then echo "FOUT: jsPDF zit in de startbundel"; exit 1; fi
# de activiteitenbank laadt de bouwer niet mee (gedeelde velden staan in src/components/fields.tsx)
if grep -l 'Bouwer-' dist/assets/Activiteitenbank-*.js > /dev/null 2>&1; then echo "FOUT: Activiteitenbank laadt de Bouwer mee"; exit 1; fi
npx vite build --config vite.demo.config.ts --outDir dist-demo > /dev/null
npx vite preview --config vite.demo.config.ts --outDir dist-demo --port "$PORT" --strictPort > /dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true; rm -rf dist-demo' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
E2E_BASE="http://localhost:$PORT" python3 test/e2e/smoke.py
