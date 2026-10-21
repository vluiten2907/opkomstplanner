#!/usr/bin/env bash
# Test firestore.rules met de Firestore-emulator (Java nodig). Los van `npm run check`.
# Gebruik: bash test/rules/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${RULES_WORK:-${TMPDIR:-/tmp}/opk-rules}"
mkdir -p "$WORK"
if [ ! -d "$WORK/node_modules/@firebase/rules-unit-testing" ]; then
  (cd "$WORK" && npm init -y >/dev/null && npm i -s firebase-tools@14 @firebase/rules-unit-testing firebase >/dev/null)
fi
cp "$HERE/rules.test.mjs" "$WORK/"
cp "$HERE/../../firestore.rules" "$WORK/"
echo '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8085}}}' > "$WORK/firebase.json"
cd "$WORK" && npx firebase emulators:exec --only firestore --project demo-opk "node rules.test.mjs"
