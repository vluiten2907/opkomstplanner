// Schrijft dist/api/mail-config.php uit de GitHub-secrets, zodat het mailwachtwoord nooit in de repo staat.
// Zonder MAIL_USER/MAIL_PASSWORD wordt niets geschreven en geeft het script "Mail is nog niet ingesteld".
import { readFileSync, writeFileSync } from 'node:fs';
const { MAIL_USER, MAIL_PASSWORD, APP_URL } = process.env;
if (!MAIL_USER || !MAIL_PASSWORD) { console.log('Geen MAIL_USER/MAIL_PASSWORD: uitnodigingen mailen staat uit.'); process.exit(0); }
const env = Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const php = (v) => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const cfg = {
  smtp_host: 'smtp.strato.de', smtp_port: 465, user: MAIL_USER, password: MAIL_PASSWORD, from_name: 'Opkomstplanner',
  app_url: APP_URL || 'https://conqueston.nl/opkomst', project_id: env.VITE_FB_PROJECT_ID, api_key: env.VITE_FB_API_KEY,
};
const body = Object.entries(cfg).map(([k, v]) => `  ${php(k)} => ${typeof v === 'number' ? v : php(v)},`).join('\n');
writeFileSync('dist/api/mail-config.php', `<?php\nreturn [\n${body}\n];\n`, { mode: 0o600 });
console.log('Mailconfig geschreven voor ' + MAIL_USER);
