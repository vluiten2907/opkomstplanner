<?php
// Verstuurt een uitnodigingsmail via de Strato-mailbox.
// Aanroep: POST met header "Authorization: Bearer <Firebase ID-token>" en JSON {"token": "<uitnodiging-id>"}.
// Veiligheid: alleen wie de uitnodiging zelf heeft aangemaakt kan hem laten mailen, alleen naar het
// adres in de uitnodiging, met een vaste tekst, elke uitnodiging hoogstens 3 keer en hoogstens 20 per afzender per dag.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function antwoord(int $code, array $data): void { http_response_code($code); echo json_encode($data); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') antwoord(204, []);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') antwoord(405, ['fout' => 'Alleen POST']);

$cfgFile = __DIR__ . '/mail-config.php';
if (!is_file($cfgFile)) antwoord(503, ['fout' => 'Mail is nog niet ingesteld']);
$cfg = require $cfgFile; // ['smtp_host','smtp_port','user','password','from_name','app_url','project_id','api_key']

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+([A-Za-z0-9._-]+)$/', $auth, $m)) antwoord(401, ['fout' => 'Niet ingelogd']);
$idToken = $m[1];
$body = json_decode((string)file_get_contents('php://input'), true);
$token = is_array($body) ? (string)($body['token'] ?? '') : '';
if (!preg_match('/^[A-Za-z0-9_-]{6,64}$/', $token)) antwoord(400, ['fout' => 'Ongeldige uitnodiging']);

function haal(string $url, string $method = 'GET', ?string $bearer = null, ?array $json = null): array {
  $h = ['Content-Type: application/json'];
  if ($bearer) $h[] = 'Authorization: Bearer ' . $bearer;
  $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $h),
    'content' => $json === null ? '' : json_encode($json), 'ignore_errors' => true, 'timeout' => 10]]);
  $res = @file_get_contents($url, false, $ctx);
  $status = 0;
  foreach ($http_response_header ?? [] as $line) if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $mm)) $status = (int)$mm[1];
  return [$status, json_decode((string)$res, true)];
}

// 1. Wie is de afzender? (Firebase controleert het token)
[$st, $acc] = haal('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . urlencode($cfg['api_key']), 'POST', null, ['idToken' => $idToken]);
$uid = $acc['users'][0]['localId'] ?? null;
if ($st !== 200 || !$uid) antwoord(401, ['fout' => 'Niet ingelogd']);

// 2. Uitnodiging lezen met het token van de afzender (firestore.rules gelden dus ook hier)
[$st, $doc] = haal('https://firestore.googleapis.com/v1/projects/' . rawurlencode($cfg['project_id'])
  . '/databases/(default)/documents/invites/' . rawurlencode($token), 'GET', $idToken);
if ($st !== 200 || !isset($doc['fields'])) antwoord(404, ['fout' => 'Uitnodiging niet gevonden']);
$f = $doc['fields'];
$veld = fn(string $k) => $f[$k]['stringValue'] ?? null;
if ($veld('invitedBy') !== $uid) antwoord(403, ['fout' => 'Alleen wie uitnodigt kan de mail versturen']);
if (isset($f['usedBy']['stringValue'])) antwoord(409, ['fout' => 'Uitnodiging is al gebruikt']);
$verloopt = (float)($f['expiresAt']['integerValue'] ?? $f['expiresAt']['doubleValue'] ?? 0);
if ($verloopt <= microtime(true) * 1000) antwoord(410, ['fout' => 'Uitnodiging is verlopen']);
$aan = (string)$veld('email');
if (!filter_var($aan, FILTER_VALIDATE_EMAIL)) antwoord(400, ['fout' => 'Geen geldig e-mailadres']);

// 3. Hoogstens 3 keer per uitnodiging en 20 mails per afzender per dag.
// De teller bewaart alleen een hash van de code (de code zelf is het geheim van de uitnodiging).
// De map api/ is afgeschermd met .htaccess; het oude bestand met leesbare codes wordt opgeruimd.
if (is_file(__DIR__ . '/verzonden.json')) @unlink(__DIR__ . '/verzonden.json');
$log = __DIR__ . '/.teller.json';
$fh = fopen($log, 'c+');
flock($fh, LOCK_EX);
$teller = json_decode((string)stream_get_contents($fh), true) ?: [];
$sleutel = 'i:' . hash('sha256', $token);
$dag = 'u:' . hash('sha256', $uid) . ':' . gmdate('Ymd');
// tellers van eerdere dagen opruimen
foreach (array_keys($teller) as $k) if (str_starts_with($k, 'u:') && !str_ends_with($k, ':' . gmdate('Ymd'))) unset($teller[$k]);
if (($teller[$sleutel] ?? 0) >= 3) { flock($fh, LOCK_UN); antwoord(429, ['fout' => 'Deze uitnodiging is al 3 keer gemaild']); }
if (($teller[$dag] ?? 0) >= 20) { flock($fh, LOCK_UN); antwoord(429, ['fout' => 'Je hebt vandaag al 20 uitnodigingen gemaild. Probeer het morgen weer.']); }

// 4. Mail opbouwen
// Vrije tekst in de mail: kort houden en geen links, zodat niemand de mail voor spam of phishing kan gebruiken.
function schoon(?string $s): string {
  $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$s) ?? '');
  if (preg_match('#(https?:|www\.|://|[a-z0-9-]+\.(nl|com|net|org|be|eu|io|info|ru|xyz)\b)#i', $s)) return '';
  return mb_substr($s, 0, 60);
}
$wie = schoon($veld('invitedByName')) ?: 'Een teamleider';
$soort = (string)$veld('kind');
$rol = ['totaal' => 'Beheer (totaal)', 'groep' => 'Beheer (groep)', 'teamleider' => 'Teamleider', 'leiding' => 'Leiding'][$soort] ?? 'Leiding';
$waar = $soort === 'totaal' ? 'de hele planner' : ($soort === 'groep' ? schoon($veld('groupName'))
  : implode(' · ', array_filter([schoon($veld('groupName')), schoon($veld('speltakName'))])));
$dagen = max(1, (int)ceil(($verloopt / 1000 - time()) / 86400));
$link = rtrim($cfg['app_url'], '/') . '/uitnodiging/' . $token;
$wat = $rol . ($waar ? " voor $waar" : '');
$onderwerp = 'Uitnodiging Opkomstplanner: ' . $wat;
$tekst = "Hoi,\r\n\r\n$wie nodigt je uit voor de Opkomstplanner als $wat.\r\n\r\n"
  . "Open deze link en maak een account aan met dit e-mailadres ($aan):\r\n$link\r\n\r\n"
  . "De link is nog $dagen " . ($dagen === 1 ? 'dag' : 'dagen') . " geldig.\r\n\r\n"
  . "Groet,\r\n$wie\r\n\r\n--\r\nDeze mail is verstuurd vanuit de Opkomstplanner. Niet verwacht? Dan kun je hem negeren.\r\n";

try { smtp_stuur($cfg, $aan, $onderwerp, $tekst, $wie); }
catch (Throwable $e) { flock($fh, LOCK_UN); error_log('uitnodiging-mail: ' . $e->getMessage()); antwoord(502, ['fout' => 'Versturen mislukt']); }

$teller[$sleutel] = ($teller[$sleutel] ?? 0) + 1;
$teller[$dag] = ($teller[$dag] ?? 0) + 1;
ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($teller)); flock($fh, LOCK_UN); fclose($fh);
antwoord(200, ['ok' => true, 'aan' => $aan]);

function kop(string $s): string { return '=?UTF-8?B?' . base64_encode($s) . '?='; }

function smtp_stuur(array $cfg, string $aan, string $onderwerp, string $tekst, string $namens): void {
  $s = stream_socket_client('ssl://' . $cfg['smtp_host'] . ':' . (int)$cfg['smtp_port'], $errno, $err, 15);
  if (!$s) throw new RuntimeException("verbinding: $err");
  stream_set_timeout($s, 15);
  $lees = function () use ($s): string { $r = ''; while (($l = fgets($s, 1024)) !== false) { $r .= $l; if (($l[3] ?? '') === ' ') break; } return $r; };
  $cmd = function (?string $c, int $verwacht) use ($s, $lees): void {
    if ($c !== null) fwrite($s, $c . "\r\n");
    $r = $lees();
    if ((int)substr($r, 0, 3) !== $verwacht) throw new RuntimeException('SMTP: ' . trim($r));
  };
  $cmd(null, 220);
  $cmd('EHLO ' . (parse_url($cfg['app_url'], PHP_URL_HOST) ?: 'localhost'), 250);
  $cmd('AUTH LOGIN', 334);
  $cmd(base64_encode($cfg['user']), 334);
  $cmd(base64_encode($cfg['password']), 235);
  $cmd('MAIL FROM:<' . $cfg['user'] . '>', 250);
  $cmd('RCPT TO:<' . $aan . '>', 250);
  $cmd('DATA', 354);
  $van = kop(($cfg['from_name'] ?? 'Opkomstplanner') . ' namens ' . $namens);
  $kop = "From: $van <{$cfg['user']}>\r\nTo: <$aan>\r\nSubject: " . kop($onderwerp) . "\r\n"
    . 'Date: ' . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . '@' . substr(strrchr($cfg['user'], '@'), 1) . ">\r\n"
    . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
  $cmd($kop . chunk_split(base64_encode($tekst)) . "\r\n.", 250);
  fwrite($s, "QUIT\r\n"); fclose($s);
}
