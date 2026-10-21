#!/bin/bash
# Setup-script voor de Claude Code cloud-omgeving (claude.ai/code → omgeving bewerken → "Setup script").
# Alleen nodig als Chromium niet al in de omgeving staat (standaard staat het in /opt/pw-browsers).
set -e
pip install -q --break-system-packages playwright
[ -d /opt/pw-browsers ] || python3 -m playwright install --with-deps chromium
