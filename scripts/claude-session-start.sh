#!/bin/bash
# SessionStart-hook voor Claude Code cloud-sessies: installeert npm-pakketten (alleen als package.json of
# package-lock.json veranderd is) en zorgt dat Playwright voor Python er is voor de rooktest. Lokaal doet dit niets.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
stamp="node_modules/.opk-install.sha256"
if ! sha256sum --check --status "$stamp" 2>/dev/null; then
  if PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund >/dev/null 2>&1; then
    sha256sum package.json package-lock.json > "$stamp" || true
    echo "npm-pakketten geïnstalleerd"
  else
    echo "Let op: npm ci mislukt — draai het handmatig"
  fi
fi
if ! python3 -c "import playwright" 2>/dev/null; then
  pip install -q --break-system-packages playwright >/dev/null 2>&1 && echo "Playwright (Python) geïnstalleerd" || echo "Let op: Playwright (Python) ontbreekt — rooktest kan niet draaien"
fi
exit 0
