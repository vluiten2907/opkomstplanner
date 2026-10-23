"""
Rooktest van de hele app tegen de demo-build (nep-Firebase), zonder internet.
Start via:  bash test/e2e/run.sh
Faalt (exit 1) bij een mislukte controle of een fout in de console.
Screenshots komen in test/e2e/out/ (niet in git).
"""
import base64, json, os, re, sys
from datetime import date, timedelta
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://localhost:4173')
OUT = os.environ.get('E2E_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
os.makedirs(OUT, exist_ok=True)
errors, failures = [], []

# elke keuzeknop (.chip) zit in een groep met een naam (role=group + aria-label of aria-labelledby), zodat een schermlezer weet waar hij bij hoort
CHIPGRP = """() => [...document.querySelectorAll('.chip')].filter(c => c.getClientRects().length && !c.closest('[inert]')).filter(c => {
  const g = c.closest('[role=group]'); if (!g) return true;
  if ((g.getAttribute('aria-label') || '').trim()) return false;
  const lb = g.getAttribute('aria-labelledby'); return !(lb && lb.split(' ').some(i => (document.getElementById(i)?.textContent || '').trim()));
}).map(c => c.textContent.trim().slice(0, 20))"""
# contrast van tekst (ook ::placeholder) op de achtergrond eronder (< 4,5:1 = te laag). glow: de pagina-achtergrond met de gloed van het accent (30 %) erover
LOWC = """([sels, glow]) => {
  const P = s => { let m = s.match(/rgba?\\(([^)]+)\\)/), f = 1; if (!m) { m = s.match(/color\\(srgb ([^)]+)\\)/); f = 255; } if (!m) return null;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0] * f, p[1] * f, p[2] * f, p.length > 3 ? p[3] : 1]; };
  const hex = h => { h = h.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1); };
  const over = (t, u) => [0, 1, 2].map(i => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const L = c => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const cr = (a, u) => (Math.max(L(a), L(u)) + .05) / (Math.min(L(a), L(u)) + .05);
  let base = P(getComputedStyle(document.body).backgroundColor);
  if (glow) { const a = hex(getComputedStyle(document.documentElement).getPropertyValue('--accent')); base = over([a[0], a[1], a[2], .3], base); }
  const out = []; let n = 0;
  for (const sel of sels) { const [q, pseudo] = sel.split('::');
    for (const e of document.querySelectorAll(q)) {
      if (!e.getClientRects().length || e.closest('[inert]')) continue;
      const chain = []; for (let x = e; x && x !== document.body; x = x.parentElement) chain.unshift(x);
      let bg = base, op = 1;
      for (const x of chain) { const st = getComputedStyle(x), c = P(st.backgroundColor); if (c && c[3]) bg = over(c, bg); op *= +st.opacity; }
      const c = P(getComputedStyle(e, pseudo ? '::' + pseudo : null).color), r = cr(over([c[0], c[1], c[2], c[3] * op], bg), bg); n++;
      if (r < 4.5) out.push(sel + ' "' + (pseudo ? e.placeholder : e.textContent).trim().slice(0, 16) + '" ' + r.toFixed(2));
    } }
  return [n, out]; }"""

def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg)
    if not cond: failures.append(msg)

def bank_names(store):
    # alle opkomsten in een opkomstenbank (speltakken/*/opkomsten met state bank) en in de groepsbank (groepen/*/gedeeld):
    # (titels, titels met namen of een eindverantwoordelijke). De bank bevat nooit namen.
    titles, bad = [], []
    for k, v in (store or {}).items():
        if not v: continue
        if re.match(r'^speltakken/[^/]+/opkomsten/', k) and v.get('state') == 'bank': o = v
        elif re.match(r'^groepen/[^/]+/gedeeld/', k) and v.get('opk'): o = v['opk']
        else: continue
        blocks = [x for d in (o.get('days') or []) for x in (d.get('blocks') or [])] + list(o.get('blocks') or [])
        titles.append(o.get('title') or '')
        if o.get('lead') or any(x.get('names') for x in blocks): bad.append(o.get('title') or '')
    return titles, bad

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL', accept_downloads=True)
    ctx.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    w = lambda ms=400: pg.wait_for_timeout(ms)
    shot = lambda n, full=True: pg.screenshot(path=f'{OUT}/{n}.png', full_page=full)
    def soon(cond, ms=4000):
        # wacht tot de voorwaarde klopt (hooguit ms), in plaats van een vaste pauze
        for _ in range(ms // 100):
            if cond(): return True
            pg.wait_for_timeout(100)
        return cond()

    def register(name, email):
        first, _, last = name.partition(' ')
        pg.fill('#i-first', first); pg.fill('#i-last', last or 'Test'); pg.fill('#i-name', name); pg.fill('input[type=password]', 'geheim123')
        if pg.locator('input[type=email]').is_editable(): pg.fill('input[type=email]', email)
        pg.click('.btn.primary'); w(800)
        # nieuw account: eerst het e-mailadres bevestigen (in de demo telt de link meteen als aangeklikt)
        if pg.locator('text=Ik heb bevestigd').count() and localStorage_noverify() != '1': pg.click('text=Ik heb bevestigd'); w(900)

    def localStorage_noverify():
        return pg.evaluate("localStorage.getItem('fake.noverify')")

    def add_block(y, title, dur='15', loc='', who=None):
        pg.locator('.lanes').click(position={'x': 100, 'y': y}); w()
        pg.fill('#bf-title', title); pg.select_option('#bf-dur', dur)
        if loc: pg.fill('#bf-loc', loc)
        if who: pg.click(f'.side .chip:has-text("{who}")')
        w(600); pg.click('.side .closex'); w(200)

    def open_meta(P=None):
        # details van een bestaande opkomst staan standaard ingeklapt (ook op een breed scherm): eerst openklappen
        P = P or pg; t = P.locator('.metatoggle[aria-expanded="false"]')
        if t.count(): t.click(); P.wait_for_timeout(250)

    def logout_to(url):
        pg.evaluate("localStorage.setItem('fake.auth.current','null'); localStorage.removeItem('opk.sid')"); pg.goto(url); w(600)

    def open_group():
        if pg.locator('.groupcard.open').count() == 0: pg.click('.groupcard .gc-head'); w(300)

    def open_sp(name):
        c = pg.locator(f'.groupcard .spcard:has-text("{name}")').first
        if 'open' not in (c.get_attribute('class') or ''): c.locator('.sp-head').click(); w(300)

    def invite_link():
        return pg.locator('.banknote .mono-code').last.inner_text()

    def pdf_texts(path):
        # tekstregels uit de pdf (jsPDF comprimeert niet): (x, y, tekst)
        raw = open(path, 'rb').read().decode('latin-1')
        return [(float(x), float(y), t) for x, y, t in re.findall(r'([\d.]+) ([\d.]+) Td\s*\(((?:[^()\\]|\\.)*)\) Tj', raw)]

    # --- wachtwoord vergeten
    pg.goto(BASE + '/wachtwoord'); w(); pg.fill('input[type=email]', 'iemand@test.nl'); pg.click('.btn.primary'); w(600)
    check(pg.locator('text=spammap').count() > 0, 'wachtwoord vergeten → bevestiging met spamtip')

    # --- geen open registratie meer
    pg.goto(BASE + '/registreren'); w()
    check('/inloggen' in pg.url, 'registreren zonder uitnodiging bestaat niet meer')
    check(pg.locator('text=Nieuw account').count() == 0, 'inlogpagina heeft geen knop Nieuw account')
    check(pg.locator('main h1:text-is("Inloggen")').count() == 1 and pg.title() == 'Inloggen · Opkomstplanner', 'inlogpagina: kop (h1) in main en eigen paginatitel')
    # huisstijl: marine (niet het oude groen), knoptekst in het midden, geen loze scrollruimte, links zonder browserblauw
    lb = pg.evaluate("""(() => { const b = document.querySelector('.auth-card .btn.primary'), cs = getComputedStyle(b), a = document.querySelector('.auth-card a[href$="/wachtwoord"]'), ac = getComputedStyle(a);
      return [cs.backgroundColor, cs.justifyContent, Math.round(b.getBoundingClientRect().height), document.documentElement.scrollHeight - innerHeight, ac.color, ac.textDecorationColor, ac.fontWeight]; })()""")
    check(lb[0] == 'rgb(30, 58, 95)' and lb[1] == 'center' and lb[2] >= 44 and lb[3] <= 1, f'inlogpagina: marine knop met tekst in het midden, pagina scrolt niet ({lb[:4]})')
    check(lb[4] == 'rgb(20, 32, 46)' and lb[5] == 'rgb(217, 139, 58)' and lb[6] == '600', f'inlogpagina: link Wachtwoord vergeten in inktkleur met koperen onderstreping ({lb[4:]})')
    pitch = pg.locator('.auth-pitch')
    check(pitch.locator('.pitch-cards li').count() == 3 and pitch.locator('text=account').count() == 0, 'inlogpagina: korte uitleg met drie kaartjes, niets over zelf een account maken')
    pb, fb = pitch.bounding_box(), pg.locator('form.auth-card').bounding_box()
    check(pb['x'] + pb['width'] <= fb['x'] + 1, 'inlogpagina breed: uitleg links naast het formulier'); shot('00a-inloggen', False)
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200)
    pb, fb = pitch.bounding_box(), pg.locator('form.auth-card').bounding_box()
    check(fb['y'] < 40 and pb['y'] >= fb['y'] + fb['height'] and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'inlogpagina mobiel: formulier bovenaan, uitleg eronder, geen horizontale scroll')
    shot('00b-inloggen-mobiel')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.fill('input[type=email]', 'vluiten2907@gmail.com'); pg.fill('input[type=password]', 'foutje1'); pg.click('.btn.primary'); w(600)
    check(pg.locator('#a-err[role=alert]:has-text("klopt niet")').count() == 1 and pg.get_attribute('#a-pw', 'aria-invalid') == 'true' and pg.get_attribute('#a-pw', 'aria-describedby') == 'a-err',
          'fout wachtwoord: melding wordt voorgelezen (role=alert) en hoort bij het veld')

    # --- Beheer (totaal): groep, speltak en uitnodigingen
    pg.fill('input[type=email]', 'vluiten2907@gmail.com'); pg.fill('input[type=password]', 'demo123'); pg.click('.btn.primary'); w(1200)
    check('/beheer' in pg.url and pg.locator('h2:has-text("Beheer (totaal)")').count() == 1, 'hoofdaccount → Beheer (totaal)')
    check(pg.locator('main').count() == 1 and pg.locator('main h1:text-is("Beheer")').count() == 1, 'beheer: inhoud in main (landmark), kop Beheer')
    # telefoon (390 en 360 px): geen dubbele zijmarge (alleen de 16 px van de pagina, zoals in een speltak) en de knoppen in de kop op één regel
    for wd in (390, 360):
        pg.set_viewport_size({'width': wd, 'height': 844}); w(200)
        hd = pg.evaluate("""(() => { const b = [...document.querySelectorAll('.page-head .btn')], c = document.querySelector('main .card').getBoundingClientRect();
          return [new Set(b.map(x => Math.round(x.getBoundingClientRect().top))).size, Math.round(c.left), Math.round(innerWidth - c.right), document.documentElement.scrollWidth <= innerWidth + 1, b.map(x => x.innerText.trim())]; })()""")
        check(hd[0] == 1 and hd[1] == 16 and hd[2] == 16 and hd[3] and hd[4] == ['Speltakken', 'Account', 'Uitloggen'], f'beheer {wd} px: knoppen in de kop op één regel (Speltakken), kaarten met 16 px zijmarge ({hd})')
    shot('02a-beheer-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    check(pg.locator('.page-head .btn:has-text("Mijn speltakken")').is_visible(), 'beheer laptop: de knop heet voluit Mijn speltakken')
    pg.click('text=Nieuwe Scouting-groep'); w(); pg.fill('#ng-name', 'Testgroep'); pg.click('text=Groep aanmaken'); w(800)
    check(pg.locator('.groupcard.open').count() == 1, 'nieuwe groep aangemaakt en opengeklapt')
    check(pg.locator('.groupcard select[aria-label="Bestaande persoon kiezen"]').count() == 0, 'beheerder kiezen kan pas als er leiding is')
    pg.fill('input[placeholder^="Naam nieuwe speltak"]', 'Scouts'); pg.click('text=Speltak aanmaken'); w(800)
    check(pg.locator('.groupcard .member:has-text("Scouts")').count() == 1, 'speltak aangemaakt in groep')
    sp_opts = pg.eval_on_selector_all('.groupcard.open datalist[id="speltaklist-b"] option', 'els => els.map(e => e.value)')
    check({'Bevers', 'Welpen', 'Kabouters', 'Gidsen'} <= set(sp_opts), f'nieuwe speltak: dezelfde suggesties als in de instellingen ({sp_opts})')
    open_sp('Scouts')
    pg.select_option('.groupcard select[aria-label="Persoon kiezen voor de speltak"]', label='Beheer (demo) · vluiten2907@gmail.com'); pg.click('.groupcard .member >> button:text-is("Toevoegen")'); w(800)
    check(pg.locator('.groupcard .member:has-text("Scouts") >> text=Teamleider: Beheer (demo)').count() == 1, 'bestaand account direct toegevoegd als teamleider')
    lr = pg.locator('.groupcard .spcard:has-text("Scouts") .leiding .subrow:has-text("Beheer (demo)")')
    lr.locator('label:has-text("Teamleider") input').click(); w(300)
    check(lr.locator('text=Voeg hieronder eerst iemand toe.').count() == 1, 'enige teamleider zonder andere leiding: uitleg wijst naar toevoegen hieronder')
    lr.locator('button:has-text("Sluiten")').click(); w(200)
    pg.select_option('.groupcard select[aria-label="Bestaande persoon kiezen"]', label='Mijzelf (Beheer (demo))'); pg.click('.groupcard >> text=Beheerder maken'); w(800)
    check(pg.locator('.groupcard .member:not(.spcard):has-text("Beheer (demo) (jij)")').count() == 1, 'beheer totaal (als leiding) maakt zichzelf beheerder van de groep')
    def invite_as(email, kind):
        pg.fill('input[placeholder="e-mailadres nieuw lid"]', email); pg.select_option('.groupcard select[aria-label="Uitnodigen als"]', kind)
        pg.click('.groupcard .member >> button:text-is("Uitnodigen")'); w(800); return invite_link()
    sel_h = pg.evaluate("[...document.querySelectorAll('.beheer select')].filter(e => e.getClientRects().length).map(e => [e.classList.contains('inp'), Math.round(e.getBoundingClientRect().height)])")
    check(sel_h and all(c and hgt >= 36 for c, hgt in sel_h), f'beheer: keuzelijsten hebben de stijl van de velden ernaast ({sel_h})')
    rs_row = pg.evaluate("""(() => { const s = document.querySelector('.groupcard select[aria-label="Uitnodigen als"]'), i = s.parentElement.querySelector('input[type=email]');
      return Math.abs(s.getBoundingClientRect().top - i.getBoundingClientRect().top) < 4; })()""")
    check(rs_row, 'beheer: Uitnodigen als staat op dezelfde regel als het e-mailadres')
    tl_link = invite_as('vincent@test.nl', 'teamleider'); check('/uitnodiging/' in tl_link, 'teamleider uitgenodigd')
    ga_link = invite_as('ga@test.nl', 'leiding'); check('/uitnodiging/' in ga_link and ga_link != tl_link, 'leiding uitgenodigd')
    invite_as('weg@test.nl', 'leiding')
    n_inv = pg.locator('.invrow').count(); check(n_inv == 3, f'openstaande uitnodigingen zichtbaar ({n_inv})')
    pg.locator('.invrow:has-text("weg@test.nl") >> text=Intrekken').click(); w(150); pg.locator('.invrow:has-text("weg@test.nl") >> text=Zeker?').click(); w(800)
    check(pg.locator('.invrow').count() == 2, 'uitnodiging intrekken')
    # speltak verwijderen
    pg.fill('input[placeholder^="Naam nieuwe speltak"]', 'Opruimen'); pg.click('text=Speltak aanmaken'); w(800)
    open_sp('Opruimen')
    opr = pg.locator('.groupcard .member:has-text("Opruimen")')
    check(opr.locator('.dangerzone').count() == 0 and opr.locator('input[aria-label="Naam ter bevestiging"]').count() == 0, 'speltak verwijderen staat dicht (achter een knop, zoals groep verwijderen)')
    opr.locator('button:has-text("Speltak verwijderen")').click(); w(300)
    btn = pg.locator('.groupcard .member:has-text("Opruimen") >> text=Definitief verwijderen')
    check(btn.is_disabled(), 'speltak verwijderen vraagt eerst de naam')
    pg.fill('.groupcard .member:has-text("Opruimen") input[aria-label="Naam ter bevestiging"]', 'Opruimen'); btn.click(); w(900)
    check(pg.locator('.groupcard .member:has-text("Opruimen")').count() == 0, 'speltak volledig verwijderd')
    # hele groep verwijderen (Beheer totaal)
    pg.click('text=Nieuwe Scouting-groep'); w(); pg.fill('#ng-name', 'Weggroep'); pg.click('text=Groep aanmaken'); w(800)
    wg = pg.locator('.groupcard:has-text("Weggroep")')
    # dubbelklik op een trage verbinding: het veld is meteen leeg, de knop wacht, en er komt één speltak
    pg.evaluate("localStorage.setItem('fake.holdWrite', '900')")
    wg.locator('input[placeholder^="Naam nieuwe speltak"]').fill('Bevers'); wg.locator('button:has-text("Speltak aanmaken")').dblclick(); w(150)
    check(wg.locator('input[placeholder^="Naam nieuwe speltak"]').input_value() == '' and wg.locator('button:has-text("Aanmaken…")').is_disabled(),
          'speltak aanmaken: veld meteen leeg, knop wacht tot het klaar is')
    w(1300); pg.evaluate("localStorage.removeItem('fake.holdWrite')")
    check(wg.locator('.spcard:has-text("Bevers")').count() == 1, f'speltak aanmaken: dubbelklik maakt één speltak ({wg.locator(".spcard").count()})')
    wg.locator('input[placeholder^="Naam nieuwe speltak"]').fill('bevers'); wg.locator('button:has-text("Speltak aanmaken")').click(); w(500)
    check(wg.locator('.spcard').count() == 1 and 'Er is al een speltak Bevers in Weggroep' in pg.locator('.toast').inner_text()
          and wg.locator('input[placeholder^="Naam nieuwe speltak"]').input_value() == 'bevers', 'speltak aanmaken: dezelfde naam in de groep niet nog eens')
    wg.locator('input[placeholder^="Naam nieuwe speltak"]').fill('')
    wg.locator('button:has-text("Groep verwijderen")').click(); w(400)
    gbtn = wg.locator('text=Groep definitief verwijderen')
    check(gbtn.is_disabled() and wg.locator('.dangerzone:has-text("1 speltak")').count() == 1, 'groep verwijderen vraagt de naam en toont wat er weggaat')
    wg.locator('input[aria-label="Groepsnaam ter bevestiging"]').fill('weggroep'); gbtn.click(); w(1200)
    check(pg.locator('.groupcard:has-text("Weggroep")').count() == 0 and pg.locator('.gonecard:has-text("Weggroep is verwijderd")').count() == 1, 'hele groep verwijderd met overzicht')
    check(pg.locator('.groupcard:has-text("Testgroep")').count() == 1, 'andere groep blijft staan')
    pg.locator('.gonecard >> text=Sluiten').click(); w(200)
    shot('00-beheer')

    # --- teamleider maakt account via de uitnodiging
    logout_to(tl_link)
    check(pg.locator('input[type=email]').input_value() == 'vincent@test.nl', 'uitnodiging: e-mailadres staat vast')
    check(pg.locator('main h1:has-text("nodigt je uit")').count() == 1 and pg.locator('h2').count() == 0 and pg.title() == 'Uitnodiging · Opkomstplanner', 'uitnodiging: kop (h1) in main en eigen paginatitel')
    check(pg.locator('#i-name').get_attribute('maxlength') == '40', 'uitnodiging: gebruikersnaam hoogstens 40 tekens')
    pg.evaluate("localStorage.setItem('fake.noverify','1')")
    register('Vincent Test', 'vincent@test.nl')
    check('/uitnodiging/' in pg.url and pg.locator('text=Bevestig je e-mailadres').count() == 1, 'na registreren eerst e-mailadres bevestigen'); shot('00-bevestigen')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('00-bevestigen-mobiel')
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'bevestigen: mobiel zonder horizontaal scrollen')
    pg.set_viewport_size({'width': 1360, 'height': 900})
    # tabblad dicht en later via een andere weg ingelogd: Mijn speltakken legt uit hoe je toetreedt (elk apparaat) ...
    tl_token = pg.evaluate("localStorage.getItem('opk.invite')")
    pg.evaluate("localStorage.removeItem('opk.invite')"); pg.goto(BASE + '/speltakken'); w(900)
    check(pg.locator('.empty:has-text("Open de link uit die mail nog een keer")').count() == 1 and pg.locator('.invitenote').count() == 0, 'mijn speltakken zonder speltak: uitleg over de link in de mail')
    check(pg.locator('main h1:text-is("Mijn speltakken")').count() == 1, 'mijn speltakken: inhoud in main (landmark)')
    pk = pg.evaluate("(() => { const c = getComputedStyle(document.querySelector('.pick')); return [c.backgroundImage.includes('gradient'), c.boxShadow.includes('inset')]; })()")
    check(all(pk), 'mijn speltakken: lijst in v3-stijl (papier met rand, geen vlakke band)')
    # ... en wijst op dit apparaat meteen naar de uitnodiging die er openstaat
    pg.evaluate("t => localStorage.setItem('opk.invite', t)", tl_token); pg.goto(BASE + '/speltakken'); w(900)
    check(tl_link.endswith('/' + (tl_token or '-')) and pg.locator('.invitenote:has-text("Testgroep · Scouts") a:has-text("Toetreden")').count() == 1, 'mijn speltakken: openstaande uitnodiging op dit apparaat, met Toetreden')
    shot('00c-uitnodiging-open', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('00d-uitnodiging-open-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'mijn speltakken met uitnodiging: mobiel zonder horizontaal scrollen')
    pg.set_viewport_size({'width': 1360, 'height': 900})
    pg.click('.invitenote >> text=Toetreden'); w(800)
    check('/uitnodiging/' in pg.url and pg.locator('text=Bevestig je e-mailadres').count() == 1, 'Toetreden: terug op de uitnodiging')
    check(pg.title() == 'Uitnodiging · Opkomstplanner' and pg.locator('main h1').count() == 1 and pg.locator('main h2:has-text("Bevestig je e-mailadres")').count() == 1, 'uitnodiging via de app geopend: eigen paginatitel, h1 en daaronder h2')
    pg.click('text=Ik heb bevestigd'); w(500)
    check('/uitnodiging/' in pg.url and pg.locator('text=Nog niet bevestigd').count() == 1, 'zonder klikken op de link geen toegang')
    pg.evaluate("localStorage.setItem('fake.clicked','vincent@test.nl'); localStorage.removeItem('fake.noverify')")
    pg.click('text=Ik heb bevestigd'); w(900)
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'account via uitnodiging → dashboard speltak'); shot('01-dashboard')
    check(pg.evaluate("localStorage.getItem('opk.invite')") is None, 'na toetreden: uitnodiging niet meer onthouden')
    check(pg.locator('h1').first.inner_text().strip() == 'Scouts', 'dashboard: speltaknaam is de titel')
    check(pg.locator('.kicker-switch').count() == 1, 'dashboard: knop andere speltak')
    check(pg.locator('.kicker').inner_text().strip() == 'Andere speltak' and pg.locator('.catspread').count() == 0,
          'dashboard: groepsnaam niet nog eens boven de titel (staat in de kopbalk); geen Activiteitengebieden met alleen nullen')
    # nieuwe speltak: welkomstkaart noemt de opkomstdag met een link om hem aan te passen; nog geen lege kaart "Nog geen onderwerp"
    wc = pg.locator('.welcome')
    check(wc.count() == 1 and 'Opkomstdag: zaterdag 14:00–16:30' in wc.locator('.setup-day').inner_text() and (wc.locator('.setup-day a:text-is("Aanpassen")').get_attribute('href') or '').endswith('/instellingen')
          and pg.locator('.hero').count() == 0 and pg.locator('text=Nog geen onderwerp').count() == 0, 'nieuwe speltak: welkomstkaart met opkomstdag en Aanpassen, geen lege opkomstkaart')
    # naast elkaar: de rechterkolom begint gelijk met de kaart links (hier de welkomstkaart, geen ruimte voor het insigne van de komende opkomst)
    col_tops = lambda: pg.evaluate("""(() => { const a = document.querySelector('.dash2 > aside'), f = document.querySelector('.dash2 > :first-child'), l = f.querySelector('.hero, .empty-hero') || f;
      return [Math.round(l.getBoundingClientRect().top), Math.round(a.getBoundingClientRect().top), getComputedStyle(a).marginTop]; })()""")
    ct = col_tops()
    check(ct[0] == ct[1], f'nieuwe speltak: welkomstkaart en kalender beginnen even hoog ({ct})')
    deco = pg.evaluate("[...document.querySelectorAll('.welcome a.btn, header nav a')].map(a => getComputedStyle(a).textDecorationLine + '|' + getComputedStyle(a).fontWeight)")
    check(deco and all(d.split('|')[0] == 'none' for d in deco) and all(d.split('|')[1] == '700' for d in deco), f'knop-links en menulinks zonder onderstreping ({sorted(set(deco))})')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'welkomstkaart mobiel: geen horizontale scroll'); shot('01b-welkom-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # lege opkomstbouwer: één zin uitleg en de weg naar de oefenomgeving
    pg.click('nav >> text=Opkomstbouwer'); w(500)
    eb = pg.locator('main .empty:has-text("tijdlijn per 5 minuten")')
    check(eb.count() == 1 and (eb.locator('a:has-text("Oefenomgeving bekijken")').get_attribute('href') or '').endswith('/s/oefen/bouwer'), 'lege opkomstbouwer: uitleg en link naar de oefenomgeving')
    shot('01c-bouwer-leeg', False)
    # --- team en instellingen
    pg.click('nav >> text=Team & instellingen'); w()
    check(pg.locator('#gs-name').get_attribute('readonly') is not None and pg.locator('.field:has(#gs-name) .hint:has-text("Wijzigen kan de beheerder van de groep in Beheer")').count() == 1,
          'speltak in een groep: naam van de groep alleen-lezen, met uitleg')
    check(pg.locator('.invite .chip:has-text("Teamleider")').count() == 0 and pg.locator('.invite .chip:has-text("Mijn rol overdragen")').count() == 1, 'teamleider kan geen extra teamleider uitnodigen, wel overdragen')
    pg.fill('.invite input[type=email]', 'anna@test.nl'); pg.click('text=Uitnodigingslink maken'); w(600)
    link = pg.locator('.mono-code').inner_text()
    check('/uitnodiging/' in link, 'uitnodigingslink gemaakt')
    bn_txt = pg.locator('.invite .banknote').inner_text()
    check(re.search(r'geldig t/m \d\d-\d\d-\d{4}', bn_txt) is not None and 'dagen geldig' not in bn_txt and pg.locator('.invite .banknote button:has-text("Mail versturen")').count() == 1,
          'eigen uitnodiging: geldig t/m een datum, met Mail versturen')
    check(pg.locator('.invrow:has-text("anna@test.nl")').count() == 1, 'teamleider ziet openstaande uitnodiging')
    # uitnodiging mailen: zonder mailserver valt de knop terug op de eigen mail; met server meldt hij "Gemaild"
    seen = {}
    def mail_ok(route):
        seen['auth'] = route.request.headers.get('authorization', ''); seen['body'] = route.request.post_data or ''
        route.fulfill(status=200, content_type='application/json', body='{"ok":true,"aan":"anna@test.nl"}')
    pg.route('**/api/uitnodiging-mail.php', mail_ok)
    pg.click('button:has-text("Mail versturen")'); w(500)
    check(pg.locator('button:has-text("Gemaild")').count() == 1 and seen.get('auth', '').startswith('Bearer ') and link.rsplit('/', 1)[-1] in seen.get('body', ''), 'uitnodiging mailen via de server')
    pg.unroute('**/api/uitnodiging-mail.php')
    # hetzelfde adres nog eens uitnodigen met dezelfde rechten: dezelfde link, geen tweede rij
    pg.fill('.invite input[type=email]', 'anna@test.nl'); pg.click('text=Uitnodigingslink maken'); w(600)
    check(pg.locator('.invite .mono-code').inner_text() == link and pg.locator('.invrow:has-text("anna@test.nl")').count() == 1 and 'dezelfde link' in pg.locator('.toast').inner_text(),
          'nogmaals uitnodigen met dezelfde rechten: dezelfde link, geen dubbele uitnodiging')
    # verlopen uitnodiging: Vernieuwen maakt een nieuwe link met dezelfde rol en rechten, de oude verdwijnt
    pg.fill('.invite input[type=email]', 'later@test.nl'); pg.click('text=Uitnodigingslink maken'); w(600)
    old_t = pg.locator('.invite .mono-code').inner_text().rsplit('/', 1)[-1]
    fs = lambda: pg.evaluate("JSON.parse(localStorage.getItem('fake.firestore'))")
    old_inv = fs()['invites/' + old_t]
    pg.evaluate("t => { const s = JSON.parse(localStorage.getItem('fake.firestore')), d = s['invites/' + t]; d.expiresAt = Date.now() - 1000; window.__fakeRemote('invites/' + t, d); }", old_t); w(400)
    lrow_inv = pg.locator('.invrow:has-text("later@test.nl")')
    check(lrow_inv.locator('text=verlopen').count() == 1 and lrow_inv.locator('button:has-text("Vernieuwen")').count() == 1 and lrow_inv.locator('button:has-text("Link")').count() == 0,
          'verlopen uitnodiging: knop Vernieuwen in plaats van Link')
    lrow_inv.scroll_into_view_if_needed(); shot('02c-uitnodiging-verlopen', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); lrow_inv.scroll_into_view_if_needed(); shot('02d-uitnodiging-verlopen-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'verlopen uitnodiging mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    lrow_inv.locator('button:has-text("Vernieuwen")').click(); w(700)
    new_t = pg.locator('.invite .mono-code').inner_text().rsplit('/', 1)[-1]; st = fs()
    new_inv = st.get('invites/' + new_t, {})
    check(new_t != old_t and ('invites/' + old_t) not in st and new_inv.get('kind') == 'leiding' and new_inv.get('perms') == old_inv['perms'] and new_inv.get('email') == 'later@test.nl'
          and lrow_inv.count() == 1 and lrow_inv.locator('text=verlopen').count() == 0, 'vernieuwen: nieuwe link met dezelfde rol en rechten, de oude is weg')
    for n in ['Bram', 'Carla']:
        pg.fill('input[placeholder="Naam"]', n); pg.locator('input[placeholder="Naam"]').press('Enter'); w(300)
    cols = pg.evaluate("new Set([...document.querySelectorAll('.settings > fieldset')].map(e => Math.round(e.getBoundingClientRect().left))).size")
    cut = pg.evaluate("[...document.querySelectorAll('.catrow .inp, .setlist .inp')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.value)")
    check(cols == 3 and not cut, f'instellingen breed: 3 kolommen, namen van categorieën niet afgekapt ({cols}, {cut})')
    check(pg.locator('.setlist button[aria-label="Bram verwijderen"]').count() == 1 and pg.locator('.catrow button[aria-label$=" verwijderen"]').count() == pg.locator('.catrow').count(),
          'instellingen: verwijderen is een prullenbak met een naam voor de schermlezer')
    cr = pg.locator('.catrow').first; cur = cr.locator('.sw.cur')
    cat_h = pg.evaluate("document.querySelector('.catrow').closest('fieldset').getBoundingClientRect().height")
    check(pg.locator('.catrow .swatches').count() == 0 and cur.get_attribute('aria-expanded') == 'false' and cat_h < 900, f'instellingen: per categorie één kleurstip, kleuren ingeklapt (kaart {cat_h:.0f} px)')
    c0 = cur.evaluate("e => e.style.getPropertyValue('--c')")
    cur.click(); w(200); n_sw = cr.locator('.swatches .sw').count()
    cr.locator('.swatches .sw[aria-pressed="false"]').first.click(); w(700)
    check(n_sw > 5 and cr.locator('.swatches').count() == 0 and cur.evaluate("e => e.style.getPropertyValue('--c')") != c0, 'instellingen: klik op de kleurstip toont de kleuren, een kleur kiezen klapt weer in')
    shot('02-instellingen')
    # opslaan mislukt (hier: te groot): duidelijke melding, en daarna geen "Logo opgeslagen"
    PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    logo_file = [{'name': 'logo.png', 'mimeType': 'image/png', 'buffer': PNG}]
    pg.evaluate("localStorage.setItem('fake.failWrite','too-big')")
    pg.set_input_files('.logobox input[type=file]', files=logo_file); w(700)
    t = pg.locator('.toast').inner_text()
    check('te groot' in t and 'opgeslagen' not in t and 'verbinding' not in t, f'logo te groot: melding per oorzaak, geen "Logo opgeslagen" ({t})')
    check(pg.locator('.logoprev img').count() == 0 and pg.locator('.savestate.fail').count() == 1, 'mislukt logo wordt teruggezet, kopbalk meldt Niet opgeslagen')
    pg.evaluate("localStorage.removeItem('fake.failWrite')")
    pg.set_input_files('.logobox input[type=file]', files=logo_file); w(700)
    check('Logo opgeslagen' in pg.locator('.toast').inner_text() and pg.locator('.logoprev img').count() == 1 and pg.locator('.savestate.ok').count() == 1, 'logo opgeslagen, kopbalk meldt Opgeslagen')
    pg.click('.logobox >> text=Verwijderen'); w(500)
    # speltak laden mislukt (bijv. daglimiet): uitleg en een knop, niet eeuwig "laden"
    pg.evaluate("localStorage.setItem('fake.failListen','resource-exhausted')"); pg.reload(); w(1000)
    check(pg.locator('h2:has-text("Laden mislukt")').count() == 1 and pg.locator('button:has-text("Opnieuw laden")').count() == 1, 'laden mislukt: uitleg en knop Opnieuw laden'); shot('02b-laden-mislukt', False)
    pg.evaluate("localStorage.removeItem('fake.failListen')"); pg.click('button:has-text("Opnieuw laden")'); w(1500)
    check(pg.locator('nav >> text=Team & instellingen').count() == 1 and pg.locator('h2:has-text("Laden mislukt")').count() == 0, 'opnieuw laden: speltak staat er weer')

    # --- jaarplanning
    pg.click('nav >> text=Jaarplanning'); w(600)
    check(pg.locator('.presets .chip:has-text("Komende 3 maanden")').get_attribute('aria-pressed') == 'true', 'jaarplanning opent standaard op komende 3 maanden')
    pg.click('.presets >> text=Dit seizoen'); w(400)
    rows = pg.locator('.prow:not(.head)'); check(rows.count() > 20, 'jaarplanning toont opkomstdagen')
    first = rows.nth(1)
    # echt typen (niet .fill): de eerste letter maakt de rij aan, daarna moet het veld blijven staan en de focus houden
    first.locator('.ptopic').click(); pg.keyboard.type('Pionieren', delay=40); w(700)
    typed = pg.evaluate("(() => { const a = document.activeElement; return [a && a.classList.contains('ptopic'), a && a.value]; })()")
    check(first.locator('.ptopic').input_value() == 'Pionieren' and typed == [True, 'Pionieren'], f'jaarplanning: onderwerp typen in een lege rij houdt het hele woord en de focus ({typed})')
    first.locator('.addbtn').first.click(); w(300); pg.click('.modal .chip:has-text("Vincent Test")'); pg.click('.modal >> text=Klaar'); w(300)
    first.locator('.addbtn').nth(1).click(); w(300); pg.click('.modal .chip:has-text("Bram")'); pg.click('.modal >> text=Klaar'); w(300)
    first.locator('.brief').click(); w(300); pg.locator('.modal input[type=checkbox]').first.check(); pg.click('.modal >> text=Opslaan'); w(300)
    first.locator('.btn:has-text("Koppelen")').click(); w(300); pg.click('.modal >> text=Nieuwe opkomst'); w(800)
    check('/bouwer/' in pg.url, 'koppelen → nieuwe opkomst in bouwer')
    open_meta(); lw = pg.locator('#om-loc').bounding_box()['width']; gw = pg.locator('#om-group').bounding_box()['width']
    check(lw > gw * 1.8, f'bouwer: veld Locatie twee kolommen breed ({lw:.0f} px)')

    # --- bouwer
    add_block(120, 'Kompasposten', '45', 'Bos', 'Carla')
    check(pg.locator('.blk:has-text("Kompasposten") .names').inner_text().strip() == 'Carla', 'leiding ingedeeld in bouwer')
    blk = pg.locator('.blk:has-text("Kompasposten")'); blk.scroll_into_view_if_needed(); w(200)
    before = blk.locator('.when').inner_text(); gb = blk.locator('.grip').bounding_box()
    pg.mouse.move(gb['x'] + 5, gb['y'] + 10); pg.mouse.down()
    for i in range(1, 9): pg.mouse.move(gb['x'] + 5, gb['y'] + 10 + i * 15); w(20)
    pg.mouse.up(); w(400)
    check(blk.locator('.when').inner_text() != before, 'blok verslepen verandert de tijd')
    pg.click('.blk:has-text("Kompasposten")'); w(300); pg.click('.side >> text=Bewaren in activiteitenbank'); w(300); pg.click('.side .closex'); w(200)
    pg.click('.tabs >> text=Activiteitenbank'); w(300); pg.click('.libs >> text=Inplannen'); w(400)
    check(pg.locator('.blk:has-text("Kompasposten")').count() == 2, 'activiteit uit bank ingepland')
    kp_vals = []
    for i in range(2):
        pg.locator('.blk:has-text("Kompasposten")').nth(i).click(); w(300)
        kp_vals.append((pg.input_value('#bf-dur'), pg.input_value('#bf-loc'), pg.locator('.side .banknote >> text=Uit de activiteitenbank').count()))
        pg.click('.side .closex'); w(200)
    check(kp_vals == [('45', 'Bos', 1)] * 2, f'bewaren en inplannen uit de bank: duur, locatie en koppeling aan de bank komen mee ({kp_vals})')
    kp_lm = lambda: pg.locator('.libs .lib:has-text("Kompasposten") .lm').inner_text()
    pg.locator('.blk:has-text("Kompasposten")').first.click(); w(300); pg.fill('#bf-loc', 'Heide'); w(600)
    pg.click('.side >> text=Bank bijwerken'); w(400); pg.click('.side .closex'); w(200); pg.click('.tabs >> text=Activiteitenbank'); w(300); heide = kp_lm()
    pg.locator('.blk:has-text("Kompasposten")').first.click(); w(300); pg.fill('#bf-loc', 'Bos'); w(600)
    pg.click('.side >> text=Bank bijwerken'); w(400); pg.click('.side .closex'); w(200); pg.click('.tabs >> text=Activiteitenbank'); w(300)
    check('Heide' in heide and 'Bos' in kp_lm(), f'Bank bijwerken zet de velden van het onderdeel in de activiteitenbank ({heide})')
    aanwezig = lambda: int(pg.locator('.summary .stat:has-text("Leiding aanwezig") b').inner_text())
    voor = aanwezig()
    pg.locator('.blk:has-text("Kompasposten")').first.click(); w(300)
    pg.fill('.side input[placeholder^="Andere namen"]', 'Henk'); pg.locator('.side input[placeholder^="Andere namen"]').blur(); w(600); pg.click('.side .closex'); w(200)
    check(aanwezig() == voor + 1 and pg.locator('.present .chip:has-text("Henk")').count() == 1, 'met de hand ingedeelde leiding telt mee als aanwezig')
    # onderdeel verwijderen (Delete) en terugzetten met Ongedaan maken
    kp = pg.locator('.blk:has-text("Kompasposten")'); undo = pg.locator('.toast.show button:has-text("Ongedaan maken")')
    kp.nth(1).click(); pg.keyboard.press('Delete')
    check(soon(lambda: kp.count() == 1 and undo.count() == 1), 'onderdeel verwijderd, melding met Ongedaan maken')
    undo.click()
    check(soon(lambda: kp.count() == 2), 'Ongedaan maken zet het onderdeel terug')
    shot('03-bouwer')

    # --- leiding indelen (tijdlijn naast elkaar)
    pg.click('text=Leiding indelen'); w(500)
    check(pg.locator('.modal .tk-tl .blk').count() >= 2, 'indeelvenster toont tijdlijn')
    check(pg.locator('.modal .tk-head >> text=Opkomst titel').count() == 1, 'indeelvenster heeft veld Opkomst titel')
    tkw = pg.evaluate("""(() => { const h = document.querySelector('.modal .tk-head'), f = h.querySelector('.field'); return Math.round(f.getBoundingClientRect().width) + '/' + Math.round(h.getBoundingClientRect().width); })()""")
    check(tkw.split('/')[0] == tkw.split('/')[1], f'indeelvenster: Opkomst titel over de hele breedte, tijden eronder ({tkw})')
    check(pg.locator('#om-title[placeholder="Opkomst titel"]').count() == 1, 'bouwer: titelveld heet Opkomst titel')
    check(pg.locator('.modal >> text=Eindverantwoordelijke').count() == 0, 'indeelvenster: geen apart veld eindverantwoordelijke')
    pc = pg.locator('.modal .field[role=group]:has(> label:text-is("Planning door")) .chip:has-text("Carla")'); pc.click(); w(400)
    check(pc.get_attribute('aria-pressed') == 'true', 'indeelvenster: Planning door aanpassen')
    pg.locator('.modal .blk:has-text("Kompasposten") .tk-names button:has-text("Vincent Test")').first.click(); w(200)
    shot('04-indelen', False)
    pg.click('.modal >> text=Klaar'); w(300)

    # --- afwezig melden in de jaarplanning: de naam gaat meteen uit de indeling
    names_now = lambda: ' '.join(pg.locator('.blk .names').all_inner_texts())
    check('Carla' in names_now(), 'Carla is ingedeeld bij een onderdeel')
    pg.click('nav >> text=Jaarplanning'); w(500); pg.click('.presets >> text=Dit seizoen'); w(300)
    rows.nth(1).locator('[aria-label^="Afwezigheid "][aria-label$=" aanpassen"]').click(); pg.click('.modal .chip:text-is("Carla")'); pg.click('.modal >> text=Klaar')
    rows.nth(1).locator('.plink').click()
    check(soon(lambda: '/bouwer/' in pg.url and pg.locator('.blk:has-text("Kompasposten")').count() == 2 and 'Carla' not in names_now()), 'afwezig gemeld in de jaarplanning: naam weg uit de indeling')

    # --- pdf
    with pg.expect_download() as dl: pg.click('text=PDF maken')
    check(dl.value.suggested_filename.endswith('.pdf'), 'pdf gedownload'); dl.value.save_as(f'{OUT}/opkomst.pdf')

    # --- inplannen vanuit bouwer houdt namen, bank verwijdert ze
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Sluipspel'); w()
    add_block(120, 'Sluipen', '30', 'Veld', 'Vincent Test')
    pg.click('text=Inplannen'); w()
    check(pg.locator('.modal p:text-is("Kies een datum waar nog geen opkomst aan gekoppeld is. De ingedeelde leiding gaat mee.")').count() == 1 and pg.locator('.modal >> text=eindverantwoordelijke').count() == 0, 'inplannen: uitleg zonder eindverantwoordelijke')
    pg.click('.modal >> text=Hier inplannen >> nth=0'); w(800)
    check('Vincent Test' in pg.locator('.blk:has-text("Sluipen") .names').inner_text(), 'inplannen vanuit bouwer houdt leiding')
    pg.click('text=In bank'); w(600)
    pg.click('nav >> text=Opkomstenbank'); w(500); pg.click('.bcard:has-text("Sluipspel")'); w(); pg.click('.side >> text=Bewerken'); w(700)
    check('Vincent Test' not in pg.locator('.blk:has-text("Sluipen") .names').inner_text(), 'opkomstenbank bewaart geen namen')
    check(soon(lambda: (lambda r: 'Sluipspel' in r[0] and not r[1])(bank_names(fs()))), f'In bank vanuit een ingeplande opkomst met namen: in de data geen namen of eindverantwoordelijke ({bank_names(fs())[1]})')

    # --- overnemen uit bank
    pg.click('nav >> text=Opkomstenbank'); w(500)
    check(pg.locator('.bcard:has-text("Sluipspel") .shared-ico').count() == 1, 'opkomst in de bank is standaard gedeeld met de groep')
    pg.click('.bcard:has-text("Sluipspel")'); w(300)
    check(pg.locator('#tf-share').is_checked(), 'schakelaar Delen met de groep staat aan')
    pg.click('.side >> text=Inplannen'); w(400); pg.click('.modal >> text=Hier inplannen >> nth=0'); w(600)
    check(pg.locator('.modal h2:has-text("Opkomst overnemen")').count() == 1, 'overnemen uit bank opent overneemvenster')
    pg.click('.modal >> text=Klaar'); w(300)
    scouts = re.search(r'/s/([^/]+)/', pg.url).group(1)

    # --- groepsbank volgt ook een andere categorienaam en speltaknaam (de opkomst zelf blijft gelijk)
    shared_sluip = lambda: pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('fake.firestore'));
      const k = Object.keys(s).find(k => k.includes('/gedeeld/') && s[k].opk && s[k].opk.title === 'Sluipspel'); return k ? s[k] : null; }""")
    g0 = shared_sluip()
    check(g0 is not None and len(g0['catDefs']) >= 1 and g0['speltakName'] == 'Scouts', 'gedeelde opkomst staat in de groepsbank, met speltaknaam en categorie')
    pg.click('nav >> text=Team & instellingen'); w(500)
    cat0 = g0['catDefs'][0]['label']
    cat_in = pg.locator('.catrow input[aria-label="Naam categorie"]').nth(pg.evaluate("l => [...document.querySelectorAll('.catrow input[aria-label=\"Naam categorie\"]')].findIndex(i => i.value === l)", cat0))
    cat_in.fill(cat0 + ' anders'); pg.fill('#gs-speltak', 'Scouts anders'); pg.locator('#gs-speltak').blur()
    seen_new = lambda: (lambda g: g and g['speltakName'] == 'Scouts anders' and any(c['label'] == cat0 + ' anders' for c in g['catDefs']))(shared_sluip())
    check(soon(seen_new, 6000), 'groepsbank: andere categorienaam en speltaknaam komen ook in de gedeelde opkomst')
    cat_in.fill(cat0); pg.fill('#gs-speltak', 'Scouts'); pg.locator('#gs-speltak').blur()
    seen_old = lambda: (lambda g: g and g['speltakName'] == 'Scouts' and any(c['label'] == cat0 for c in g['catDefs']))(shared_sluip())
    check(soon(seen_old, 6000), 'groepsbank: en weer terug (geen oude stand blijven hangen)')

    # --- speltak openen zonder verbinding: Firestore meldt eerst "bestaat niet" uit een lege cache → Geen verbinding, niet Geen toegang.
    # De lijsten (opkomsten, planning, …) komen eerst leeg uit de cache en na de verbinding pas 2,5 s ná de speltak zelf (trage verbinding):
    # dan nog niet de pagina met lege lijsten tonen (typen in de jaarplanning maakte zo een tweede rij voor dezelfde datum).
    pg.goto(BASE + f'/s/{scouts}/jaarplanning'); w(900)
    n_rows0, n_links0 = pg.locator('.prow:not(.head)').count(), pg.locator('.prow .plink').count()
    pg.evaluate("localStorage.setItem('fake.offlineFirst', '4000'); localStorage.setItem('fake.offlineSlow', '2500')"); pg.reload()
    check(soon(lambda: pg.locator('.auth-card h2:text-is("Geen verbinding")').count() == 1, 2500) and pg.locator('text=Geen toegang').count() == 0
          and pg.evaluate("localStorage.getItem('opk.sid')") == scouts, 'speltak openen zonder verbinding: melding Geen verbinding, niet Geen toegang; de laatste speltak blijft onthouden')
    shot('40-geen-verbinding', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(150)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'melding Geen verbinding mobiel: geen horizontale scroll'); shot('40b-geen-verbinding-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900})
    check(soon(lambda: pg.locator('.auth-card').count() == 0, 6000) and pg.locator('.loading:has-text("Speltak laden")').count() == 1
          and pg.locator('header.bar').count() == 0 and pg.locator('.prow').count() == 0,
          'verbinding terug, de lijsten nog onderweg: Speltak laden…, geen jaarplanning met lege rijen')
    check(soon(lambda: pg.locator('header.bar').count() == 1 and pg.locator('.auth-card').count() == 0, 6000), 'verbinding terug: de speltak laadt vanzelf (geen Geen toegang die blijft staan)')
    w(300)
    check(n_links0 > 0 and pg.locator('.prow:not(.head)').count() == n_rows0 and pg.locator('.prow .plink').count() == n_links0,
          f'verbinding terug: de jaarplanning verschijnt pas met alle rijen en gekoppelde opkomsten ({n_rows0}/{n_links0})')
    pg.evaluate("localStorage.removeItem('fake.offlineFirst'); localStorage.removeItem('fake.offlineSlow')")
    # Mijn speltakken zonder verbinding: Firestore meldt eerst een lege lijst uit de cache. Niet "nog geen lid", maar wachten op de verbinding
    pg.evaluate("localStorage.setItem('fake.offlineList', '3000')"); pg.goto(BASE + '/speltakken')
    check(soon(lambda: pg.locator('.empty:has-text("Geen verbinding. Je speltakken verschijnen zodra er weer verbinding is.")').count() == 1, 2000)
          and pg.locator('text=geen lid').count() == 0, 'mijn speltakken zonder verbinding: melding Geen verbinding, niet "nog geen lid"')
    shot('40c-speltakken-geen-verbinding', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(150)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'mijn speltakken zonder verbinding mobiel: geen horizontale scroll'); shot('40d-speltakken-geen-verbinding-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900})
    check(soon(lambda: pg.locator('.picklist .pick:has-text("Scouts")').count() == 1, 5000) and pg.locator('.empty').count() == 0, 'verbinding terug: mijn speltakken verschijnen vanzelf')
    pg.evaluate("localStorage.removeItem('fake.offlineList')")
    pg.goto(BASE + '/s/bestaatniet/dashboard'); w(800)
    check(pg.locator('.auth-card h2:text-is("Geen toegang")').count() == 1, 'speltak die niet bestaat: Geen toegang')
    pg.goto(BASE + f'/s/{scouts}/dashboard'); w(900)

    # --- opslaan duurt lang (trage verbinding) en je verlaat de speltak: ook daarbuiten waarschuwt de browser bij sluiten, en Uitloggen wacht
    leave_warns = "(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()"
    pg.evaluate("localStorage.setItem('fake.holdWrite', '6000')")
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(300); pg.fill('#om-title', 'Trage verbinding')
    pg.click('header.bar .acct .btn'); pg.click('.menu >> text=Andere speltak'); w(200)
    check('/speltakken' in pg.url and pg.evaluate(leave_warns), 'speltak verlaten terwijl er nog iets wordt opgeslagen: ook op Mijn speltakken waarschuwt de browser bij sluiten')
    pg.click('.page-head button:has-text("Uitloggen")')
    check(soon(lambda: pg.locator('.toast button:has-text("Toch uitloggen")').count() == 1, 5000) and '/speltakken' in pg.url,
          'uitloggen op Mijn speltakken terwijl er nog iets wordt opgeslagen: eerst een melding met Toch uitloggen')
    shot('41-uitloggen-wacht', False)
    check(soon(lambda: not pg.evaluate(leave_warns), 9000) and pg.evaluate("Object.values(JSON.parse(localStorage.getItem('fake.firestore'))).some(d => d && d.title === 'Trage verbinding')"),
          'daarna alsnog opgeslagen: geen waarschuwing meer')
    pg.evaluate("localStorage.removeItem('fake.holdWrite')")
    pg.goto(BASE + f'/s/{scouts}/bouwer'); w(900)
    pg.click('.pick:has-text("Trage verbinding") >> button:has-text("Verwijderen")'); w(200); pg.click('.pick:has-text("Trage verbinding") >> text=Klik nogmaals'); w(700)
    drop_titled = lambda t: pg.evaluate("t => { const s = JSON.parse(localStorage.getItem('fake.firestore')); Object.keys(s).filter(k => s[k] && s[k].title === t).forEach(k => window.__fakeRemote(k, null)); }", t)
    titled = lambda t: pg.evaluate("t => Object.values(JSON.parse(localStorage.getItem('fake.firestore'))).some(d => d && d.title === t)", t)
    # speltak verlaten vlak na een wijziging (binnen de korte vertraging): meteen weggeschreven, niet pas na een halve seconde.
    # Eerst via Mijn speltakken binnenkomen, zodat die pagina al geladen is en de speltak meteen sluit.
    pg.goto(BASE + '/speltakken'); w(900); pg.click('.picklist .pick:has-text("Scouts") >> button:has-text("Openen")'); w(900)
    pg.click('nav >> text=Opkomstbouwer'); w(600); pg.click('text=Nieuwe opkomst'); w(900)
    left = pg.evaluate("""async () => { const tick = (ms = 25) => new Promise(r => setTimeout(r, ms)), t0 = performance.now();
      const t = document.querySelector('#om-title'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Snel weg'); t.dispatchEvent(new Event('input', { bubbles: true }));
      await tick(); document.querySelector('header.bar .acct .btn').click(); await tick();
      [...document.querySelectorAll('.menu [role=menuitem]')].find(b => b.textContent.includes('Andere speltak')).click();
      for (let i = 0; i < 100 && document.querySelector('header.bar'); i++) await tick(10);
      await tick(40);
      return [location.pathname, Object.values(JSON.parse(localStorage.getItem('fake.firestore'))).some(d => d && d.title === 'Snel weg'), Math.round(performance.now() - t0)]; }""")
    check(left[0].endswith('/speltakken') and left[1] and left[2] < 450, f'speltak verlaten vlak na een wijziging: meteen opgeslagen, niet pas na de korte vertraging ({left})')
    drop_titled('Snel weg')
    # nieuwe versie van de site terwijl er nog iets wordt opgeslagen: eerst wegschrijven (hooguit 3 s), dan pas vanzelf opnieuw laden
    pg.goto(BASE + f'/s/{scouts}/bouwer'); w(900)
    pg.click('text=Nieuwe opkomst'); w(900)
    pg.evaluate("localStorage.setItem('fake.holdWrite', '1200'); sessionStorage.removeItem('opk.herladen'); window.__oud = 1")
    pg.fill('#om-title', 'Net voor de update')
    try:
        with pg.expect_event('load', timeout=7000): pg.evaluate("window.dispatchEvent(new Event('vite:preloadError'))")
    except Exception: pass
    check(pg.evaluate('window.__oud') is None and titled('Net voor de update'), 'nieuwe versie terwijl er nog iets wordt opgeslagen: eerst opgeslagen, dan vanzelf opnieuw geladen')
    pg.evaluate("localStorage.removeItem('fake.holdWrite'); sessionStorage.removeItem('opk.herladen')")
    drop_titled('Net voor de update')
    # Toch uitloggen terwijl er nog iets onderweg is: de melding zegt eerlijk dat het verloren gaat, en daarna telt het niet meer mee
    # (geen waarschuwing bij sluiten en niet eeuwig "Opslaan…" voor wie hierna op deze laptop inlogt)
    pg.goto(BASE + f'/s/{scouts}/bouwer'); w(900)
    auth0 = pg.evaluate("localStorage.getItem('fake.auth.current')")
    pg.evaluate("localStorage.setItem('fake.holdWrite', '7000')")
    pg.click('text=Nieuwe opkomst'); w(300); pg.fill('#om-title', 'Toch weg')
    pg.click('header.bar .acct .btn'); pg.click('.menu >> text=Uitloggen')
    check(soon(lambda: pg.locator('.toast button:has-text("Toch uitloggen")').count() == 1, 5000)
          and 'Log je nu uit, dan gaat dat verloren.' in pg.locator('.toast').inner_text(), 'uitloggen terwijl er nog iets wordt opgeslagen: melding zegt dat het anders verloren gaat')
    pg.click('.toast button:has-text("Toch uitloggen")')
    check(soon(lambda: '/inloggen' in pg.url, 3000) and not pg.evaluate(leave_warns), 'Toch uitloggen: daarna geen waarschuwing meer bij sluiten, ook niet voor wie hierna inlogt')
    soon(lambda: titled('Toch weg'), 8000)
    pg.evaluate("a => { localStorage.removeItem('fake.holdWrite'); localStorage.setItem('fake.auth.current', a); }", auth0)
    drop_titled('Toch weg'); pg.goto(BASE + f'/s/{scouts}/dashboard'); w(900)
    check(pg.locator('header.bar .savestate.busy').count() == 0 and not pg.evaluate(leave_warns), 'weer ingelogd: kopbalk niet op Opslaan…')

    # --- jaarplanning: datum controleren, eigen tijden bij koppelen, iedereen afwezig, weekendkamp op zaterdag
    prow = lambda i: pg.locator('.prow:not(.head)').nth(i)
    def tp(label, h, m):
        f = pg.locator(f'.modal .field:has(> label:text-is("{label}"))')
        f.locator('.tp-h').select_option(str(h)); w(100); f.locator('.tp-m').select_option(str(m)); w(100)
    def row_times(i, h1, h2):
        prow(i).locator('.pdate').click(); w(300)
        tp('Begintijd / vertrek', h1, 0); tp('Eindtijd / terug', h2, 0); pg.click('.modal >> text=Opslaan'); w(400)
    opk_times = lambda: (open_meta(), [pg.locator('.meta .timefield').nth(k).locator(c).input_value() for k in (0, 1) for c in ('.tp-h', '.tp-m')])[1]
    pg.click('nav >> text=Jaarplanning'); w(500); pg.click('.presets >> text=Dit seizoen'); w(400)
    prow(3).locator('.pdate').click(); w(300)
    d_ok = pg.input_value('#md-date'); pg.fill('#md-date', d_ok[:-1]); pg.click('.modal >> text=Opslaan'); w(300)
    check(pg.locator('.modal #md-date').count() == 1 and 'dd-mm-jjjj' in pg.locator('.toast').inner_text(), 'datum met een jaartal van 3 cijfers wordt geweigerd')
    t30 = date.today() + timedelta(days=30)
    pg.fill('#md-date', f'{t30.day}-{t30.month}'); pg.press('#md-date', 'Tab'); w(150)
    check(pg.input_value('#md-date') == t30.strftime('%d-%m-%Y'), f'datum typen als d-m zonder jaartal (bijv. 7-11): de eerstvolgende keer ({t30.day}-{t30.month} → {pg.input_value("#md-date")})')
    # "tot en met" zonder jaartal: de eerstvolgende keer vanaf de datum, niet vanaf vandaag (anders een rij van ruim een jaar)
    tm10, tm8 = date.today() - timedelta(days=10), date.today() - timedelta(days=8)
    pg.fill('#md-date', tm10.strftime('%d-%m-%Y')); pg.fill('#md-end', f'{tm8.day}-{tm8.month}'); pg.press('#md-end', 'Tab'); w(150)
    check(pg.input_value('#md-end') == tm8.strftime('%d-%m-%Y'), f'"tot en met" als d-m zonder jaartal: vanaf de datum, niet volgend jaar ({tm8.day}-{tm8.month} → {pg.input_value("#md-end")})')
    pg.fill('#md-end', '')
    pg.fill('#md-date', d_ok); tp('Begintijd / vertrek', 10, 0); tp('Eindtijd / terug', 12, 0); pg.click('.modal >> text=Opslaan'); w(400)
    check('10:00–12:00' in prow(3).locator('.pdate').inner_text(), 'jaarplanning: eigen tijden opgeslagen')
    prow(3).locator('.btn:has-text("Koppelen")').click(); w(300); pg.click('.modal >> text=Nieuwe opkomst'); w(800)
    check('/bouwer/' in pg.url and opk_times() == ['10', '0', '12', '0'], 'koppelen → nieuwe opkomst neemt de tijden uit de jaarplanning over')
    # concept koppelen aan een rij met andere tijden: melding met knop; iedereen afwezig
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Ochtendspel'); w(300)
    add_block(120, 'Zoeken', '30')
    pg.click('nav >> text=Jaarplanning'); w(500)
    row_times(4, 10, 12)
    prow(4).locator('.addbtn').nth(1).click(); w(300)
    for n in pg.locator('.modal .chip').all_inner_texts(): pg.click(f'.modal .chip:text-is("{n.strip()}")'); w(150)
    pg.click('.modal >> text=Klaar'); w(300)
    prow(4).locator('.btn:has-text("Koppelen")').click(); w(300); pg.click('.modal .pick:has-text("Ochtendspel") >> text=Kiezen'); w(400)
    tbtn = pg.locator('.toast button:has-text("Tijden uit jaarplanning gebruiken")')
    check(tbtn.count() == 1 and '10:00–12:00' in pg.locator('.toast').inner_text(), 'koppelen met andere tijden in de jaarplanning: melding met knop')
    shot('16-tijden-melding', False); pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('16b-tijden-melding-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'melding tijden mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    tbtn.click(); w(600)
    prow(4).locator('.plink').click(); w(800)
    check(opk_times() == ['10', '0', '12', '0'], 'tijden uit de jaarplanning overgenomen in het concept')
    pg.click('button.stat:has-text("Aandachtspunten")'); w(300)
    check(pg.locator('.issues li:has-text("Minimaal 1 leiding nodig"):has-text("0 aanwezig")').count() == 1, 'iedereen afwezig: waarschuwing minimaal leiding, 0 aanwezig')
    # weekendkamp op een zaterdag zonder einddatum: za en zo, met de juiste weekdagen
    pg.click('nav >> text=Jaarplanning'); w(500)
    prow(5).locator('.btn:has-text("Koppelen")').click(); w(300); pg.click('.modal >> text=Weekendkamp'); w(800)
    tabs = pg.locator('.daytab:not(.add)')
    check(tabs.count() == 2 and tabs.nth(0).inner_text().startswith('Zaterdag') and tabs.nth(1).inner_text().startswith('Zondag'), 'weekendkamp op zaterdag: zaterdag en zondag')
    pg.fill('#dy-label', 'Vrijdag'); w(300)
    check(tabs.nth(0).inner_text().startswith('Zaterdag'), 'kampdag met een weekdagnaam toont de weekdag van de datum')
    pg.fill('#dy-label', 'Zaterdag'); w(300); shot('17-kamp-zaterdag', False)
    kday = re.search(r'\d+', tabs.nth(0).inner_text()).group(0)
    add_block(60, 'Kampvuur', '30', 'Veld', 'Carla')
    pg.click('.blk:has-text("Kampvuur")'); w(300); pg.fill('#bf-prep', 'Hout halen'); w(600)
    m0 = pg.input_value('#bf-min'); pg.click('#bf-min'); pg.keyboard.press('Backspace'); pg.keyboard.type('3'); w(200)
    typed, tag3 = pg.input_value('#bf-min'), pg.locator('.blk:has-text("Kampvuur") .tag:has-text("/3 leiding")').count() == 1
    pg.fill('#bf-min', m0); pg.keyboard.press('Tab'); w(600)
    check(typed == '3' and tag3 and pg.input_value('#bf-min') == m0, 'onderdeel: minimaal aantal leiding wissen en 3 typen geeft 3')
    pg.click('.side .closex'); w(300)
    with pg.expect_download() as dl: pg.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/kamp.pdf'); T = pdf_texts(f'{OUT}/kamp.pdf')
    head = [(x, y) for x, y, t in T if re.fullmatch(rf'za {kday} \d\d:\d\d  Kampvuur', t)]
    check(len(head) == 1, f'kamp-pdf: voorbereiding met dag en datum ("za {kday}")')
    check(len(head) == 1 and any(t == 'Carla' and abs(x - head[0][0]) < 0.5 and y < head[0][1] for x, y, t in T), 'kamp-pdf: namen bij de voorbereiding op een eigen regel onder de kop')
    pg.click('nav >> text=Jaarplanning'); w(500)
    check('– zo' in prow(5).locator('.pdate b').inner_text(), 'jaarplanning: weekendkamp loopt t/m zondag')

    # --- concepten verwijderen (in de bouwer en vanaf de startpagina)
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Weg ermee'); w(700)
    pg.click('.plan-head >> button:has-text("Verwijderen")'); w(200); pg.click('.plan-head >> text=Klik nogmaals om te verwijderen'); w(700)
    check(pg.url.rstrip('/').endswith('/bouwer') and pg.locator('.pick:has-text("Weg ermee")').count() == 0, 'concept verwijderd vanuit de bouwer')
    pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Ook weg'); w(700)
    pg.click('nav >> text=Opkomstbouwer'); w(500); shot('06-concepten')
    pg.click('.pick:has-text("Ook weg") >> button:has-text("Verwijderen")'); w(200); pg.click('.pick:has-text("Ook weg") >> text=Klik nogmaals'); w(700)
    check(pg.locator('.pick:has-text("Ook weg")').count() == 0, 'concept verwijderd vanaf de startpagina van de bouwer')
    pg.reload(); w(1000)
    check(pg.locator('.pick:has-text("Ook weg"), .pick:has-text("Weg ermee")').count() == 0, 'verwijderde concepten blijven weg na herladen')

    # --- bewerken uit de bank: niet automatisch opslaan, maar Annuleren / Opslaan / Opslaan als kopie
    sb = lambda t: pg.locator(f'.savebar button:text-is("{t}")')
    pg.click('nav >> text=Opkomstenbank'); w(500); pg.click('.bcard:has-text("Sluipspel")'); w(300); pg.click('.side >> text=Bewerken'); w(700)
    check(sb('Opslaan').is_disabled() and sb('Opslaan als kopie').count() == 1, 'bouwer (bank): onderbalk met Opslaan / Opslaan als kopie')
    pg.fill('#om-title', 'Sluipspel nacht'); w(300)
    check(sb('Opslaan').is_enabled() and pg.locator('.savebar.on').count() == 1, 'bouwer (bank): wijziging zet Opslaan aan')
    pg.click('nav >> text=Opkomstenbank'); w(400)
    check('/bouwer/' in pg.url and pg.locator('.toast >> text=Weggooien').count() == 1, 'weggaan met niet-opgeslagen wijzigingen vraagt eerst')
    sb('Annuleren').click(); w(300)
    check(pg.locator('#om-title').input_value() == 'Sluipspel', 'annuleren zet de bank-versie terug')
    # Weggooien bij een knop die de bouwer open laat (Inplannen): de wijzigingen zijn echt weg, niet alleen de vraag
    pg.fill('#om-title', 'Sluipspel weg'); w(300)
    pg.click('.plan-head button:has-text("Inplannen")'); w(300)
    asked = pg.locator('.modal').count() == 0 and pg.locator('.toast.show button:has-text("Weggooien")').count() == 1
    pg.click('.toast.show button:has-text("Weggooien")'); w(400)
    opened = pg.locator('.modal h2:has-text("Inplannen")').count() == 1
    pg.keyboard.press('Escape'); w(300)
    check(asked and opened and pg.input_value('#om-title') == 'Sluipspel' and pg.locator('.savebar.on').count() == 0 and sb('Opslaan').is_disabled(),
          'bouwer (bank): Inplannen → Weggooien zet de bank-versie terug, daarna niets meer te bewaren')
    pg.click('nav >> text=Opkomstenbank'); w(500)
    check(pg.url.rstrip('/').endswith('/opkomsten') and pg.locator('.toast.show button:has-text("Weggooien")').count() == 0, 'na Weggooien: weggaan zonder vraag (er is niets meer te bewaren)')
    pg.click('.bcard:has-text("Sluipspel")'); w(300); pg.click('.side >> text=Bewerken'); w(700)
    pg.fill('#om-title', 'Nachtspel'); w(200); shot('13-opslaan-balk', False)
    sb('Opslaan als kopie').click(); w(200); sug = pg.input_value('#sb-name')
    pg.click('.savebar button:text-is("Terug")'); w(300); foc = pg.evaluate("document.activeElement && document.activeElement.textContent")
    check(sug == 'Nachtspel' and foc == 'Opslaan als kopie' and pg.input_value('#om-title') == 'Nachtspel' and pg.locator('#sb-name').count() == 0,
          f'bouwer (bank): kopie stelt de gewijzigde titel voor als die vrij is; Terug zet de focus op Opslaan als kopie ({sug!r}, {foc!r})')
    sb('Opslaan als kopie').click(); w(200); pg.fill('#sb-name', 'sluipspel '); w(200)
    check(pg.locator('.savebar >> text=bestaat al').count() == 1 and sb('Kopie opslaan').is_disabled(), 'kopie met bestaande naam (hoofdletters/spaties) geweigerd')
    sb_err = pg.evaluate("(() => { const i = document.getElementById('sb-name'), e = document.getElementById(i.getAttribute('aria-describedby')); return [i.getAttribute('aria-invalid'), e && e.getAttribute('aria-live'), e && e.textContent]; })()")
    check(sb_err[0] == 'true' and sb_err[1] == 'polite' and 'bestaat al' in (sb_err[2] or ''), f'kopie met bestaande naam: veld ongeldig, fout gekoppeld en voorgelezen ({sb_err})')
    pg.fill('#sb-name', 'Nachtspel'); sb('Kopie opslaan').click(); w(700)
    check(pg.locator('#om-title').input_value() == 'Nachtspel', 'opslaan als kopie opent de kopie')
    open_meta(); pg.fill('#om-short', 'Spel in het donker'); w(200); sb('Opslaan').click(); w(500)
    pg.click('nav >> text=Opkomstenbank'); w(500)
    check(pg.locator('.bcard:has-text("Sluipspel")').count() == 1 and 'Spel in het donker' in pg.locator('.bcard:has-text("Nachtspel")').inner_text(), 'origineel en kopie staan in de bank, wijziging opgeslagen')
    pg.click('.bcard:has-text("Nachtspel")'); w(300); pg.fill('#tf-title', 'Sluipspel'); w(200)
    check(sb('Opslaan').is_disabled() and pg.locator('.side >> text=bestaat al').count() == 1, 'zijpaneel opkomstenbank: bestaande naam niet op te slaan')
    sb('Annuleren').click(); w(200)
    # zijpaneel: Inplannen laat het paneel open; Weggooien zet de titel terug
    pg.fill('#tf-title', 'Nachtspel X'); w(200); pg.click('.side button:has-text("Inplannen")'); w(300)
    pg.click('.toast.show button:has-text("Weggooien")'); w(400)
    opened = pg.locator('.modal h2:has-text("Inplannen")').count() == 1
    pg.keyboard.press('Escape'); w(300)
    check(opened and pg.input_value('#tf-title') == 'Nachtspel' and sb('Opslaan').is_disabled(), 'zijpaneel opkomstenbank: Inplannen → Weggooien zet de titel terug')
    pg.click('.side .closex'); w(200)
    check(pg.locator('.toast.show button:has-text("Weggooien")').count() == 0 and pg.locator('#tf-title').count() == 0, 'zijpaneel na Weggooien: sluiten zonder vraag')
    pg.click('nav >> text=Activiteitenbank'); w(400)
    n0 = pg.locator('.bcard').count()
    pg.click('text=Nieuwe activiteit'); w(300); pg.click('.side .closex'); w(300)
    check(pg.locator('#lf-title').count() == 0 and pg.locator('.toast.show button:has-text("Weggooien")').count() == 0 and pg.locator('.bcard').count() == n0,
          'nieuwe activiteit zonder invoer: kruisje sluit direct, zonder vraag')
    pg.click('text=Nieuwe activiteit'); w(300); pg.fill('#lf-title', 'kompasposten'); w(200)
    check(pg.locator('.bcard').count() == n0 and sb('Opslaan').is_disabled(), 'nieuwe activiteit: pas in de bank na Opslaan, bestaande naam geweigerd')
    pg.fill('#lf-title', 'Vlaggenroof'); sb('Opslaan').click(); w(500)
    check(pg.locator('.bcard:has-text("Vlaggenroof")').count() == 1, 'nieuwe activiteit opgeslagen')
    # minimaal 0 leiding (bijv. een pauze) blijft 0 in de bank, ook na herladen; de kaart noemt dan geen minimum
    pg.fill('#lf-min', '0'); pg.keyboard.press('Tab'); w(100); sb('Opslaan').click(); w(900)
    pg.reload(); w(1200); pg.click('.bcard:has-text("Vlaggenroof")'); w(300)
    check(pg.input_value('#lf-min') == '0' and 'min.' not in pg.locator('.bcard:has-text("Vlaggenroof")').inner_text(), 'activiteit met minimaal 0 leiding: blijft 0 (ook na herladen), kaart zonder "min."')
    pg.click('#lf-min'); pg.keyboard.press('Backspace'); pg.keyboard.type('3'); w(100); typed = pg.input_value('#lf-min'); pg.keyboard.press('Tab'); w(100)
    check(typed == '3' and pg.input_value('#lf-min') == '3', 'minimaal aantal leiding: wissen en 3 typen geeft 3 (niet 13)')
    pg.click('#lf-min'); pg.keyboard.press('Backspace'); pg.keyboard.press('Tab'); w(100); kept = pg.input_value('#lf-min')
    pg.fill('#lf-min', '-2'); pg.keyboard.press('Tab'); w(100); low = pg.input_value('#lf-min')
    pg.fill('#lf-min', '45'); pg.keyboard.press('Tab'); w(100)
    check(kept == '3' and low == '0' and pg.input_value('#lf-min') == '30', f'minimaal aantal leiding: leeg laten houdt de waarde, te laag wordt bij wegklikken 0, te hoog 30 ({low})')
    pg.fill('#lf-title', 'Vlaggenroof XL'); w(200); sb('Annuleren').click(); w(200)
    check(pg.locator('#lf-title').input_value() == 'Vlaggenroof' and pg.locator('.bcard:has-text("Vlaggenroof XL")').count() == 0, 'activiteit: annuleren slaat niets op')
    # Esc in "Naam van de kopie" gaat alleen terug: het paneel blijft open (zonder en met wijzigingen), de focus op Opslaan als kopie
    sb('Opslaan als kopie').click(); w(200); pg.locator('#sb-name').press('Escape'); w(300)
    esc_plain = pg.locator('#lf-title').count() == 1 and pg.locator('#sb-name').count() == 0
    pg.fill('#lf-title', 'Vlaggenroof XL'); w(200); sb('Opslaan als kopie').click(); w(200); sug = pg.input_value('#sb-name')
    pg.locator('#sb-name').press('Escape'); w(300); foc = pg.evaluate("document.activeElement && document.activeElement.textContent")
    check(sug == 'Vlaggenroof XL', f'activiteit: kopie stelt de gewijzigde titel voor als die nog vrij is ({sug!r})')
    check(esc_plain and pg.locator('#sb-name').count() == 0 and pg.locator('#lf-title').count() == 1 and pg.input_value('#lf-title') == 'Vlaggenroof XL'
          and pg.locator('.toast.show button:has-text("Weggooien")').count() == 0 and foc == 'Opslaan als kopie',
          f'Esc bij Naam van de kopie: alleen terug, paneel en wijzigingen blijven, focus op Opslaan als kopie ({foc!r})')
    sb('Annuleren').click(); w(200)
    pg.fill('#lf-short', 'Twee teams'); sb('Opslaan als kopie').click(); w(200)
    check(pg.locator('#sb-name').input_value() == 'Vlaggenroof (kopie)', 'kopie krijgt voorstel voor een vrije naam')
    pg.fill('#sb-name', 'Vlaggenroof groot'); sb('Kopie opslaan').click(); w(500)
    foc = pg.evaluate("document.activeElement && document.activeElement.textContent")
    check(pg.input_value('#lf-title') == 'Vlaggenroof groot' and foc == 'Opslaan als kopie', f'na Kopie opslaan: de kopie staat open, focus op Opslaan als kopie ({foc!r})')
    check(pg.locator('.bcard:has-text("Vlaggenroof")').count() == 2 and 'Twee teams' not in pg.locator('.bcard:has-text("Vlaggenroof"):not(:has-text("groot"))').inner_text(), 'activiteit: kopie opgeslagen, origineel ongewijzigd')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300); pg.fill('#lf-short', 'Twee teams, twee vlaggen'); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'opslaan-balk mobiel: geen horizontale scroll'); shot('14-opslaan-mobiel', False)
    sb('Opslaan').click(); w(300); pg.set_viewport_size({'width': 1360, 'height': 900}); pg.click('.side .closex'); w(200)

    # --- afgeronde activiteiten en opkomsten uit de bank verwijderen
    card = lambda t: pg.locator(f'.bwrap:has(.bcard:has-text("{t}"))')
    card('Vlaggenroof groot').locator('.carddel').click(); w(150); card('Vlaggenroof groot').locator('text=Verwijderen?').click(); w(600)
    check(pg.locator('.bcard:has-text("Vlaggenroof groot")').count() == 0 and pg.locator('.bcard:has-text("Vlaggenroof")').count() == 1, 'activiteit verwijderd vanaf de kaart')
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(900)
    lib_back = pg.evaluate("Object.entries(JSON.parse(localStorage.getItem('fake.firestore'))).some(([k, v]) => k.includes('/activiteiten/') && v && v.title === 'Vlaggenroof groot')")
    check(pg.locator('.bcard:has-text("Vlaggenroof groot")').count() == 1 and lib_back, 'activiteit verwijderd: Ongedaan maken zet hem terug (ook opgeslagen)')
    card('Vlaggenroof groot').locator('.carddel').click(); w(150); card('Vlaggenroof groot').locator('text=Verwijderen?').click(); w(600)
    for t in ('Bankweg', 'Bouwerweg'):
        pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', t); w(700)
        pg.click('.plan-head >> button:has-text("In bank")'); w(600)
    pg.click('nav >> text=Opkomstenbank'); w(500)
    check(card('Bankweg').locator('.carddel').count() == 1, 'opkomstenbank: verwijderknop op de kaart'); shot('15-bank-verwijderen')
    card('Bankweg').locator('.carddel').click(); w(150); shot('15b-bank-verwijderen-bevestigen'); card('Bankweg').locator('text=Verwijderen?').click(); w(600)
    check(pg.locator('.bcard:has-text("Bankweg")').count() == 0, 'afgeronde opkomst verwijderd vanaf de kaart')
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(900)
    check(pg.locator('.bcard:has-text("Bankweg")').count() == 1, 'opkomst uit de bank verwijderd: Ongedaan maken zet hem terug')
    card('Bankweg').locator('.carddel').click(); w(150); card('Bankweg').locator('text=Verwijderen?').click(); w(600)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'opkomstenbank mobiel met verwijderknoppen: geen horizontale scroll'); shot('15c-bank-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(300)
    pg.click('.bcard:has-text("Bouwerweg")'); w(300); pg.click('.side >> text=Bewerken'); w(700)
    pg.click('.plan-head >> button:has-text("Verwijderen")'); w(200); pg.click('.plan-head >> text=Klik nogmaals om te verwijderen'); w(700)
    check(pg.url.rstrip('/').endswith('/bouwer') and pg.locator('.pick:has-text("Bouwerweg")').count() == 0, 'bank-opkomst verwijderd vanuit de bouwer')
    check(pg.locator('.toast > span').inner_text().strip() == '"Bouwerweg" uit de bank verwijderd' and pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1,
          'melding bij verwijderen uit de bank (nergens ingepland: geen extra zin), met Ongedaan maken')
    pg.reload(); w(1000); pg.click('nav >> text=Opkomstenbank'); w(500)
    check(pg.locator('.bcard:has-text("Bankweg"), .bcard:has-text("Bouwerweg")').count() == 0 and pg.locator('.bcard:has-text("Sluipspel")').count() == 1, 'verwijderde bank-opkomsten blijven weg, andere blijven staan')

    # --- de opkomst wordt elders verwijderd (ander apparaat) terwijl "Leiding indelen" open staat: geen wit scherm
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Verdwijnt'); w(300)
    pg.click('.plan-head >> text=Inplannen'); w(300); pg.fill('.modal input[placeholder^="Andere datum"]', '02-03-2030'); pg.click('.modal >> text=Op deze datum'); w(500)
    pg.click('.ctx >> text=Leiding indelen'); w(1300)
    check(pg.locator('.modal h2:has-text("Leiding indelen")').count() == 1, 'ingepland en Leiding indelen geopend')
    n_err = len(errors)
    pg.evaluate("""() => { const [, sid, , oid] = location.pathname.match(/\\/s\\/([^/]+)\\/(bouwer)\\/([^/]+)/); const s = JSON.parse(localStorage.getItem('fake.firestore'));
      const pl = Object.keys(s).find(k => k.startsWith('speltakken/' + sid + '/planning/') && s[k].opkId === oid);
      window.__fakeRemote('speltakken/' + sid + '/opkomsten/' + oid, null); if (pl) window.__fakeRemote(pl, null); }"""); w(800)
    check(len(errors) == n_err and pg.locator('.modal').count() == 0 and pg.locator('header.bar nav a').count() == 6 and pg.locator('text=Deze opkomst bestaat niet (meer)').count() == 1,
          'opkomst elders verwijderd terwijl Leiding indelen open staat: venster dicht, app werkt door')
    # hetzelfde met het venster Inplannen open
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Verdwijnt ook'); w(900)
    pg.click('.plan-head >> text=Inplannen'); w(400)
    check(pg.locator('.modal h2:has-text("Inplannen")').count() == 1, 'concept: venster Inplannen geopend')
    n_err = len(errors)
    pg.evaluate("""() => { const [, sid, , oid] = location.pathname.match(/\\/s\\/([^/]+)\\/(bouwer)\\/([^/]+)/);
      window.__fakeRemote('speltakken/' + sid + '/opkomsten/' + oid, null); }"""); w(800)
    check(len(errors) == n_err and pg.locator('.modal').count() == 0 and pg.locator('.crash').count() == 0 and pg.locator('header.bar nav a').count() == 6
          and pg.locator('text=Deze opkomst bestaat niet (meer)').count() == 1, 'opkomst elders verwijderd terwijl Inplannen open staat: venster dicht, geen foutscherm, menu blijft')
    # hetzelfde met Datum en soort open op een rij die elders wordt leeggemaakt
    pg.click('nav >> text=Jaarplanning'); w(500); range0 = pg.evaluate("sessionStorage.getItem('opk.range')"); pg.click('button:has-text("Extra datum")'); w(300)
    pg.fill('#xd-date', '03-03-2030'); pg.fill('#xd-topic', 'Rij verdwijnt'); pg.click('.modal button:has-text("Toevoegen")'); w(1200)
    vrow = pg.locator('.prow:not(.head)').nth(pg.evaluate("[...document.querySelectorAll('.prow:not(.head)')].findIndex(r => r.querySelector('.ptopic')?.value === 'Rij verdwijnt')"))
    vrow.locator('.pdate').click(); w(300)
    check(pg.locator('.modal h2:has-text("Datum en soort")').count() == 1, 'extra datum: venster Datum en soort geopend')
    n_err = len(errors)
    pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('fake.firestore')), k = Object.keys(s).find(k => k.includes('/planning/') && s[k] && s[k].topic === 'Rij verdwijnt');
      if (k) window.__fakeRemote(k, null); }"""); w(800)
    check(len(errors) == n_err and pg.locator('.modal').count() == 0 and pg.locator('.crash').count() == 0 and pg.locator('header.bar nav a').count() == 6 and pg.locator('.ptopic').count() > 0,
          'rij elders leeggemaakt terwijl Datum en soort open staat: venster weg, jaarplanning werkt door')
    pg.evaluate("r => r === null ? sessionStorage.removeItem('opk.range') : sessionStorage.setItem('opk.range', r)", range0)

    # --- dashboard, banken, kamp
    pg.click('nav >> text=Dashboard'); w(700); check(pg.locator('.hero').count() == 1, 'dashboard toont komende opkomst'); shot('05-dashboard')
    check(int(pg.locator('.counts li:has-text("met aandachtspunten") b').inner_text()) >= 1, 'seizoen: opkomsten met aandachtspunten worden geteld')
    cal_warn = pg.locator('.cal .cday.warn').count()
    if not cal_warn: pg.click('.cal-head [aria-label="Volgende maand"]'); w(200); cal_warn = pg.locator('.cal .cday.warn').count(); pg.click('.cal >> text=Naar deze maand'); w(200)
    check(cal_warn >= 1, 'agenda: opkomst met aandachtspunten krijgt die kleur')
    check(pg.locator('.hero .people .lbl:text-is("Eindverantwoordelijke")').count() == 0 and pg.locator('.hero .people .lbl:text-is("Planning door")').count() == 1, 'dashboard: één vak Planning door')
    pg.dblclick('.hero h2.hero-title'); w(200); pg.fill('.hero input.inline-edit', 'Dashboardtitel'); pg.keyboard.press('Enter'); w(600)
    check(pg.locator('.hero h2.hero-title').inner_text() == 'Dashboardtitel', 'dashboard: titel aanpassen met dubbelklik')
    pg.dblclick('.hero h2.hero-title'); w(200); pg.fill('.hero input.inline-edit', 'Weg ermee'); pg.keyboard.press('Escape'); w(300)
    check(pg.locator('.hero h2.hero-title').inner_text() == 'Dashboardtitel', 'dashboard: Esc annuleert')
    pg.dblclick('.hero .hero-short'); w(200); pg.fill('.hero textarea.inline-edit', 'Korte uitleg'); pg.click('.hero .eyebrow'); w(600)
    check(pg.locator('.hero p.hero-short').inner_text() == 'Korte uitleg', 'dashboard: omschrijving aanpassen, opslaan bij wegklikken')
    pg.locator('.hero .facts [data-editable]').first.dblclick(); w(200)
    check(pg.locator('.hero .time-edit').count() == 1, 'dashboard: tijden aanpassen met dubbelklik')
    pg.select_option('.hero .time-edit .tp-h >> nth=1', '17'); w(500); pg.click('.hero .time-edit >> text=Klaar'); w(300)
    check('–17:' in pg.locator('.hero .facts').inner_text(), 'dashboard: eindtijd aangepast')
    shot('05b-dashboard-bewerkt')
    pg.click('nav >> text=Activiteitenbank'); w(400); check(pg.locator('.bcard').count() >= 1, 'activiteitenbank gevuld')
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Weekendkamp'); w(600)
    pg.fill('#om-title', 'Herfstkamp'); pg.click('.daytab >> nth=1'); w(300); pg.click('text=Maaltijden toevoegen'); w(400)
    check(pg.locator('.blk').count() == 3, 'weekendkamp: 3 maaltijden op zaterdag'); shot('06-kamp')
    check(pg.locator('.meta .field:has-text("Categorieën van het kamp")').count() == 1 and pg.locator('#om-short').get_attribute('placeholder').startswith('Waar gaat dit kamp over?'),
          'weekendkamp: details spreken van het kamp (categorieën, omschrijving), niet van een opkomst of activiteit')
    # kamp vr–zo inplannen op een zaterdag (5 juni 2027): vrijdag 4 t/m zondag 6 juni, de dagen kloppen; de vaste zaterdag valt in het kamp, dus niet "verzet"
    pg.click('.plan-head >> text=Inplannen'); w(300)
    check(all(' t/m ' in t for t in pg.locator('.modal .pick .info b').all_inner_texts()[:3]), 'kamp inplannen: de lijst toont het hele bereik van het kamp')
    pg.fill('.modal input[placeholder^="Andere datum"]', '05-06-2027'); pg.click('.modal >> text=Op deze datum'); w(700)
    kt = pg.locator('.toast').inner_text()
    check('Ingepland op vrijdag 4 t/m zondag 6 juni 2027' in kt and 'vrijdag 4 t/m zondag 6 juni 2027' in pg.locator('.ctx').inner_text(), f'kamp op een zaterdag: vrijdag t/m zondag ingepland, ook in de melding ({kt})')
    check([t.split('\n')[0] for t in pg.locator('.daytab:not(.add) b').all_inner_texts()] == ['Vrijdag 4 jun', 'Zaterdag 5 jun', 'Zondag 6 jun'], 'kamp op een zaterdag: dagtabs vr 4, za 5, zo 6 juni')
    # telefoon: "Ingepland op" en de datum vallen niet uit elkaar (één stuk tekst, de datum begint op dezelfde regel)
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200)
    io = pg.evaluate("""(() => { const s = [...document.querySelectorAll('.ctx > span')].find(x => x.textContent.startsWith('Ingepland op ')); if (!s) return null;
      return [s.textContent, Math.abs(s.querySelector('b').getClientRects()[0].top - s.getBoundingClientRect().top) <= 4]; })()""")
    check(io is not None and io[0] == 'Ingepland op vrijdag 4 t/m zondag 6 juni 2027' and io[1], f'bouwer mobiel: Ingepland op en de datum samen op een regel ({io})')
    pg.locator('.ctx').screenshot(path=f'{OUT}/16d-ingepland-op-mobiel.png')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('.plan-head >> button:has-text("Jaarplanning")'); w(900)
    kr = pg.locator('.prow:has(.plink:has-text("Herfstkamp")) .pdate').inner_text()
    check('vr 4 – zo 6 jun' in kr and 'verzet van' not in kr, f'jaarplanning: kamp vr 4 – zo 6 juni, niet "verzet van" (de vaste zaterdag valt in het kamp) ({kr})')

    # --- mobiel
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.click('nav a[href$="/bouwer"]'); w(500)
    check(pg.locator('.pick button:has-text("Verwijderen")').count() >= 1 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobiel: concepten met verwijderknop, geen horizontale scroll'); shot('06-concepten-mobiel')
    pg.click('nav >> text=Jaarplanning'); w(500)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobiel: geen horizontale scroll')
    shot('07-mobiel', False)
    pg.click('nav >> text=Dashboard'); w(500)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobiel dashboard: geen horizontale scroll'); shot('07-mobiel-dashboard', False)
    hero_ok = pg.evaluate("""(() => { const r = s => document.querySelector(s).getBoundingClientRect();
      const h = r('.hero'), t = r('.hero .hero-title'), d = r('.hero .hero-date'), e = r('.hero .eyebrow');
      return t.left - h.left < 40 && t.width > h.width * 0.8 && t.top >= d.bottom - 2 && e.left >= d.right - 2 && e.top < d.bottom; })()""")
    check(hero_ok, 'mobiel dashboard: titel en feiten over de hele breedte, datum-sticker linksboven zonder overlap')
    pg.click('nav >> text=Dashboard'); w(600); pg.locator('.hero .facts [data-editable]').first.dblclick(); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobiel: dashboard tijden bewerken zonder horizontale scroll')
    shot('07b-mobiel-dashboard', False); pg.keyboard.press('Escape'); w(200)
    pg.click('nav >> text=Jaarplanning'); w(500)
    for wd in (344, 360, 412):  # o.a. Samsung-toestellen: hele menubalk in beeld
        pg.set_viewport_size({'width': wd, 'height': 780}); w(200)
        inview = pg.evaluate("[...document.querySelectorAll('header.bar nav a, header.bar .acct .btn')].every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1; })")
        check(inview, f'mobiel {wd}px: alle menu-items en account in beeld')
    pg.click('header.bar .acct .btn'); w(200); check(pg.locator('.menu >> text=Uitloggen').is_visible(), 'mobiel: accountmenu opent')
    pg.mouse.click(5, 600); w(200)
    # tablet en telefoon dwars: het hele menu in beeld (niet afgekapt achter een onzichtbare schuifbalk), het account boven bij de naam
    NAVFIT = """(() => { const n = document.querySelector('header.bar nav'), nb = n.getBoundingClientRect(), a = document.querySelector('header.bar .acct').getBoundingClientRect();
      return [n.scrollWidth <= n.clientWidth + 1 && [...n.querySelectorAll('a')].every(x => { const r = x.getBoundingClientRect(); return r.left >= nb.left - 1 && r.right <= nb.right + 1; }),
        a.bottom <= nb.top + 1, document.documentElement.scrollWidth <= innerWidth + 1]; })()"""
    for wd in (601, 640, 768, 820, 900, 901, 1100, 1200):
        pg.set_viewport_size({'width': wd, 'height': 800}); w(150)
        if wd == 768: shot('07c-menu-tablet', False)
        check(pg.evaluate(NAVFIT) == [True, True, True], f'{wd}px: alle zes menuknoppen in beeld, account op de eerste regel ({pg.evaluate(NAVFIT)})')
    # elke breedte (ook een kleine laptop, een lange naam of zonder de webfonts): het account rechts op de regel van de naam, nooit alleen
    # op een eigen regel; past het niet op één regel, dan het menu eronder. Op een tablet blijft de vaste balk laag.
    BARFIT = """(() => { const q = s => document.querySelector(s).getBoundingClientRect(), bar = q('header.bar'), b = q('header.bar .brand'), a = q('header.bar .acct'), n = document.querySelector('header.bar nav');
      return [n.scrollWidth <= n.clientWidth + 1, Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 12, a.right >= bar.right - 2, Math.round(bar.height) < 120, document.documentElement.scrollWidth <= innerWidth + 1]; })()"""
    bar_bad = {}
    for nm in (None, 'Vincent van der Luiten'):
        if nm: pg.evaluate("n => { document.querySelector('.acct-name').textContent = n; }", nm)
        for wd in (601, 820, 1024, 1180, 1280, 1300, 1340, 1360, 1440):
            pg.set_viewport_size({'width': wd, 'height': 800}); w(150)
            r = pg.evaluate(BARFIT)
            if r != [True] * 5: bar_bad[f'{nm or "eigen naam"} {wd}'] = r
        if nm: pg.set_viewport_size({'width': 1340, 'height': 800}); w(150); shot('07d-kopbalk-lange-naam', False)
    pg.set_viewport_size({'width': 820, 'height': 800}); w(150); bar820 = pg.evaluate("Math.round(document.querySelector('header.bar').getBoundingClientRect().height)")
    check(not bar_bad and bar820 < 120, f'kopbalk 601–1440 px: account rechts naast de naam, menu past, balk lager dan 120 px (820 px: {bar820}) ({bar_bad})')
    pg.reload(); w(900)
    pg.set_viewport_size({'width': 1360, 'height': 900})

    # --- uitnodiging accepteren als tweede persoon
    logout_to(link); register('Anna de Vries', 'anna@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'uitnodiging geaccepteerd → dashboard speltak')
    anna_uid = pg.evaluate("JSON.parse(localStorage.getItem('fake.auth.current')).uid")
    check(pg.evaluate("t => JSON.parse(localStorage.getItem('fake.firestore'))['invites/' + t].usedBy", link.rsplit('/', 1)[-1]) == anna_uid, 'uitnodiging na toetreden als gebruikt gemarkeerd')
    pg.goto(link); w(700)
    check(pg.locator('main h1:has-text("Je bent al lid")').count() == 1 and pg.locator('p:has-text("Testgroep · Scouts")').count() >= 1 and pg.locator('.err').count() == 0,
          'eigen, al gebruikte uitnodiging nog eens openen: "Je bent al lid", geen fout'); shot('05b-al-lid', False)
    pg.click('button:has-text("Openen")'); w(900)
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'al lid: Openen gaat naar de speltak')
    # open uitnodiging voor iemand die al lid is (bijv. intussen direct toegevoegd): geen fout, uitnodiging telt als gebruikt
    scouts_sid = re.search(r'/s/([^/]+)/', pg.url).group(1)
    pg.evaluate("""sid => { const sp = JSON.parse(localStorage.getItem('fake.firestore'))['speltakken/' + sid];
      window.__fakeRemote('invites/dubbelanna', { kind: 'leiding', role: 'leiding', email: 'anna@test.nl', gid: sp.gid, groupName: sp.groupName, sid, speltakName: sp.name,
        perms: { plan: true, build: true, bank: true, settings: false }, invitedBy: 'uroot', invitedByName: 'Beheer (demo)', createdAt: Date.now(), expiresAt: Date.now() + 864e5, usedBy: null, transfer: false }); }""", scouts_sid)
    pg.goto(BASE + '/uitnodiging/dubbelanna'); w(900)
    check(pg.locator('main h1:has-text("Je bent al lid")').count() == 1 and pg.locator('.err').count() == 0
          and soon(lambda: pg.evaluate("JSON.parse(localStorage.getItem('fake.firestore'))['invites/dubbelanna'].usedBy") == anna_uid),
          'open uitnodiging terwijl je al lid bent: "Je bent al lid", uitnodiging als gebruikt gemarkeerd')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('05c-al-lid-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'al lid mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900})
    pg.goto(BASE + '/'); w(900)
    pg.click('nav >> text=Instellingen'); w(400)
    check(pg.locator('text=Anna de Vries (jij)').count() == 1, 'nieuw lid staat in het team')

    # gebruikte uitnodiging, niet ingelogd: geen fout, maar de vraag of je hem zelf gebruikte en een knop Inloggen
    logout_to(link)
    check(pg.locator('text=Heb je hem zelf gebruikt? Log dan in.').count() == 1 and pg.locator('a:has-text("Inloggen")').count() == 1 and pg.locator('.err').count() == 0,
          'gebruikte uitnodiging zonder in te loggen: uitleg en knop Inloggen, geen fout')

    # --- Greet wordt leiding; Beheer (totaal) maakt haar beheerder en wisselt de teamleider
    logout_to(ga_link); register('anna de  vries', 'ga@test.nl')
    check('/uitnodiging/' in pg.url and pg.locator('text=al in gebruik binnen Testgroep').count() == 1, 'naam is uniek binnen de groep')
    # de naam kan ook van jezelf zijn (bestaand account, bijv. teamleider van een andere speltak): de melding vraagt dat, met een knop naar inloggen
    tk_btn = pg.locator('.auth-card button:has-text("Inloggen met dit adres")')
    check('Is dat jouw naam? Dan heb je al een account' in pg.locator('#i-err').inner_text() and tk_btn.count() == 1 and pg.get_attribute('#i-name', 'aria-invalid') == 'true',
          'naam bezet bij registreren: misschien je eigen account, met de knop Inloggen met dit adres')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200); shot('05d-uitnodiging-naam-bezet-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'naam bezet bij registreren mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    tk_btn.click(); w(300)
    check(pg.locator('button.btn.primary:has-text("Inloggen en toetreden")').count() == 1 and pg.input_value('#i-pw') == 'geheim123' and pg.locator('#i-name').count() == 0 and pg.locator('#i-err').count() == 0,
          'Inloggen met dit adres: naar inloggen, het wachtwoord blijft staan')
    pg.click('.auth-card button:has-text("Nieuw account aanmaken")'); w(300)
    register('Greet Beheer', 'ga@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'leiding via uitnodiging → dashboard speltak')
    check(pg.locator('.namenote').count() == 0, 'geen melding: voor- en achternaam bij registreren ingevuld')
    # iemand anders opent een al gebruikte uitnodiging: die werkt niet nog een keer
    pg.goto(link); w(700)
    check(pg.locator('text=Deze uitnodiging is al gebruikt').count() == 1, 'dezelfde uitnodiging werkt niet nog een keer')
    check(pg.locator('p.err:has-text("al gebruikt")').evaluate('e => getComputedStyle(e).fontWeight') == '700', 'melding in foutstijl')
    pg.goto(BASE + '/account'); w(700)
    check(pg.title() == 'Opkomstplanner · Mijn account' and pg.locator('.page-head button:has-text("Uitloggen")').count() == 1 and pg.locator('.page-head button:has-text("Terug")').count() == 1, 'mijn account: kop met Terug en Uitloggen')
    check(pg.locator('#ac-first').input_value() == 'Greet' and pg.locator('#ac-last').input_value() == 'Beheer', 'mijn account toont voor- en achternaam')
    pg.fill('#ac-last', 'de Beheerder'); pg.click('text=Opslaan'); w(600)
    shot('06-account')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200)
    ac = pg.evaluate("(() => { const c = document.querySelector('main .card').getBoundingClientRect(), b = [...document.querySelectorAll('.page-head .btn')].map(x => Math.round(x.getBoundingClientRect().top)); return [Math.round(c.left), Math.round(innerWidth - c.right), new Set(b).size]; })()")
    check(ac == [16, 16, 1], f'mijn account mobiel: kaarten met 16 px zijmarge (zoals in een speltak), Terug en Uitloggen op één regel ({ac})')
    shot('06b-account-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('button:has-text("Wachtwoord wijzigen")'); w(500)
    check(pg.url.rstrip('/').endswith('/account') and 'We hebben een mail gestuurd naar ga@test.nl' in pg.locator('.toast').inner_text(),
          'mijn account: wachtwoord wijzigen stuurt meteen de mail, zonder je adres te typen')
    sid_before = pg.evaluate("localStorage.getItem('opk.sid')")
    pg.click('.page-head button:has-text("Uitloggen")'); w(700)
    check(sid_before is not None and pg.evaluate("localStorage.getItem('opk.sid')") is None and '/inloggen' in pg.url, 'uitloggen: de laatste speltak wordt vergeten')
    def login(email, pw):
        logout_to(BASE + '/inloggen'); pg.fill('input[type=email]', email); pg.fill('input[type=password]', pw); pg.click('.btn.primary'); w(1200)
    login('vluiten2907@gmail.com', 'demo123'); open_group()
    lrow = lambda name: pg.locator(f'.leiding .subrow:has-text("{name}")')
    check(lrow('Anna de Vries').count() == 1 and lrow('Vincent Test').count() == 1, 'leidingoverzicht toont alle leiding')
    check(lrow('Anna de Vries').locator('text=anna@test.nl').count() == 1 and lrow('Anna de Vries').locator('text=Anna de Vries · ').count() + lrow('Anna de Vries').locator('text=· Anna de Vries').count() >= 1, 'leidingoverzicht toont e-mailadres en voor- en achternaam')
    lrow('Greet Beheer').locator('label:has-text("Beheerder") input').check(); w(800)
    check(pg.locator('.groupcard .member:not(.spcard):has-text("ga@test.nl")').count() == 1, 'beheerder gekozen uit de leiding')
    lrow('Beheer (demo)').locator('text=Verwijderen').click(); w(150); lrow('Beheer (demo)').locator('text=Zeker?').click(); w(800)
    check(lrow('Beheer (demo)').count() == 0, 'leiding verwijderd uit speltak')
    lrow('Vincent Test').locator('label:has-text("Teamleider") input').click(); w(300)
    check(lrow('Vincent Test').locator('select[aria-label="Nieuwe teamleider"]').count() == 1, 'laatste teamleider uitzetten vraagt een opvolger')
    lrow('Vincent Test').locator('select[aria-label="Nieuwe teamleider"]').select_option(label='Anna de Vries'); lrow('Vincent Test').locator('text=Overdragen').click(); w(800)
    check(pg.locator('.groupcard .member:has-text("Scouts") >> text=Teamleider: Anna de Vries').count() == 1 and lrow('Vincent Test').count() == 1, 'opvolger is teamleider, oude teamleider blijft leiding')
    lrow('Greet Beheer').locator('label:has-text("Instellingen") input').check(); w(600)
    check(lrow('Greet Beheer').locator('label:has-text("Instellingen") input').is_checked(), 'beheerder past rechten van leiding aan')
    shot('07-leidingoverzicht')

    # --- Beheer (groep)
    login('ga@test.nl', 'geheim123')
    check('/beheer' in pg.url, 'beheerder groep → beheerpagina')
    open_group()
    check(pg.locator('.groupcard .member:has-text("Scouts") >> text=Teamleider: Anna de Vries').count() == 1, 'beheerder ziet speltak en teamleider')
    check(pg.locator('h2:has-text("Beheer (totaal)")').count() == 0, 'beheerder groep ziet geen Beheer (totaal)')
    open_sp('Scouts')
    pg.fill('input[placeholder="e-mailadres nieuw lid"]', 'lid@test.nl'); pg.click('.groupcard .member >> button:text-is("Uitnodigen")'); w(800)
    check('/uitnodiging/' in invite_link() and pg.locator('.banknote:has-text("Leiding")').count() >= 1, 'beheerder groep nodigt leiding uit voor speltak')
    pg.click('.groupcard .gc-head'); w(200); check(pg.locator('.groupcard .member').count() == 0, 'groep klapt dicht')
    pg.click('.groupcard .gc-head'); w(200)
    shot('08-beheer-groep')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'beheer mobiel: geen horizontale scroll'); shot('09-beheer-mobiel')
    pg.set_viewport_size({'width': 1360, 'height': 900})
    pg.fill('input[placeholder^="Naam nieuwe speltak"]', 'Welpen'); pg.click('text=Speltak aanmaken'); w(800)
    pg.click('.groupcard .member:has-text("Welpen") >> text=Openen'); w(1000)
    check(pg.locator('.adminnote').count() == 1, 'beheerder bekijkt speltak alleen-lezen')
    check(pg.locator('text=Nieuwe opkomst').count() == 0, 'beheerder kan geen opkomst maken')
    pg.goto(BASE + '/beheer'); w(900); open_group()
    pg.click('.groupcard .member:has-text("Scouts") >> text=Openen'); w(1000); pg.click('nav >> text=Instellingen'); w(700)
    check(pg.locator('.invrow:has-text("lid@test.nl")').count() == 1, 'beheerder van de groep (geen teamleider) ziet in Team de openstaande uitnodigingen')

    # --- groepsbank: tweede speltak in dezelfde groep kopieert een gedeelde opkomst
    def sid_of(name):
        return pg.evaluate("n => { const s = JSON.parse(localStorage.getItem('fake.firestore')); return Object.keys(s).find(k => k.split('/').length === 2 && k.startsWith('speltakken/') && s[k].name === n).split('/')[1]; }", name)
    # speltak zonder teamleider: in Team nodigt de beheerder eerst de teamleider uit (geen keuze Leiding, geen rechten), zoals in Beheer
    pg.goto(f"{BASE}/s/{sid_of('Welpen')}/instellingen"); w(1000)
    tinv = pg.locator('.teamcard .invite')
    check(tinv.locator('.chip').count() == 0 and tinv.locator('.hint:has-text("Er is nog geen teamleider: wie je nu uitnodigt, wordt teamleider.")').count() == 1
          and tinv.locator('.perm-grid').count() == 0 and tinv.locator('input[placeholder="e-mailadres teamleider"]').count() == 1, 'Team zonder teamleider: beheerder nodigt de teamleider uit')
    tinv.locator('input[type=email]').fill('wim@test.nl'); tinv.locator('button:has-text("Uitnodigingslink maken")').click(); w(800)
    team_wim = tinv.locator('.mono-code').inner_text()
    check('Teamleider' in tinv.locator('.invrow:has-text("wim@test.nl")').inner_text() and 'als Teamleider' in tinv.locator('.banknote').inner_text(),
          'Team zonder teamleider: de uitnodiging is als teamleider')
    tinv.scroll_into_view_if_needed(); shot('09b-team-zonder-teamleider', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); tinv.scroll_into_view_if_needed(); shot('09c-team-zonder-teamleider-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Team zonder teamleider mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.goto(BASE + '/beheer'); w(900); open_group()
    open_sp('Welpen')
    pg.fill('input[placeholder="e-mailadres teamleider"]', 'wim@test.nl'); pg.click('text=Teamleider uitnodigen'); w(800)
    wim_link = invite_link()
    check(wim_link == team_wim and 'dezelfde link' in pg.locator('.toast').inner_text(), 'teamleider-uitnodiging uit Team en uit Beheer: dezelfde link')
    logout_to(wim_link); register('Wim Welp', 'wim@test.nl')
    # lege banken: geen zoekveld, filters of zijpaneel, alleen uitleg met één knop
    pg.click('nav >> text=Activiteitenbank'); w(700)
    check(pg.locator('.toolbar').count() == 0 and pg.locator('aside.side').count() == 0 and pg.locator('main .btn:has-text("Nieuwe activiteit")').count() == 1
          and pg.locator('.subline').inner_text() == 'Nog geen activiteiten', 'lege activiteitenbank: geen zoekveld, filters of zijpaneel, één knop Nieuwe activiteit')
    shot('34-activiteitenbank-leeg', False)
    pg.click('main .btn:has-text("Nieuwe activiteit")'); w(400)
    check(pg.locator('#lf-title').is_visible() and pg.locator('aside.side').count() == 1, 'lege activiteitenbank: Nieuwe activiteit opent het zijpaneel')
    pg.click('.side .closex'); w(300)
    check(pg.locator('aside.side').count() == 0 and pg.locator('main .btn:has-text("Nieuwe activiteit")').count() == 1, 'lege activiteitenbank: sluiten zonder invoer, weer de lege uitleg')
    pg.click('nav >> text=Opkomstenbank'); w(900)
    check(pg.locator('.tabs.page [role=tab]').count() == 2, 'opkomstenbank: tabbladen Onze bank en Groep')
    check(pg.locator('.toolbar').count() == 0 and pg.locator('aside.side').count() == 0 and pg.locator('main .btn:has-text("Nieuwe opkomst")').count() == 1
          and pg.locator('.empty.bank-empty').count() == 1, 'lege opkomstenbank: tabbladen blijven, geen zoekveld of zijpaneel, één knop Nieuwe opkomst')
    shot('34b-opkomstenbank-leeg', False)
    pg.click('.tabs.page >> text=Groep'); w(500)
    card = pg.locator('.bcard:has-text("Sluipspel")')
    check(card.count() == 1 and 'Scouts' in card.inner_text(), 'groepsbank toont gedeelde opkomst van andere speltak')
    check(pg.locator('h1').first.inner_text() == 'Opkomstenbank' and re.fullmatch(r'\d+ gedeelde opkomsten? van andere speltakken', pg.locator('.subline').inner_text()) and pg.locator('.toolbar').count() == 1,
          'groepsbank: kop Opkomstenbank, het aantal gedeelde opkomsten eronder, met zoekveld')
    shot('10-groepsbank')
    pg.fill('.toolbar input[type=search]', 'sluipen'); w(200)
    check(card.count() == 1 and pg.locator('.empty:has-text("Niets gevonden.")').count() == 0, 'groepsbank: zoeken vindt ook een onderdeel (Sluipen in Sluipspel)')
    pg.fill('.toolbar input[type=search]', 'xyzzy'); w(200)
    check(pg.locator('.bcard').count() == 0 and pg.locator('.empty:has-text("Niets gevonden.")').count() == 1, 'groepsbank: zoeken zonder treffer → Niets gevonden.')
    pg.fill('.toolbar input[type=search]', ''); w(200)
    card.click(); w(300)
    check('Vincent' not in pg.locator('.side').inner_text(), 'groepsbank toont geen namen van leiding')
    # gekozen kaart: koperen rand en een zacht accentvlak (welke kaart bij het paneel hoort), ook bij hover; tellers in de tabbladen in de letter van de app
    sel_st = lambda: card.evaluate("e => [e.classList.contains('sel'), getComputedStyle(e).boxShadow, getComputedStyle(e).backgroundColor]")
    pop = pg.evaluate("(() => { const d = document.createElement('i'); d.style.color = 'var(--pop)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })()")
    pg.mouse.move(5, 5); w(250); s0 = sel_st(); card.hover(); w(250); s1 = sel_st(); pg.mouse.move(5, 5); w(250)
    check(all(x[0] and pop in x[1] and x[2] not in ('rgba(0, 0, 0, 0)', 'transparent') for x in (s0, s1)), f'bank: gekozen kaart met koperen rand en accentvlak, ook bij hover ({pop}, {s1})')
    shot('10b-groepsbank-gekozen', False)
    tf = pg.evaluate("[getComputedStyle(document.querySelector('.tabs.page .count')).fontFamily, getComputedStyle(document.body).fontFamily]")
    check(tf[0] == tf[1], f'opkomstenbank: tellers in de tabbladen in de letter van de app, geen systeem-monospace ({tf[0]})')
    tb = pg.locator('.side .tblocks')
    check('Openen' in tb.inner_text() and 'min.' not in tb.locator('li:has-text("Openen")').inner_text() and 'min. 0' not in tb.inner_text(), 'groepsbank: onderdelen zonder "min. 0 leiding" bij de vaste blokken')
    pg.click('.side >> text=Kopieer naar onze bank'); w(900)
    check(pg.locator('.tabs.page [aria-selected=true]:has-text("Onze bank")').count() == 1 and pg.locator('.bcard:has-text("Sluipspel")').count() == 1, 'kopie staat in de eigen opkomstenbank')
    check(not pg.locator('#tf-share').is_checked(), 'kopie uit de groep wordt niet opnieuw gedeeld')
    check(soon(lambda: (lambda r: r[0].count('Sluipspel') >= 3 and not r[1])(bank_names(fs()))), f'groepsbank en kopie uit de groep: in de data geen namen ({bank_names(fs())[1]})')
    pg.click('.tabs.page >> text=Groep'); w(500)
    check('Al in onze bank' in pg.locator('.bcard:has-text("Sluipspel")').inner_text(), 'groepsbank: gekopieerde opkomst gemarkeerd')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'groepsbank mobiel: geen horizontale scroll'); shot('11-groepsbank-mobiel')
    pg.click('.bcard:has-text("Sluipspel")'); w(400); shot('12-groepsbank-mobiel-detail', False)
    pg.set_viewport_size({'width': 1360, 'height': 900})
    # kopie inplannen en daarna uit de eigen bank halen: de groepskaart zegt dan niet meer "Al in onze bank"
    pg.click('.tabs.page >> text=Onze bank'); w(400); pg.click('.bcard:has-text("Sluipspel")'); w(300); pg.click('.side >> text=Inplannen'); w(300)
    pg.fill('.modal input[placeholder^="Andere datum"]', '07-03-2031'); pg.click('.modal >> text=Op deze datum'); w(700); pg.click('.modal >> text=Klaar'); w(300)
    pg.locator('.bwrap:has(.bcard:has-text("Sluipspel")) .carddel').click(); w(150); pg.locator('.bwrap:has(.bcard:has-text("Sluipspel")) >> text=Verwijderen?').click(); w(600)
    pg.click('.tabs.page >> text=Groep'); w(500)
    gtxt = pg.locator('.bcard:has-text("Sluipspel")').inner_text()
    check(pg.locator('.tabs.page [role=tab]:has-text("Onze bank") .count').inner_text() == '0' and 'Al in onze bank' not in gtxt and 'gekopieerd' in gtxt,
          'groepsbank: kopie uit de eigen bank gehaald (ingeplande kopie blijft) → niet meer "Al in onze bank"')
    pg.click('.bcard:has-text("Sluipspel")'); w(300)
    check(pg.locator('.side button:has-text("Kopieer naar onze bank")').count() == 1 and pg.locator('.side >> text=staat al in jullie opkomstenbank').count() == 0, 'groepsbank: opnieuw kopiëren zonder extra klik')
    # zonder recht Instellingen: een categorie die jullie nog niet hebben valt weg, en de melding zegt welke
    welpen = sid_of('Welpen')
    fsjs = "JSON.parse(localStorage.getItem('fake.firestore'))"
    gk = pg.evaluate("() => { const s = " + fsjs + "; return Object.keys(s).find(k => k.includes('/gedeeld/') && s[k].opk && s[k].opk.title === 'Sluipspel'); }")
    sp0, g0 = pg.evaluate("([sid, gk]) => { const s = " + fsjs + "; return [s['speltakken/' + sid], s[gk]]; }", [welpen, gk])
    pg.evaluate("""([sid, gk, sp, g]) => {
      const u = Object.keys(sp.members).find(k => sp.members[k].name === 'Wim Welp');
      window.__fakeRemote('speltakken/' + sid, { ...sp, tlIds: [], members: { ...sp.members, [u]: { ...sp.members[u], role: 'leiding', perms: { plan: false, build: false, bank: true, settings: false } } } });
      window.__fakeRemote(gk, { ...g, catDefs: [...g.catDefs, { id: 'cat-sluipen', label: 'Sluipen', color: '#7A4F2D' }],
        opk: { ...g.opk, blocks: g.opk.blocks.map(b => b.title === 'Sluipen' ? { ...b, cat: 'cat-sluipen' } : b) } }); }""", [welpen, gk, sp0, g0]); w(600)
    pg.click('.side >> text=Kopieer naar onze bank'); w(900)
    copy_of = "sid => { const s = " + fsjs + "; return Object.keys(s).find(k => k.startsWith('speltakken/' + sid + '/opkomsten/') && s[k].state === 'bank' && s[k].title === 'Sluipspel'); }"
    ck = pg.evaluate(copy_of, welpen)
    check(ck is not None and pg.evaluate("k => " + fsjs + "[k].blocks.find(b => b.title === 'Sluipen').cat", ck) == ''
          and not pg.evaluate("sid => " + fsjs + "['speltakken/' + sid].settings.categories.some(c => c.label === 'Sluipen')", welpen)
          and 'Categorie Sluipen bestaat bij jullie nog niet; die onderdelen staan zonder categorie.' in pg.locator('.toast').inner_text(),
          'kopie uit de groep zonder recht Instellingen: melding welke categorie bij jullie nog niet bestaat')
    shot('12b-groepsbank-categorie-weg', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'melding categorie weg mobiel: geen horizontale scroll'); shot('12c-groepsbank-categorie-weg-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # terugzetten: Wim weer teamleider, kopie weg, gedeelde opkomst zonder de extra categorie
    pg.evaluate("""([sid, gk, sp, g, ck]) => { const s = JSON.parse(localStorage.getItem('fake.firestore'));
      window.__fakeRemote(ck, null); window.__fakeRemote('speltakken/' + sid, sp); window.__fakeRemote(gk, { ...s[gk], catDefs: g.catDefs, opk: g.opk }); }""", [welpen, gk, sp0, g0, ck]); w(600)
    # categorie uit de groep met een "kleur" die CSS meestuurt (bijv. via de API gedeeld): de kopie krijgt er een gewone kleur (#rrggbb) bij
    pg.evaluate("""([gk, g]) => { const s = JSON.parse(localStorage.getItem('fake.firestore'));
      window.__fakeRemote(gk, { ...s[gk], catDefs: [...g.catDefs, { id: 'cat-vreemd', label: 'Vreemd', color: 'red, red) url("/pixel-groep.png' }],
        opk: { ...g.opk, blocks: g.opk.blocks.map(b => b.title === 'Sluipen' ? { ...b, cat: 'cat-vreemd' } : b) } }); }""", [gk, g0]); w(600)
    pg.click('.tabs.page >> text=Groep'); w(400); pg.click('.bcard:has-text("Sluipspel")'); w(300)
    check(pg.evaluate("[...document.querySelectorAll('.side [style*=\"--c\"]')].every(e => !e.getAttribute('style').includes('url'))"), 'groepsbank: een vreemde kleur komt niet in de pagina')
    pg.click('.side >> text=Kopieer naar onze bank'); w(900)
    vcats = pg.evaluate("sid => " + fsjs + "['speltakken/' + sid].settings.categories", welpen)
    check(any(c['label'] == 'Vreemd' for c in vcats) and all(re.fullmatch(r'#[0-9A-Fa-f]{6}', c['color']) for c in vcats),
          f'kopie uit de groep met een vreemde kleur: categorie erbij met een gewone kleur ({[c["color"] for c in vcats]})')
    ck2 = pg.evaluate(copy_of, welpen)
    pg.evaluate("""([sid, gk, sp, g, ck]) => { const s = JSON.parse(localStorage.getItem('fake.firestore'));
      if (ck) window.__fakeRemote(ck, null); window.__fakeRemote('speltakken/' + sid, sp); window.__fakeRemote(gk, { ...s[gk], catDefs: g.catDefs, opk: g.opk }); }""", [welpen, gk, sp0, g0, ck2]); w(600)
    pg.click('.tabs.page >> text=Groep'); w(400)
    # koppelen uit de groep: de eigen bank is leeg, dus "Uit de groep" staat bovenaan; Kiezen zet een kopie in de eigen bank en plant een kopie daarvan in (zonder namen)
    pg.goto(f'{BASE}/s/{welpen}/dashboard'); w(1000)
    pg.click('.hero >> text=Opkomst koppelen'); w(400)
    heads = pg.locator('.modal h3').all_inner_texts()
    gpick = pg.locator('.modal .pick:has-text("Sluipspel")')
    check(heads[:2] == ['Uit de groep', 'Uit de opkomstenbank'] and gpick.count() == 1 and 'Scouts' in gpick.inner_text(), f'koppelen: eigen bank leeg → "Uit de groep" bovenaan, met de speltak ({heads})')
    shot('12d-koppelen-uit-de-groep', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'koppelen uit de groep mobiel: geen horizontale scroll'); shot('12e-koppelen-uit-de-groep-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    gpick.locator('button:has-text("Kiezen")').click(); w(900)
    gtoast = pg.locator('.toast').inner_text()
    gl = pg.evaluate("""sid => { const s = JSON.parse(localStorage.getItem('fake.firestore')), P = 'speltakken/' + sid + '/opkomsten/';
      const bank = Object.keys(s).filter(k => k.startsWith(P) && s[k] && s[k].state === 'bank' && s[k].title === 'Sluipspel').map(k => s[k]);
      const rows = Object.entries(s).filter(([k, v]) => k.startsWith('speltakken/' + sid + '/planning/') && v && v.topic === 'Sluipspel' && v.opkId).map(([, v]) => v);
      const o = bank[0] && rows.map(r => s[P + r.opkId]).find(x => x && x.srcId === bank[0].id);
      return [bank.length, bank[0] && !!bank[0].fromShared, !!o && o.state === 'planned' && o.srcId === (bank[0] && bank[0].id), !!o && o.blocks.every(b => !b.names.length)]; }""", welpen)
    check(gl == [1, True, True, True] and pg.locator('.modal h2:has-text("Opkomst overnemen")').count() == 1 and 'staat nu ook in jullie opkomstenbank' in gtoast,
          f'koppelen uit de groep: kopie in de eigen bank, een kopie daarvan ingepland zonder namen, venster Opkomst overnemen ({gl}; {gtoast})')
    # Ongedaan maken (ook terwijl Opkomst overnemen open staat): alleen de ingeplande kopie weg, de kopie in de eigen bank blijft
    gundo = pg.locator('.toast.show button:has-text("Ongedaan maken")')
    check(gundo.count() == 1 and 'zonder namen' in gtoast, f'koppelen uit de groep: melding met Ongedaan maken ({gtoast})')
    gundo.click(); w(700)
    gl2 = pg.evaluate("""sid => { const s = JSON.parse(localStorage.getItem('fake.firestore')), P = 'speltakken/' + sid + '/opkomsten/';
      const bank = Object.keys(s).filter(k => k.startsWith(P) && s[k] && s[k].state === 'bank' && s[k].title === 'Sluipspel').map(k => s[k]);
      return [bank.length, bank[0] ? Object.values(s).filter(v => v && v.state === 'planned' && v.srcId === bank[0].id).length : -1]; }""", welpen)
    check(gl2 == [1, 0] and pg.locator('.modal').count() == 0 and 'Niet meer ingepland' in pg.locator('.toast').inner_text(),
          f'koppelen uit de groep, Ongedaan maken: ingeplande kopie weg en venster dicht, de kopie in de eigen bank blijft ({gl2})')

    # --- rol overdragen: de opvolger komt binnen als leiding met alle rechten, daarna draagt de teamleider zelf over
    no_hscroll = lambda: pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    pg.click('nav >> text=Team & instellingen'); w(500)
    pg.fill('.invite input[type=email]', 'olga@test.nl'); pg.click('.invite .chip:has-text("Mijn rol overdragen")'); w(200)
    check(pg.locator('.invite .hint:has-text("leiding met alle rechten")').count() == 1, 'rol overdragen: uitleg (eerst leiding met alle rechten)')
    pg.click('text=Uitnodigingslink maken'); w(700)
    olga_link = pg.locator('.invite .mono-code').inner_text()
    orow = pg.locator('.invrow:has-text("olga@test.nl")')
    check(orow.count() == 1 and 'Leiding · overdracht' in orow.inner_text() and 'Teamleider' not in orow.inner_text(), 'rol overdragen: uitnodiging als leiding (overdracht), niet als teamleider')
    logout_to(olga_link)
    check(pg.locator('text=wil de rol van teamleider aan je overdragen').count() == 1, 'uitnodiging overdracht: genodigde ziet dat de teamleider daarna overdraagt')
    register('Olga Opvolger', 'olga@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'opvolger treedt toe')
    pg.click('nav >> text=Instellingen'); w(500)
    me_row = pg.locator('.member:has-text("Olga Opvolger (jij)")').inner_text()
    check('Leiding · Jaarplanning, Opkomsten, Banken, Instellingen' in me_row and 'Teamleider' not in me_row, 'opvolger is eerst leiding met alle rechten')
    login('wim@test.nl', 'geheim123')
    welpen = sid_of('Welpen')
    pg.goto(f'{BASE}/s/{welpen}/instellingen'); w(1000)
    heir = pg.locator('.member:has-text("Olga Opvolger") .heir')
    check(heir.count() == 1 and heir.locator('button:has-text("Rol overdragen aan Olga Opvolger")').count() == 1, 'teamleider ziet bij de opvolger de knop Rol overdragen')
    check(pg.locator('.heir').count() == 1, 'knop Rol overdragen alleen bij wie via de overdracht binnenkwam')
    heir.scroll_into_view_if_needed(); shot('20-overdragen', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300); heir.scroll_into_view_if_needed(); w(100)
    check(no_hscroll(), 'rol overdragen mobiel: geen horizontale scroll'); shot('20b-overdragen-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # rechten aanpassen telt mee in de opslagstatus: zolang het onderweg is Opslaan… in de kopbalk en een waarschuwing bij sluiten
    olrow = pg.locator('.member:has-text("Olga Opvolger")')
    olrow.locator('button[aria-expanded]').click(); w(200)
    pg.evaluate("localStorage.setItem('fake.holdWrite', '1500')")
    olrow.locator('.perm-grid input[type=checkbox]').first.click(); w(100)
    check(pg.evaluate(leave_warns) and pg.locator('header.bar .savestate.busy').count() == 1, 'rechten aanpassen: zolang het onderweg is Opslaan… in de kopbalk en een waarschuwing bij sluiten')
    check(soon(lambda: not pg.evaluate(leave_warns), 4000) and not olrow.locator('.perm-grid input[type=checkbox]').first.is_checked(), 'rechten aanpassen: daarna opgeslagen, geen waarschuwing meer')
    pg.evaluate("localStorage.removeItem('fake.holdWrite')")
    olrow.locator('.perm-grid input[type=checkbox]').first.click(); w(500)
    check(olrow.locator('.perm-grid input[type=checkbox]').first.is_checked(), 'rechten weer terug')
    olrow.locator('button[aria-expanded]').click(); w(200)
    heir.locator('button').click(); w(150); heir.locator('button').click(); w(900)
    olga_row, wim_row = pg.locator('.member:has-text("Olga Opvolger")').inner_text(), pg.locator('.member:has-text("Wim Welp (jij)")').inner_text()
    check('Teamleider' in olga_row and 'Leiding' in wim_row and 'Teamleider' not in wim_row and pg.locator('.heir').count() == 0, 'na overdragen: opvolger is teamleider, jij blijft leiding')

    # --- bestaande accounts: Beheer (totaal) uitnodigen, naam al bezet in de groep, oud account zonder bevestigingsmail
    def opened(loc, head):
        if 'open' not in (loc.get_attribute('class') or ''): loc.locator(head).first.click(); w(300)
    login('vluiten2907@gmail.com', 'demo123')
    rs = pg.locator('section:has(h2:text-is("Beheer (totaal)"))')
    n_open = pg.locator('.invrow').count()
    rs.locator('input[type=email]').fill('Vluiten2907@gmail.com '); rs.locator('button:has-text("Uitnodigingslink maken")').click(); w(500)
    check('Deze persoon is al Beheer (totaal).' in pg.locator('.toast').inner_text() and rs.locator('.mono-code').count() == 0 and pg.locator('.invrow').count() == n_open,
          'Beheer (totaal) nodigt zichzelf niet uit (geen open uitnodiging)')
    rs.locator('input[type=email]').fill('mede@test.nl'); rs.locator('button:has-text("Uitnodigingslink maken")').click(); w(700)
    mede_link = rs.locator('.mono-code').inner_text()
    pg.click('text=Nieuwe Scouting-groep'); w(); pg.fill('#ng-name', 'Zeegroep'); pg.click('text=Groep aanmaken'); w(800)
    zg = pg.locator('.groupcard:has-text("Zeegroep")'); opened(zg, '.gc-head')
    zg.locator('input[placeholder^="Naam nieuwe speltak"]').fill('Zeeverkenners'); zg.locator('button:has-text("Speltak aanmaken")').click(); w(800)
    zs = zg.locator('.spcard:has-text("Zeeverkenners")'); opened(zs, '.sp-head')
    zs.locator('input[placeholder="e-mailadres teamleider"]').fill('greet2@test.nl'); zs.locator('button:has-text("Teamleider uitnodigen")').click(); w(800)
    greet2_link = zs.locator('.mono-code').inner_text()
    tg = pg.locator('.groupcard:has-text("Testgroep")'); opened(tg, '.gc-head')
    sc = tg.locator('.spcard:has-text("Scouts")'); opened(sc, '.sp-head')
    sc.locator('input[aria-label="E-mailadres van een account"]').fill('niemand@test.nl'); sc.locator('button:text-is("Toevoegen")').click(); w(400)
    check('e-mailadres bevestigen' in pg.locator('.toast').inner_text(), 'iemand toevoegen zonder (bevestigd) account: uitleg noemt e-mailadres bevestigen')
    sc.locator('input[placeholder="e-mailadres nieuw lid"]').fill('greet2@test.nl'); sc.locator('button:text-is("Uitnodigen")').click(); w(800)
    greet2_scouts = sc.locator('.mono-code').inner_text()
    # hetzelfde adres dat Greet (beheerder van de groep) al uitnodigde: dezelfde link, maar mailen via de server kan alleen Greet
    sc.locator('input[placeholder="e-mailadres nieuw lid"]').fill('lid@test.nl'); sc.locator('button:text-is("Uitnodigen")').click(); w(800)
    bn = sc.locator('.banknote').last
    href = bn.locator('a:has-text("Eigen mail")').get_attribute('href') or ''
    check('dezelfde link' in pg.locator('.toast').inner_text() and bn.locator('button:has-text("Mail versturen")').count() == 0
          and 'Gemaakt door Greet Beheer' in bn.inner_text() and re.search(r'geldig t/m \d\d-\d\d-\d{4}', bn.inner_text()) is not None
          and 'Greet%20Beheer%20nodigt%20je%20uit' in href and 'geldig%20t%2Fm' in href,
          'uitnodiging van iemand anders hergebruikt: geen Mail versturen, wel wie hem maakte en tot wanneer hij geldig is')
    check('Open%20deze%20link.%20Heb%20je%20al%20een%20account%3F%20Log%20dan%20in.%20Anders%20maak%20je%20er%20een%20aan' in href, 'uitnodigingsmail: wie al een account heeft, logt in')
    bn.scroll_into_view_if_needed(); shot('25-uitnodiging-van-ander', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); bn.scroll_into_view_if_needed(); shot('25b-uitnodiging-van-ander-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'uitnodiging van iemand anders mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    check('/uitnodiging/' in mede_link and '/uitnodiging/' in greet2_link and '/uitnodiging/' in greet2_scouts, 'uitnodigingen voor Beheer (totaal), Zeegroep en Scouts gemaakt')
    # Beheer (totaal): na accepteren meteen beheerder (de eerdere leespoging werd geweigerd)
    logout_to(mede_link); register('Mede Beheer', 'mede@test.nl')
    check(soon(lambda: '/beheer' in pg.url and pg.locator('h2:has-text("Beheer (totaal)")').count() == 1) and pg.locator('text=Je bent geen beheerder').count() == 0,
          'uitnodiging Beheer (totaal) geaccepteerd: meteen beheerder, zonder herladen')
    # dezelfde naam in een andere groep mag
    logout_to(greet2_link); register('Greet Beheer', 'greet2@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'naam uit de ene groep is vrij in een andere groep (Zeegroep)')
    # bestaand account op een uitnodiging: registreren gaat over naar inloggen (wachtwoord blijft staan), Wachtwoord vergeten mailt meteen
    logout_to(greet2_scouts)
    pg.fill('#i-first', 'Greet'); pg.fill('#i-last', 'Twee'); pg.fill('#i-name', 'Greet Nieuw'); pg.fill('#i-pw', 'geheim123'); pg.click('.btn.primary'); w(800)
    check(pg.locator('button.btn.primary:has-text("Inloggen en toetreden")').count() == 1 and pg.locator('#i-err:has-text("Je hebt al een account met dit adres. Log in met je wachtwoord.")').count() == 1
          and pg.input_value('#i-pw') == 'geheim123' and pg.get_attribute('#i-pw', 'aria-invalid') == 'true' and pg.locator('#i-name').count() == 0,
          'uitnodiging met een bestaand account: registreren gaat over naar inloggen, wachtwoord blijft staan')
    pg.click('.auth-card button:has-text("Wachtwoord vergeten")'); w(500)
    check('/uitnodiging/' in pg.url and pg.locator('.auth-card p[role=status]:has-text("We hebben een mail gestuurd naar greet2@test.nl")').count() == 1 and pg.locator('#i-err').count() == 0,
          'uitnodiging: Wachtwoord vergeten mailt meteen naar het adres van de uitnodiging, je blijft op de uitnodiging')
    shot('22c-uitnodiging-bestaand-account', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('22d-uitnodiging-bestaand-account-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'uitnodiging bestaand account mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # oud account: nooit een bevestigingsmail gehad (van vóór de bevestiging)
    pg.evaluate("""() => { const k = 'fake.auth.users', u = JSON.parse(localStorage.getItem(k)); const x = Object.values(u).find(v => v.email === 'greet2@test.nl');
      x.verified = false; delete x.mailed; localStorage.setItem(k, JSON.stringify(u)); localStorage.setItem('fake.noverify', '1'); sessionStorage.clear(); }""")
    logout_to(greet2_scouts)
    pg.click('text=Ik heb al een account'); pg.fill('input[type=password]', 'geheim123'); pg.click('.btn.primary'); w(1000)
    mailed = pg.evaluate("Object.values(JSON.parse(localStorage.getItem('fake.auth.users'))).find(v => v.email === 'greet2@test.nl').mailed === true")
    check(mailed and pg.locator('text=We hebben een mail gestuurd naar').count() == 1, 'oud account zonder bevestiging: inloggen op een uitnodiging stuurt echt een bevestigingsmail')
    pg.evaluate('sessionStorage.clear()'); pg.reload(); w(1000)
    check(pg.locator('text=We hebben een mail gestuurd').count() == 0 and pg.locator('.verifynote button.primary:has-text("Bevestigingsmail sturen")').count() == 1,
          'geen mail verstuurd in deze sessie: geen "we hebben gemaild", wel de knop Bevestigingsmail sturen'); shot('22-bevestigen-oud-account', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('22b-bevestigen-oud-account-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'bevestigen oud account mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # naam al bezet in de groep: zelf een naam voor deze groep kiezen
    pg.evaluate("localStorage.setItem('fake.clicked', 'greet2@test.nl'); localStorage.removeItem('fake.noverify')")
    pg.click('text=Ik heb bevestigd'); w(1000)
    check(pg.locator('#i-pick').count() == 1 and pg.locator('text=Greet Beheer is al in gebruik binnen Testgroep').count() == 1, 'naam al bezet in de groep: veld om een naam voor deze groep te kiezen')
    shot('23-naam-kiezen', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('23b-naam-kiezen-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'naam kiezen mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('button:text-is("Toetreden")'); w(300)
    check(pg.locator('#i-pick').count() == 1 and '/uitnodiging/' in pg.url, 'zonder naam niet toetreden')
    pg.fill('#i-pick', 'Greet Zee'); pg.click('button:text-is("Toetreden")')
    check(soon(lambda: re.search(r'/s/[^/]+/dashboard', pg.url) is not None), 'met een eigen naam voor de groep toegetreden')
    pg.click('nav >> text=Instellingen'); w(600)
    check(pg.locator('text=Greet Zee (jij)').count() == 1, 'gekozen naam staat in het team')
    # nog een uitnodiging in dezelfde groep (Welpen): je naam in de groep (Greet Zee) wordt hergebruikt, geen "naam al in gebruik"
    welp = sid_of('Welpen')
    pg.evaluate("""sid => { const sp = JSON.parse(localStorage.getItem('fake.firestore'))['speltakken/' + sid];
      window.__fakeRemote('invites/greetwelp', { kind: 'leiding', role: 'leiding', email: 'greet2@test.nl', gid: sp.gid, groupName: sp.groupName, sid, speltakName: sp.name,
        perms: { plan: true, build: true, bank: true, settings: false }, invitedBy: 'uroot', invitedByName: 'Beheer (demo)', createdAt: Date.now(), expiresAt: Date.now() + 864e5, usedBy: null, transfer: false }); }""", welp)
    pg.goto(BASE + '/uitnodiging/greetwelp'); w(900)
    pg.click('button:text-is("Toetreden")')
    welp_name = lambda: pg.evaluate("sid => { const s = JSON.parse(localStorage.getItem('fake.firestore')), u = JSON.parse(localStorage.getItem('fake.auth.current')).uid, m = s['speltakken/' + sid].members[u]; return m ? m.name : null; }", welp)
    check(soon(lambda: f'/s/{welp}/' in pg.url) and pg.locator('#i-pick').count() == 0 and welp_name() == 'Greet Zee',
          f'tweede uitnodiging in dezelfde groep: je bestaande naam in de groep wordt hergebruikt ({welp_name()})')
    # en weer uit de Welpen (het team van de Welpen blijft zoals het was); de naam blijft, want Greet zit nog bij de Scouts
    pg.goto(f'{BASE}/s/{welp}/instellingen'); w(1000)
    lv = pg.locator('.dangerzone:has-text("Speltak verlaten")')
    lv.locator('button:has-text("Speltak verlaten")').click(); w(150); lv.locator('button:has-text("Klik nogmaals")').click()
    check(soon(lambda: '/speltakken' in pg.url) and welp_name() is None
          and pg.evaluate("Object.entries(JSON.parse(localStorage.getItem('fake.firestore'))).some(([k, v]) => /^groepen\\/[^/]+\\/namen\\/greet zee$/.test(k))"),
          'Welpen weer verlaten: naam Greet Zee blijft (nog lid van de Scouts)')
    # Beheer: iemand toevoegen wiens naam in de groep al bezet is
    login('vluiten2907@gmail.com', 'demo123')
    zg = pg.locator('.groupcard:has-text("Zeegroep")'); opened(zg, '.gc-head')
    zs = zg.locator('.spcard:has-text("Zeeverkenners")'); opened(zs, '.sp-head')
    zs.locator('input[placeholder="e-mailadres nieuw lid"]').fill('ga@test.nl'); zs.locator('button:text-is("Uitnodigen")').click(); w(800)
    ga_zee = zs.locator('.mono-code').inner_text().rsplit('/', 1)[-1]
    zs.locator('input[aria-label="E-mailadres van een account"]').fill('ga@test.nl'); zs.locator('button:text-is("Toevoegen")').click(); w(600)
    check(zs.locator('input[id^="pp-name-"]').count() == 1 and 'al in gebruik binnen Zeegroep' in pg.locator('.toast').inner_text(), 'beheer: naam bezet in de groep → veld voor een andere naam')
    zs.locator('input[id^="pp-name-"]').scroll_into_view_if_needed(); shot('24-beheer-naam-bezet', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'beheer naam bezet mobiel: geen horizontale scroll')
    zs.locator('input[id^="pp-name-"]').scroll_into_view_if_needed(); shot('24b-beheer-naam-bezet-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    zs.locator('input[id^="pp-name-"]').fill('Greet Test'); zs.locator('button:text-is("Toevoegen")').click(); w(800)
    check(zs.locator('.subrow:has-text("Greet Test")').count() == 1 and zs.locator('input[id^="pp-name-"]').count() == 0, 'beheer: toegevoegd met de gekozen naam')
    check(soon(lambda: pg.evaluate("t => !JSON.parse(localStorage.getItem('fake.firestore'))['invites/' + t]", ga_zee)) and pg.locator('.invrow:has-text("ga@test.nl")').count() == 0,
          'direct toegevoegd: openstaande uitnodiging voor die persoon en speltak ingetrokken')
    # direct toevoegen op e-mailadres: de naam die iemand in de groep al heeft (Greet Zee), niet de accountnaam (Greet Beheer, al van een ander)
    tg = pg.locator('.groupcard:has-text("Testgroep")'); opened(tg, '.gc-head')
    ws = tg.locator('.spcard:has-text("Welpen")'); opened(ws, '.sp-head')
    ws.locator('input[aria-label="E-mailadres van een account"]').fill('greet2@test.nl'); ws.locator('button:text-is("Toevoegen")').click(); w(800)
    check(ws.locator('.leiding .subrow:has-text("Greet Zee")').count() == 1 and ws.locator('input[id^="pp-name-"]').count() == 0,
          'beheer: direct toevoegen op e-mailadres gebruikt de naam die iemand in de groep al heeft')
    gz = ws.locator('.leiding .subrow:has-text("Greet Zee")')
    gz.locator('text=Verwijderen').click(); w(150); gz.locator('text=Zeker?').click(); w(800)
    check(ws.locator('.leiding .subrow:has-text("Greet Zee")').count() == 0, 'beheer: weer uit de Welpen gehaald')
    # al Beheer (totaal): geen uitnodiging
    rs = pg.locator('section:has(h2:text-is("Beheer (totaal)"))')
    rs.locator('input[type=email]').fill('mede@test.nl'); rs.locator('button:has-text("Uitnodigingslink maken")').click(); w(500)
    check('Deze persoon is al Beheer (totaal).' in pg.locator('.toast').inner_text() and rs.locator('.mono-code').count() == 0, 'Beheer (totaal): wie het al is, krijgt geen uitnodiging')
    rs.locator('input[type=email]').fill('')
    # namen: wie nergens meer in de groep zit (bijv. via Team uit het team gehaald), krijgt zijn naam terug vrij; leden en beheerders niet
    gid_of = lambda n: pg.evaluate("n => Object.entries(JSON.parse(localStorage.getItem('fake.firestore'))).find(([k, v]) => k.split('/').length === 2 && k.startsWith('groepen/') && v.name === n)[0].split('/')[1]", n)
    has_name = lambda g, k: pg.evaluate("([g, k]) => !!JSON.parse(localStorage.getItem('fake.firestore'))['groepen/' + g + '/namen/' + k]", [g, k])
    tg_id, zg_id = gid_of('Testgroep'), gid_of('Zeegroep')
    pg.evaluate("g => window.__fakeRemote('groepen/' + g + '/namen/spook', { uid: 'uspook', name: 'Spook' })", tg_id)
    pg.goto(BASE + '/beheer'); w(1200)
    check(soon(lambda: not has_name(tg_id, 'spook')) and has_name(tg_id, 'anna de vries') and has_name(tg_id, 'beheer (demo)'),
          'beheer: naam van wie in geen speltak van de groep meer zit komt vrij; leden en beheerders houden hun naam')
    # speltak verlaten: je naam in die groep komt vrij (Greet zit verder in geen speltak van Zeegroep)
    check(has_name(zg_id, 'greet test'), 'naam Greet Test vastgelegd in Zeegroep')
    login('ga@test.nl', 'geheim123')
    pg.goto(f"{BASE}/s/{sid_of('Zeeverkenners')}/instellingen"); w(1000)
    lv = pg.locator('.dangerzone:has-text("Speltak verlaten")')
    lv.locator('button:has-text("Speltak verlaten")').click(); w(150); lv.locator('button:has-text("Klik nogmaals")').click()
    check(soon(lambda: '/speltakken' in pg.url) and soon(lambda: not has_name(zg_id, 'greet test')) and has_name(tg_id, 'greet beheer'),
          'speltak verlaten: naam in die groep komt vrij, naam in de andere groep blijft')

    # --- laden: pagina's pas tonen als alles binnen is; een andere speltak (ook via de terugknop) begint schoon
    login('vluiten2907@gmail.com', 'demo123')
    scouts = sid_of('Scouts')
    oid = pg.evaluate("sid => { const s = JSON.parse(localStorage.getItem('fake.firestore')); return Object.keys(s).find(k => k.startsWith('speltakken/' + sid + '/opkomsten/') && s[k].state === 'bank' && s[k].title === 'Sluipspel').split('/').pop(); }", scouts)
    pg.evaluate("localStorage.setItem('fake.delayListen', '1500')")
    pg.goto(f'{BASE}/s/{scouts}/bouwer/{oid}'); w(700)
    check(pg.locator('text=Speltak laden').count() == 1 and pg.locator('text=bestaat niet').count() == 0, 'link naar een opkomst: eerst laden, niet "bestaat niet (meer)"')
    w(1500)
    check(pg.locator('#om-title').count() == 1 and pg.input_value('#om-title') == 'Sluipspel' and pg.locator('text=bestaat niet').count() == 0, 'link naar een opkomst: opent zodra alles binnen is')
    pg.goto(f'{BASE}/s/{scouts}/dashboard'); w(700)
    check(pg.locator('text=Er staat nog niets gepland').count() == 0 and pg.locator('text=Speltak laden').count() == 1, 'dashboard: geen "nog niets gepland" terwijl de planning nog laadt')
    w(1500)
    check(pg.locator('.hero h2.hero-title').inner_text() == 'Dashboardtitel', 'dashboard: komende opkomst zodra alles binnen is')
    pg.evaluate(f"history.pushState(null, '', '/s/{welpen}/dashboard'); dispatchEvent(new PopStateEvent('popstate'))"); w(700)
    check(pg.locator('text=Speltak laden').count() == 1 and pg.locator('text=Dashboardtitel').count() == 0, 'andere speltak: eerst laden, geen gegevens van de vorige')
    w(1500)
    check(pg.locator('h1').first.inner_text().strip() == 'Welpen' and pg.locator('text=Dashboardtitel').count() == 0, 'andere speltak: eigen gegevens')
    pg.evaluate('history.back()'); w(700)
    check(f'/s/{scouts}/' in pg.url and pg.locator('text=Speltak laden').count() == 1, 'terugknop naar de vorige speltak: begint ook schoon')
    w(1500)
    check(pg.locator('h1').first.inner_text().strip() == 'Scouts' and pg.locator('.hero h2.hero-title').inner_text() == 'Dashboardtitel', 'terugknop: vorige speltak met zijn eigen gegevens')
    pg.evaluate("localStorage.removeItem('fake.delayListen')")
    # uitgelogd een link openen: na het inloggen kom je op die pagina, niet op het dashboard
    logout_to(f'{BASE}/s/{welpen}/jaarplanning')
    check('/inloggen' in pg.url, 'uitgelogd een link openen: eerst inloggen')
    pg.fill('input[type=email]', 'wim@test.nl'); pg.fill('input[type=password]', 'geheim123'); pg.click('.btn.primary')
    check(soon(lambda: pg.url.rstrip('/').endswith(f'/s/{welpen}/jaarplanning') and pg.locator('.prow').count() > 0), 'na inloggen naar de pagina van de link (jaarplanning)')
    # via Wachtwoord vergeten en weer terug: de link blijft bewaard
    logout_to(f'{BASE}/account')
    pg.click('text=Wachtwoord vergeten'); w(300); pg.click('text=Terug naar inloggen'); w(300)
    pg.fill('input[type=email]', 'wim@test.nl'); pg.fill('input[type=password]', 'geheim123'); pg.click('.btn.primary')
    check(soon(lambda: pg.url.rstrip('/').endswith('/account') and pg.locator('.page-head').count() > 0), 'link openen, via Wachtwoord vergeten terug en inloggen: toch naar de pagina van de link')

    # --- oefenomgeving: voorbeelddata met watermerk, alleen in deze browser
    pg.goto(BASE + '/speltakken'); w(800)
    check('Leiding · 2 in het team' in pg.locator('.pick:has-text("Welpen")').inner_text() and pg.title() == 'Opkomstplanner', 'mijn speltakken: rol en teamgrootte')
    pg.click('a:has-text("Oefenen")'); w(1200)
    check('/s/oefen/dashboard' in pg.url and pg.locator('.watermark.on').count() == 1 and pg.locator('.oefenbar').count() == 1, 'oefenomgeving: watermerk en melding')
    check(pg.locator('text=Junglejacht en stratego').count() >= 1, 'oefenomgeving: voorbeelddata op het dashboard')
    ct = col_tops(); pg.set_viewport_size({'width': 1060, 'height': 900}); w(200); ct1 = col_tops(); pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    check(pg.locator('.dash2 .hero').count() == 1 and ct[0] == ct[1] and ct1[2] == '0px', f'dashboard: rechterkolom even hoog als de kaart van de komende opkomst, onder elkaar geen extra ruimte ({ct}, {ct1})')
    # pagina die niet te laden is (bijv. een tabblad dat openstond tijdens een update van de site): eerst één keer
    # vanzelf opnieuw laden (haalt de nieuwe versie op); lukt het dan nog niet: melding, geen wit scherm
    pg.goto(BASE + '/s/oefen/dashboard'); w(1000)
    chunk = re.compile(r'/assets/Instellingen-[^/]*\.js'); n_err = len(errors)
    pg.route(chunk, lambda r: r.abort())
    def nav_reloads(href, prep, wait=8000):
        # klik in het menu; True als de pagina daarna vanzelf opnieuw laadt (merkteken op window is dan weg)
        pg.evaluate(prep + '; window.__oud = 1')
        try:
            with pg.expect_event('load', timeout=wait): pg.click(f'header nav a[href$="{href}"]')
        except Exception: pass
        soon(lambda: pg.locator('.crash, .hero, #gs-name').count() > 0, 6000); w(300)
        return pg.evaluate('window.__oud') is None
    check(nav_reloads('/instellingen', "sessionStorage.removeItem('opk.herladen')") and pg.locator('.crash').count() == 1,
          'pagina niet te laden: eerst één keer vanzelf opnieuw geladen, dan pas de melding (geen lus)')
    check(pg.locator('.crash h2:has-text("Er ging iets mis")').count() == 1 and pg.locator('.crash button:has-text("Opnieuw laden")').count() == 1 and pg.locator('header.bar nav a').count() == 6,
          'pagina niet te laden: melding met Opnieuw laden, kopbalk blijft staan'); shot('21-pagina-fout', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('21b-pagina-fout-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'melding pagina-fout mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('header nav a[href$="/dashboard"]'); w(800)
    check(pg.locator('.crash').count() == 0 and pg.locator('.hero').count() == 1, 'andere pagina kiezen: melding weg, dashboard werkt')
    check(not nav_reloads('/instellingen', '0', 2500) and pg.locator('.crash').count() == 1, 'binnen een minuut nog eens: niet weer herladen, meteen de melding')
    pg.click('header nav a[href$="/dashboard"]'); w(600)
    check(nav_reloads('/instellingen', "sessionStorage.setItem('opk.herladen', String(Date.now() - 120000))") and pg.locator('.crash').count() == 1,
          'later weer een nieuwe versie in hetzelfde tabblad: weer één keer vanzelf opnieuw geladen')
    pg.click('header nav a[href$="/dashboard"]'); w(600)
    pg.unroute(chunk); pg.click('header nav a[href$="/instellingen"]'); w(600)
    if pg.locator('.crash').count(): pg.click('.crash >> text=Opnieuw laden'); w(1500)
    check(pg.locator('#gs-name').count() == 1, 'opnieuw laden: pagina werkt weer')
    # verwachte meldingen van het mislukte laden niet als fout tellen
    errors[n_err:] = [e for e in errors[n_err:] if 'dynamically imported module' not in e and 'Instellingen-' not in e]
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(900)
    pg.fill('#om-title', 'Mijn oefenopkomst'); w(900)
    pg.reload(); w(1200)
    check(pg.input_value('#om-title') == 'Mijn oefenopkomst', 'oefenomgeving: wijziging blijft bewaard in de browser')
    check(pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('fake.firestore')||'{}')).every(k => !k.startsWith('speltakken/oefen'))"), 'oefenomgeving schrijft niet naar de database')
    with pg.expect_download() as dl: pg.click('button:has-text("PDF maken")')
    check(dl.value.suggested_filename.endswith('.pdf'), 'oefenomgeving: pdf met watermerk')
    # pdf: letters buiten Latin-1 vallen terug op de basisletter in plaats van te verdwijnen
    pg.fill('#om-title', 'Łukasz en Şükrü → ✔ spel'); w(700)
    with pg.expect_download() as dl: pg.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/tekens.pdf')
    check(any('Lukasz en Sükrü -> v spel' in t for _, _, t in pdf_texts(f'{OUT}/tekens.pdf')), 'pdf: Ł, Ş, → en ✔ blijven leesbaar (Lukasz en Sükrü -> v spel)')
    # ontbonden accent (e + losse ´, bijv. geplakt of van een Mac): blijft é, niet e
    pg.fill('#om-title', 'Spel met Rene\u0301e'); w(700)
    with pg.expect_download() as dl: pg.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/accent.pdf')
    check(any('Spel met Renée' in t for _, _, t in pdf_texts(f'{OUT}/accent.pdf')), 'pdf: ontbonden accent blijft staan (Renée, niet Renee)')
    pg.fill('#om-title', 'Mijn oefenopkomst'); w(700)
    # pdf-code niet te laden (tabblad stond open tijdens een update van de site): één keer vanzelf opnieuw laden;
    # was dat net al gebeurd, dan een gewone Nederlandse melding in plaats van de ruwe (Engelse) foutmelding
    pdfchunk = re.compile(r'/assets/pdf-[^/]*\.js'); n_err = len(errors)
    pg.route(pdfchunk, lambda r: r.abort()); pg.reload(); w(1200)
    pg.evaluate("sessionStorage.removeItem('opk.herladen'); window.__oud = 1")
    try:
        with pg.expect_event('load', timeout=7000): pg.click('button:has-text("PDF maken")')
    except Exception: pass
    soon(lambda: pg.locator('button:has-text("PDF maken")').count() == 1, 4000); w(300)
    check(pg.evaluate('window.__oud') is None and pg.locator('.toast.show').count() == 0, 'pdf-code niet te laden (na een update): vanzelf opnieuw geladen, geen foutmelding')
    pg.evaluate("sessionStorage.setItem('opk.herladen', String(Date.now()))")
    pg.click('button:has-text("PDF maken")')
    soon(lambda: 'Pdf maken mislukt' in pg.locator('.toast').inner_text(), 4000)
    t = pg.locator('.toast').inner_text().strip()
    check(t == 'Pdf maken mislukt. Controleer je internetverbinding en probeer het opnieuw.' and pg.evaluate('window.__oud') is None,
          f'pdf maken mislukt (al net herladen): Nederlandse melding zonder ruwe foutmelding, niet nog eens herladen ({t!r})')
    pg.unroute(pdfchunk); pg.evaluate("sessionStorage.removeItem('opk.herladen')")
    # verwachte meldingen van het mislukte laden niet als fout tellen
    errors[n_err:] = [e for e in errors[n_err:] if 'dynamically imported module' not in e and '/assets/pdf-' not in e]
    oefen_set = lambda js: pg.evaluate("(() => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k)); " + js + "; localStorage.setItem(k, JSON.stringify(s)); })()")
    oefen_get = lambda js: pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('opk.oefen.v1')); return " + js + "; })()")
    # dashboard 'Daarna': planning door telt de oude eindverantwoordelijke mee (plannersOf)
    oefen_set("s['speltakken/oefen/planning/pl-1'].planners = []")
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    it = pg.locator('.nextlist li:has-text("Vuur en kompas")')
    check(it.count() == 1 and 'planning: Kaa' in it.inner_text() and 'Nog geen planner' not in it.inner_text(), 'dashboard Daarna: oude eindverantwoordelijke telt als planner')
    # instellingen: snel na elkaar aanpassen, niets springt terug of gaat verloren
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    pg.fill('#gs-name', 'Voorbeeldgroep'); pg.click('.accents .acc:has-text("Blauw")'); w(1200)
    check(pg.input_value('#gs-name') == 'Voorbeeldgroep' and pg.locator('.accents .acc:has-text("Blauw")').get_attribute('aria-pressed') == 'true', 'instellingen: naam typen en direct een kleur kiezen, allebei bewaard')
    cats = pg.locator('.catrow input[aria-label="Naam categorie"]')
    cats.nth(0).fill('Spel buiten'); cats.nth(1).fill('Pionieren'); w(1200)
    check(cats.nth(0).input_value() == 'Spel buiten' and cats.nth(1).input_value() == 'Pionieren', 'instellingen: twee categorieën snel na elkaar hernoemd, geen van beide springt terug')
    cats.nth(2).fill('Toneel'); pg.evaluate("document.querySelector('header nav a[href$=\"/dashboard\"]').click()"); w(500)
    check('/dashboard' in pg.url, 'instellingen: meteen naar Dashboard')
    pg.reload(); w(1200)
    st = oefen_get("s['speltakken/oefen']")
    check(st['groupName'] == 'Voorbeeldgroep' and st['settings']['accent'] == 'blauw' and [c['label'] for c in st['settings']['categories'][:3]] == ['Spel buiten', 'Pionieren', 'Toneel'],
          'instellingen: alles opgeslagen, ook een categorie die je net typte voor je wegging')
    # opslagstatus, direct wegschrijven als het tabblad naar de achtergrond gaat, waarschuwing bij sluiten
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(400)
    tin = pg.locator('.ptopic').nth(pg.evaluate("[...document.querySelectorAll('.ptopic')].findIndex(i => i.value === 'Pannenkoekenopkomst')"))
    tin.fill('Pannenkoeken bakken')
    check(pg.locator('.savestate.busy').count() == 1, 'kopbalk: Opslaan… zolang er iets wacht')
    hidden_now = pg.evaluate("""(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState;
      return JSON.parse(localStorage.getItem('opk.oefen.v1'))['speltakken/oefen/planning/pl-6'].topic; })()""")
    check(hidden_now == 'Pannenkoeken bakken', 'tabblad naar de achtergrond: wijziging direct opgeslagen')
    unload = "(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()"
    tin.fill('Pannenkoeken'); w(50)
    check(pg.evaluate(unload), 'tabblad sluiten terwijl er nog iets wacht: browser waarschuwt')
    w(900)
    check(not pg.evaluate(unload) and pg.locator('.savestate.ok').count() == 1, 'alles opgeslagen: geen waarschuwing, kopbalk meldt Opgeslagen')
    check(oefen_get("s['speltakken/oefen/planning/pl-6'].topic") == 'Pannenkoeken', 'onderwerp opgeslagen')
    ctx.set_offline(True); w(300)
    check(pg.locator('.offnote:has-text("Geen verbinding")').count() == 1 and pg.locator('.savestate.off').count() == 1, 'zonder verbinding: melding en status Niet verbonden')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('18-offline-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'melding zonder verbinding mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); shot('18b-offline', False)
    ctx.set_offline(False); w(300)
    check(pg.locator('.offnote').count() == 0, 'weer verbonden: melding weg')
    # terugknop (of veeg-terug) met niet-opgeslagen wijzigingen in een bank-opkomst
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000)
    pg.click('.bcard:has-text("Knopen en pionieren")'); w(300); pg.click('.side >> text=Bewerken'); w(800)
    pg.fill('#om-title', 'Knopen en pionieren XL'); w(300)
    pg.evaluate('history.back()'); w(800)
    check('/bouwer/' in pg.url and pg.input_value('#om-title') == 'Knopen en pionieren XL' and pg.locator('.toast >> text=Weggooien').count() == 1, 'terugknop met niet-opgeslagen wijzigingen: blijft staan en vraagt eerst')
    shot('19-terug-vraagt', False)
    pg.click('.toast >> text=Weggooien'); w(800)
    check(pg.url.rstrip('/').endswith('/opkomsten') and pg.locator('.bcard:has-text("Knopen en pionieren XL")').count() == 0, 'weggooien: alsnog terug, bank ongewijzigd')
    # Kopie met niet-opgeslagen wijzigingen → Weggooien: de kopie is van de bank-versie, zonder de weggegooide wijzigingen
    pg.goto(BASE + '/s/oefen/bouwer/opk-bank-vlag'); w(1000); pg.fill('#om-title', 'Grote vlaggenroof AANGEPAST'); w(300)
    pg.click('.plan-head button:has-text("Kopie")'); w(300); pg.click('.toast.show button:has-text("Weggooien")'); w(900)
    kt = pg.input_value('#om-title') if pg.locator('#om-title').count() else ''
    check(kt == 'Grote vlaggenroof (kopie)' and pg.locator('.pill:has-text("Concept")').count() == 1 and oefen_get("s['speltakken/oefen/opkomsten/opk-bank-vlag'].title") == 'Grote vlaggenroof',
          f'bank-opkomst: Kopie → Weggooien kopieert de bank-versie, niet de weggegooide wijzigingen ({kt})')
    pg.click('.plan-head >> button:has-text("Verwijderen")'); w(200); pg.click('.plan-head >> text=Klik nogmaals om te verwijderen'); w(700)
    # alleen recht Jaarplanning: wel onderwerp en afwezigheid, niet koppelen (dat schrijft ook de opkomst)
    oefen_set("const sp = s['speltakken/oefen']; sp.tlIds = []; sp.members['oefen-jij'].role = 'leiding'; sp.members['oefen-jij'].perms = { plan: true, build: false, bank: false, settings: false }")
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1200); pg.click('.presets >> text=Komende 3 maanden'); w(400)
    # zonder Team: "Instellingen" is breder dan "Team"; toch het hele menu in beeld op een smalle tablet
    for wd in (601, 640):
        pg.set_viewport_size({'width': wd, 'height': 800}); w(150)
        check(pg.evaluate(NAVFIT) == [True, True, True] and pg.locator('header.bar nav a:text-is("Instellingen")').count() == 1, f'leiding {wd}px: alle zes menuknoppen in beeld ({pg.evaluate(NAVFIT)})')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(150)
    vr = pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))')
    check(pg.locator('.prow .btn:has-text("Koppelen")').count() == 0 and pg.locator('.prow [aria-label^="Opkomst "][aria-label$=" ontkoppelen"]').count() == 0, 'alleen recht Jaarplanning: geen Koppelen of Ontkoppelen')
    check(vr.locator('.ptopic').is_disabled() and pg.locator('.prow:not(:has(.plink)):not(.geen) .ptopic:enabled').count() > 0, 'alleen recht Jaarplanning: onderwerp van een gekoppelde opkomst vast, andere aan te passen')
    vr.locator('[aria-label^="Afwezigheid "][aria-label$=" aanpassen"]').click(); w(300); pg.click('.modal .chip:text-is("Bagheera")'); pg.click('.modal >> text=Klaar'); w(900)
    check(oefen_get("s['speltakken/oefen/planning/pl-1'].absent.includes('Bagheera') && JSON.stringify(s['speltakken/oefen/opkomsten/opk-vuur'].blocks).includes('Bagheera')"), 'alleen recht Jaarplanning: afwezigheid opgeslagen, opkomst niet aangeraakt')
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Rond de wereld")'); w(300)
    check(pg.locator('.side button:has-text("Inplannen")').count() == 0, 'alleen recht Jaarplanning: geen Inplannen vanuit de bank')
    pg.goto(BASE + '/s/oefen/bouwer/opk-vuur'); w(1000)
    open_meta(); tsel = pg.locator('.meta .timefield select')
    check(pg.locator('.pill:has-text("Alleen lezen")').count() == 1 and tsel.count() == 4 and all(tsel.nth(k).is_disabled() for k in range(4)), 'alleen lezen: begin- en eindtijd van de opkomst niet aan te passen')
    check(pg.locator('#om-title').get_attribute('readonly') is not None and pg.locator('.ctx button:has-text("Leiding indelen")').count() == 0 and pg.locator('.plan-head button:has-text("In bank")').count() == 0,
          'alleen lezen: titel vast, geen Leiding indelen en geen In bank')
    check(pg.locator('.plan-head button:has-text("Nieuw")').count() == 0 and pg.locator('.plan-head button:has-text("Alle opkomsten")').count() == 1,
          'zonder recht Opkomsten: geen knop Nieuw in de bouwer, wel Alle opkomsten')
    pg.locator('.blk').nth(1).click(); w(300)
    check(pg.locator('.side .timefield .tp-h').is_disabled() and pg.locator('#bf-dur').is_disabled(), 'alleen lezen: begintijd van een onderdeel niet aan te passen')
    nb0 = pg.locator('.blk').count(); pg.keyboard.press('Delete'); w(300)
    check(pg.locator('.blk').count() == nb0, 'alleen lezen: onderdeel niet te verwijderen')
    pg.click('.side .closex'); w(200); pg.click('.plan-head button:has-text("Alle opkomsten")'); w(700)
    check(pg.url.rstrip('/').endswith('/s/oefen/bouwer') and pg.locator('main .btn:has-text("Nieuwe opkomst")').count() == 0, 'Alle opkomsten: terug naar de lijst (daar ook niets nieuws te maken)')
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    check(pg.locator('#gs-name').is_disabled() and pg.locator('button:has-text("Back-up terugzetten")').count() == 0, 'zonder recht Instellingen: instellingen alleen bekijken, geen back-up terugzetten')
    check(pg.locator('.catrow .sw.cur').count() > 0 and all(pg.locator('.catrow .sw.cur').nth(i).is_disabled() for i in range(pg.locator('.catrow .sw.cur').count())),
          'zonder recht Instellingen: kleurstip van een categorie gaat niet open')
    oefen_set("s['speltakken/oefen'].members['oefen-jij'].perms = { plan: false, build: false, bank: true, settings: false }")
    # brief op het dashboard: op Verstuurd zetten is een wijziging in de jaarplanning; zonder dat recht alleen Bekijken
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    nt = pg.locator('.notice:has-text("Winterweekend")')
    check(nt.count() == 1 and nt.locator('button:has-text("Bekijken")').count() == 1 and nt.locator('button:has-text("Verstuurd")').count() == 0,
          'dashboard zonder recht Jaarplanning: brief alleen Bekijken, geen knop Verstuurd')
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Rond de wereld")'); w(300); pg.click('.side >> text=Bewerken'); w(800)
    check(pg.locator('.plan-head button:has-text("Kopie")').count() == 0 and pg.locator('.plan-head button:has-text("Verwijderen")').count() == 1,
          'alleen recht Banken: bank-opkomst wel verwijderen, geen kopie als concept (dat hoort bij Opkomsten)')
    pg.goto(BASE + '/s/oefen/bouwer/opk-sint'); w(1000)
    check(pg.locator('.plan-head button:has-text("In bank")').count() == 1 and pg.locator('.plan-head button:has-text("Verwijderen")').count() == 0, 'alleen recht Banken: concept wel in de bank zetten, niet verwijderen')
    # Banken + Jaarplanning zonder Opkomsten: inplannen uit de bank (kopie zonder namen) mag, maar leiding indelen en de titel
    # aanpassen hoort bij Opkomsten (zoals in de bouwer): geen bewerkbaar venster Opkomst overnemen, titel blijft
    oefen_bak = oefen_get('s')
    oefen_set("s['speltakken/oefen'].members['oefen-jij'].perms = { plan: true, build: false, bank: true, settings: false }")
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Rond de wereld")'); w(300); pg.click('.side >> text=Inplannen'); w(400)
    pg.click('.modal >> text=Hier inplannen >> nth=0'); w(900)
    kopie = lambda: oefen_get("Object.values(s).filter(o => o && o.state === 'planned' && o.srcId === 'opk-bank-wereld').map(o => [o.title, o.blocks.every(b => !b.names.length)])")
    check(pg.locator('.modal').count() == 0 and 'zonder namen' in pg.locator('.toast').inner_text() and kopie() == [['Rond de wereld', True]],
          f'Banken + Jaarplanning zonder Opkomsten: Hier inplannen plant een kopie zonder namen in, zonder venster Opkomst overnemen ({kopie()})')
    check(pg.locator('.toast button:has-text("Bekijken")').count() == 1 and 'recht Opkomsten' in pg.locator('.toast').inner_text(),
          'Banken + Jaarplanning zonder Opkomsten: melding met Bekijken en wie de leiding indeelt')
    shot('43-inplannen-zonder-opkomsten', False)
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(300)
    pg.locator('.prow .btn:has-text("Koppelen")').first.click(); w(400)
    lm = pg.locator('.modal')
    check(lm.locator('button:has-text("Nieuwe opkomst")').count() == 0 and lm.locator('button:has-text("Weekendkamp")').count() == 0
          and lm.locator('.hint:has-text("Een nieuwe opkomst maken kan met het recht Opkomsten.")').count() == 1 and lm.locator('h3:has-text("Concepten")').count() == 1,
          'Banken + Jaarplanning zonder Opkomsten: Koppelen zonder Nieuwe opkomst of Weekendkamp, wel bank en concepten')
    shot('43b-koppelen-zonder-opkomsten', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); shot('43c-koppelen-zonder-opkomsten-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Koppelen zonder Opkomsten mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.locator('.modal .pick:has-text("Knopen en pionieren")').first.locator('button:has-text("Kiezen")').click(); w(900)
    check(pg.locator('.modal').count() == 0 and 'zonder namen' in pg.locator('.toast').inner_text()
          and oefen_get("Object.values(s).some(o => o && o.state === 'planned' && o.srcId === 'opk-bank-knopen' && o.title === 'Knopen en pionieren')"),
          'Banken + Jaarplanning zonder Opkomsten: koppelen uit de bank zonder venster Opkomst overnemen, titel blijft')
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", oefen_bak)
    oefen_set("s['speltakken/oefen'].members['oefen-jij'].perms = { plan: false, build: true, bank: false, settings: true }")
    # alleen Opkomsten: de opkomstenbank is alleen-lezen, in de bouwer net zo (wel Kopie en Inplannen)
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Rond de wereld")'); w(300)
    check(pg.locator('#tf-title').get_attribute('readonly') is not None and pg.locator('.side button:has-text("Bekijken")').count() == 1, 'alleen recht Opkomsten: bank-opkomst in het zijpaneel alleen bekijken')
    # alleen lezen is te zien: pil en uitleg, en het veld ziet er niet uit als iets om in te typen (vlak als de pil, geen typcursor)
    ro_look = lambda sel: pg.evaluate("""s => { const i = document.querySelector(s), p = document.querySelector('.side .pill.neutral');
      const c = getComputedStyle(i); return !!p && c.cursor === 'default' && c.backgroundColor === getComputedStyle(p).backgroundColor; }""", sel)
    check(pg.locator('.side .pill:text-is("Alleen lezen")').count() == 1 and pg.locator('.side .hint:text-is("Aanpassen kan met het recht Banken.")').count() == 1 and ro_look('#tf-title'),
          'alleen recht Opkomsten: zijpaneel opkomstenbank zegt Alleen lezen en waarom, titel ziet er niet bewerkbaar uit')
    shot('44-alleen-lezen-opkomst', False)
    pg.click('.side >> text=Bekijken'); w(900)
    check(pg.locator('#om-title').get_attribute('readonly') is not None and pg.locator('.pill:has-text("Alleen lezen")').count() == 1 and pg.locator('.savebar').count() == 0
          and pg.locator('.plan-head button:has-text("Kopie")').count() == 1 and pg.locator('.plan-head button:has-text("Inplannen")').count() == 1
          and pg.locator('.plan-head button:has-text("Verwijderen")').count() == 0, 'alleen recht Opkomsten: bank-opkomst in de bouwer alleen-lezen, wel Kopie en Inplannen')
    pg.locator('.lanes .blk:has-text("Hapjes proeven")').click(); w(300)
    check(pg.locator('#bf-cat').is_disabled() and pg.locator('#bf-cat option[value="__new"]').count() == 0 and pg.locator('#bf-loc').get_attribute('readonly') is not None
          and pg.locator('#bf-min').get_attribute('readonly') is not None, 'alleen lezen: categorie, locatie en minimaal leiding van een onderdeel vast')
    pg.goto(BASE + '/s/oefen/bouwer/opk-sint'); w(1000)
    check(pg.locator('#om-title').get_attribute('readonly') is None and pg.locator('.plan-head button:has-text("In bank")').count() == 0 and pg.locator('.plan-head button:has-text("Verwijderen")').count() == 1,
          'alleen recht Opkomsten: concept bewerken en verwijderen, niet in de bank zetten')
    pg.locator('.lanes .blk:has-text("Pietendiploma halen")').click(); w(300)
    check(not pg.locator('#bf-cat').is_disabled() and pg.locator('#bf-loc').get_attribute('readonly') is None, 'concept met recht Opkomsten: categorie en locatie aan te passen')
    pg.goto(BASE + '/s/oefen/activiteiten'); w(1000); pg.locator('.bcard').first.click(); w(300)
    loc0 = pg.input_value('#lf-loc'); pg.locator('#lf-loc').press_sequentially('Bos'); w(100)
    check(pg.locator('#lf-cat').is_disabled() and pg.locator('#lf-cat option[value="__new"]').count() == 0 and pg.locator('#lf-loc').get_attribute('readonly') is not None and pg.input_value('#lf-loc') == loc0,
          'activiteit alleen-lezen: categorie en locatie vast, geen Nieuwe categorie')
    check(pg.locator('.side .pill:text-is("Alleen lezen")').count() == 1 and pg.locator('.side .hint:text-is("Aanpassen kan met het recht Banken.")').count() == 1 and ro_look('#lf-title') and ro_look('#lf-desc'),
          'activiteit alleen-lezen: Alleen lezen en waarom, velden zien er niet bewerkbaar uit')
    pg.locator('.side .closex').focus(); pg.keyboard.press('Tab'); w(100)
    check(pg.evaluate("document.activeElement.id === 'lf-title' && getComputedStyle(document.activeElement).outlineStyle !== 'none'"), 'activiteit alleen-lezen: met het toetsenbord blijft zichtbaar welk veld de focus heeft')
    shot('44b-alleen-lezen-activiteit', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300); shot('44c-alleen-lezen-activiteit-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'activiteit alleen-lezen mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('.side .closex'); w(200)
    # zoeken vindt ook de uitgebreide beschrijving, voorbereiding en materiaal (in de bank en in het zijpaneel van de bouwer)
    asrch = pg.locator('.toolbar input[type=search]')
    found = {}
    for word, title in (('tijger', 'Junglejacht'), ('lamineren', 'Levend stratego'), ('lintjes', 'Vlaggenroof')):
        asrch.fill(word); w(150); found[word] = pg.locator(f'.bcard:has-text("{title}")').count() == 1
    asrch.fill(''); w(150)
    check(all(found.values()), f'activiteitenbank: zoeken in uitgebreide beschrijving, voorbereiding en materiaal ({found})')
    pg.goto(BASE + '/s/oefen/bouwer/opk-sint'); w(1000)
    pg.locator('.side input[aria-label="Zoek activiteit"]').fill('lamineren'); w(200)
    check(pg.locator('.libs .lib:has-text("Levend stratego")').count() == 1, 'bouwer: zoeken in de activiteitenbank vindt ook de voorbereiding')
    # lege banken zonder recht Banken: geen uitnodiging tot iets wat niet mag
    oefen_bak2 = oefen_get('s')
    oefen_set("Object.keys(s).filter(k => k.startsWith('speltakken/oefen/activiteiten/') || (k.startsWith('speltakken/oefen/opkomsten/') && s[k] && ['bank', 'draft'].includes(s[k].state))).forEach(k => delete s[k])")
    pg.goto(BASE + '/s/oefen/activiteiten'); w(1000)
    check(pg.locator('.bank-empty:has-text("Toevoegen kan met het recht Banken.")').count() == 1 and pg.locator('text=Maak er een').count() == 0 and pg.locator('button:has-text("Nieuwe activiteit")').count() == 0,
          'lege activiteitenbank zonder recht Banken: uitleg zonder "Maak er een"')
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000)
    check(pg.locator('.bank-empty:has-text("In de bank zetten kan met het recht Banken.")').count() == 1 and pg.locator('.bank-empty:has-text("kies")').count() == 0,
          'lege opkomstenbank zonder recht Banken: uitleg zonder "kies In bank"')
    shot('44d-lege-bank-zonder-recht', False)
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", oefen_bak2)
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    backup = json.dumps({'version': 4, 'opks': [], 'plans': [], 'lib': [{'id': 'lib-backup', 'title': 'Uit de back-up'}], 'settings': {}}).encode()
    pg.set_input_files('input[type=file][accept=".json,application/json"]', files=[{'name': 'backup.json', 'mimeType': 'application/json', 'buffer': backup}]); w(900)
    check('Activiteiten overgeslagen' in pg.locator('.toast').inner_text() and oefen_get("!s['speltakken/oefen/activiteiten/lib-backup']"), 'back-up terugzetten zonder recht Banken: activiteiten overgeslagen')
    backup = json.dumps({'version': 4, 'plans': [], 'lib': [], 'settings': {},
                         'opks': [{'id': 'opk-backup-bank', 'state': 'bank', 'title': 'Bank uit de back-up'}, {'id': 'opk-backup-concept', 'state': 'draft', 'title': 'Concept uit de back-up'}]}).encode()
    pg.set_input_files('input[type=file][accept=".json,application/json"]', files=[{'name': 'backup.json', 'mimeType': 'application/json', 'buffer': backup}])
    bt = lambda: pg.locator('.toast').inner_text()
    check(soon(lambda: 'Opkomsten uit de bank overgeslagen' in bt()) and 'Back-up teruggezet: 1 nieuw.' in bt() and soon(lambda: oefen_get("!!s['speltakken/oefen/opkomsten/opk-backup-concept']"))
          and oefen_get("!s['speltakken/oefen/opkomsten/opk-backup-bank']"), f'back-up terugzetten zonder recht Banken: opkomsten uit de bank overgeslagen, concept wel ({bt()})')
    oefen_set("delete s['speltakken/oefen/opkomsten/opk-backup-concept']")
    oefen_set("const sp = s['speltakken/oefen']; sp.tlIds = ['oefen-jij']; sp.members['oefen-jij'].role = 'teamleider'; sp.members['oefen-jij'].perms = { plan: true, build: true, bank: true, settings: true }")
    # met dat recht wel Verstuurd; Ongedaan maken zet alleen "verstuurd" terug, op de nieuwste stand van de rij
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    nt = pg.locator('.notice:has-text("Winterweekend")')
    nt.locator('button:has-text("Verstuurd")').click(); w(300)
    gone = nt.count() == 0 and soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-kamp'].letter.sent === true"))
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(300)
    check(gone and soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-kamp'].letter.sent === false && s['speltakken/oefen/planning/pl-kamp'].letter.needed === true")) and nt.count() == 1,
          'dashboard: brief op Verstuurd zetten en met Ongedaan maken terug')
    # concept verwijderen kan terug
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000)
    sint = pg.locator('.pick:has-text("Sinterklaasopkomst")')
    sint.locator('button:has-text("Verwijderen")').click(); w(150); sint.locator('button:has-text("Klik nogmaals")').click(); w(900)
    gone = pg.locator('.pick:has-text("Sinterklaasopkomst")').count() == 0 and oefen_get("!s['speltakken/oefen/opkomsten/opk-sint']")
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(900)
    check(gone and pg.locator('.pick:has-text("Sinterklaasopkomst")').count() == 1 and oefen_get("s['speltakken/oefen/opkomsten/opk-sint'].state") == 'draft',
          'concept verwijderd: Ongedaan maken zet hem terug (zelfde opkomst, opgeslagen)')
    # zoeken in de opkomstenbank: ook in onderdelen en locatie; concepten volgen zoeken en filter
    srch = pg.locator('.toolbar input[type=search]')
    nothing = lambda: pg.locator('.empty:has-text("Niets gevonden.")').count()
    srch.fill('landenquiz'); w(200)
    check(pg.locator('.bank-grid .bcard').count() == 1 and pg.locator('.bcard:has-text("Rond de wereld")').count() == 1 and pg.locator('h2:text-is("Concepten")').count() == 0 and nothing() == 0,
          'opkomstenbank: zoeken vindt een onderdeel (Landenquiz in Rond de wereld), concepten zonder treffer weg')
    srch.fill('pietendiploma'); w(200)
    check(pg.locator('.bank-grid .bcard').count() == 0 and pg.locator('.pick:has-text("Sinterklaasopkomst")').count() == 1 and nothing() == 0, 'opkomstenbank: zoeken vindt ook concepten, zonder "Niets gevonden." erboven')
    shot('15d-bank-zoeken-concept', False)
    srch.fill('xyzzy'); w(200)
    check(nothing() == 1 and pg.locator('.pick').count() == 0, 'opkomstenbank: niets gevonden, ook geen concepten')
    srch.fill(''); w(200)
    intl = oefen_get("s['speltakken/oefen'].settings.categories.find(c => c.id === 'internationaal').label")
    pg.locator('.catfilter .chip', has_text=intl).first.click(); w(200)
    check(pg.locator('.bcard:has-text("Rond de wereld")').count() == 1 and pg.locator('.pick').count() == 0, 'opkomstenbank: filter op categorie geldt ook voor concepten')
    pg.locator('.catfilter .chip:text-is("Alle")').click(); w(200)
    pg.click('.bcard:has-text("Rond de wereld")'); w(300)
    tb = pg.locator('.side .tblocks')
    check('min. 1 leiding' in tb.locator('li:has-text("Landenquiz")').inner_text() and all('min.' not in tb.locator(f'li:has-text("{t}")').inner_text() for t in ('Openen', 'Ranja drinken', 'Sluiten')),
          'opkomstenbank: onderdelenlijst zonder "min. 0 leiding" bij Openen, Ranja drinken en Sluiten')
    pg.click('.side .closex'); w(200)
    # back-up maken en terugzetten: wordt aangevuld, bestaande gegevens blijven
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    with pg.expect_download() as dl: pg.click('button:has-text("Back-up maken")')
    bk = json.load(open(dl.value.path(), encoding='utf-8'))
    check(bk['version'] == 4 and any(o['id'] == 'opk-vuur' for o in bk['opks']) and len(bk['plans']) > 0, 'back-up maken: bestand met opkomsten en planning')
    n_opk = oefen_get("Object.keys(s).filter(k => k.startsWith('speltakken/oefen/opkomsten/')).length"); st0 = oefen_get("s['speltakken/oefen'].settings.defStart")
    backup = json.dumps({'version': 4, 'opks': [], 'plans': [], 'lib': [{'id': 'lib-backup', 'title': 'Uit de back-up'}],
                         'settings': {'defStart': st0 + 60, 'categories': [{'id': 'cat-backup', 'label': 'Uit de back-up', 'color': '#2D7A4F'}]}}).encode()
    pg.set_input_files('input[type=file][accept=".json,application/json"]', files=[{'name': 'backup.json', 'mimeType': 'application/json', 'buffer': backup}])
    check(soon(lambda: oefen_get("!!s['speltakken/oefen/activiteiten/lib-backup']")) and 'Back-up teruggezet: 1 nieuw.' in pg.locator('.toast').inner_text(), 'back-up terugzetten: activiteit toegevoegd')
    check(soon(lambda: oefen_get("s['speltakken/oefen'].settings.categories.some(c => c.id === 'cat-backup')")) and oefen_get("s['speltakken/oefen'].settings.defStart") == st0
          and oefen_get("Object.keys(s).filter(k => k.startsWith('speltakken/oefen/opkomsten/')).length") == n_opk, 'back-up terugzetten: categorie erbij, eigen tijden en opkomsten blijven')
    # dezelfde back-up terugzetten nadat een opkomst is aangepast: de nieuwe versie blijft staan, de melding zegt wat er al was
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1000)
    jt0 = pg.input_value('#om-title'); pg.fill('#om-title', 'Nieuwe titel na back-up'); w(900)
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    restore_file = lambda data: pg.set_input_files('input[type=file][accept=".json,application/json"]', files=[{'name': 'backup.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode()}])
    restore_file(bk)
    check(soon(lambda: 'Back-up teruggezet: 0 nieuw' in pg.locator('.toast').inner_text()) and re.search(r'\d+ al aanwezig \(overgeslagen\)', pg.locator('.toast').inner_text())
          and 'toegevoegd' not in pg.locator('.toast').inner_text(), f'back-up terugzetten over bestaande gegevens: 0 nieuw, de rest al aanwezig ({pg.locator(".toast").inner_text()})')
    w(900)
    check(oefen_get("s['speltakken/oefen/opkomsten/opk-jungle'].title") == 'Nieuwe titel na back-up', 'back-up terugzetten: een opkomst die daarna is aangepast blijft zoals hij nu is')
    shot('42-backup-teruggezet', False)
    # dezelfde back-up met andere ids (bijv. uit een andere speltak) op een gevulde planning: de data zijn bezet,
    # dus de ingeplande opkomsten komen bij de concepten in plaats van onzichtbaar te worden
    bk2 = json.loads(json.dumps(bk)); bk2['lib'] = []
    for o_ in bk2['opks']: o_['id'] = 'x-' + o_['id']
    for p_ in bk2['plans']: p_['id'] = 'x-' + p_['id']; p_['opkId'] = 'x-' + p_['opkId'] if p_.get('opkId') else None
    loose = [p_ for p_ in bk2['plans'] if not p_.get('slot')]
    linked_x = {p_['opkId'] for p_ in loose if p_.get('opkId')}
    exp_new, exp_taken = len(bk2['opks']) + len(loose), len(bk2['plans']) - len(loose)
    exp_drafts = sum(1 for o_ in bk2['opks'] if o_.get('state') == 'planned' and o_['id'] not in linked_x)
    restore_file(bk2)
    soon(lambda: 'Back-up teruggezet' in pg.locator('.toast').inner_text()); rt = pg.locator('.toast').inner_text()
    check(rt.startswith(f'Back-up teruggezet: {exp_new} nieuw, {exp_taken} data al bezet (overgeslagen).') and f'{exp_drafts} opkomsten zonder datum bij de concepten gezet' in rt and exp_drafts >= 3,
          f'back-up op bezette data: melding met nieuw, bezet en concepten ({rt})')
    w(900)
    check(oefen_get("s['speltakken/oefen/opkomsten/x-opk-jungle'].state") == 'draft' and oefen_get("s['speltakken/oefen/opkomsten/x-opk-kamp'].state") == 'draft'
          and oefen_get("Object.keys(s).filter(k => k.startsWith('speltakken/oefen/planning/x-')).length") == len(loose), 'back-up op bezette data: ingeplande opkomsten staan bij de concepten, geen dubbele rijen')
    pg.goto(BASE + '/s/oefen/bouwer'); w(1000)
    check(pg.locator('.pick:has-text("Winterweekend")').count() >= 1, 'back-up op bezette data: het kamp is te zien bij de concepten')
    oefen_set("Object.keys(s).filter(k => k.includes('/x-')).forEach(k => delete s[k])")
    # back-up met namen in een bank-opkomst (oude versie of met de hand aangepast): de bank blijft zonder namen, ook een kopie ervan
    pg.goto(BASE + '/s/oefen/instellingen'); w(1000)
    restore_file({'version': 4, 'plans': [], 'lib': [], 'opks': [{'id': 'bk-namen', 'state': 'bank', 'title': 'Bank met namen', 'lead': 'Kaa',
                  'blocks': [{'id': 'bk-b1', 'title': 'Spel', 'start': 840, 'dur': 30, 'minLeaders': 2, 'names': ['Baloe', 'Bagheera']}]}]})
    check(soon(lambda: oefen_get("!!s['speltakken/oefen/opkomsten/bk-namen']")) and (lambda r: 'Bank met namen' in r[0] and not r[1])(bank_names(oefen_get('s'))),
          f'back-up terugzetten: bank-opkomst met namen komt zonder namen in de bank ({bank_names(oefen_get("s"))[1]})')
    pg.goto(BASE + '/s/oefen/bouwer/bk-namen'); w(1000)
    sb('Opslaan als kopie').click(); w(200); pg.fill('#sb-name', 'Bank met namen kopie'); sb('Kopie opslaan').click(); w(900)
    check((lambda r: 'Bank met namen kopie' in r[0] and not r[1])(bank_names(oefen_get('s'))), 'kopie van die bank-opkomst ook zonder namen')
    oefen_set("Object.keys(s).filter(k => { const v = s[k]; return v && k.startsWith('speltakken/oefen/opkomsten/') && /^Bank met namen/.test(v.title); }).forEach(k => delete s[k])")
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1000); pg.fill('#om-title', jt0); w(900)
    # extra datum toevoegen en de rij weer leegmaken
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(300)
    pg.click('button:has-text("Extra datum")')
    pg.fill('.modal input[placeholder="dd-mm-jjjj"]', (date.today() + timedelta(days=12)).strftime('%d-%m-%Y')); pg.fill('.modal input[placeholder="bijv. Groepsweekend"]', 'Extra oefendag')
    pg.fill('#xd-end', (date.today() + timedelta(days=5)).strftime('%d-%m-%Y')); pg.click('.modal button:has-text("Toevoegen")'); w(200)
    check(pg.locator('.modal #xd-end').count() == 1 and '"Tot en met" moet na de datum liggen.' in pg.locator('.toast').inner_text(), 'extra datum: "tot en met" vóór de datum geeft dezelfde melding als bij Datum en soort')
    pg.fill('#xd-end', '')
    pg.click('.modal button:has-text("Toevoegen")')
    xrow = lambda: pg.evaluate("[...document.querySelectorAll('.prow:not(.head)')].findIndex(r => r.querySelector('.ptopic')?.value === 'Extra oefendag')")
    check(soon(lambda: xrow() >= 0 and oefen_get("Object.values(s).some(p => p && p.topic === 'Extra oefendag' && p.slot === null && p.type === 'opkomst')")), 'extra datum toegevoegd in de jaarplanning')
    pg.locator('.prow:not(.head)').nth(xrow()).locator('.pdate').click()
    pg.click('.modal >> text=Rij leegmaken'); pg.click('.modal >> text=Klik nogmaals om leeg te maken')
    check(soon(lambda: xrow() < 0) and 'Rij leeggemaakt' in pg.locator('.toast').inner_text(), 'extra datum: rij leegmaken haalt hem weg')
    pg.goto(BASE + '/s/oefen/bouwer/opk-vuur'); w(1500)
    check(not oefen_get("JSON.stringify(s['speltakken/oefen/opkomsten/opk-vuur'].blocks).includes('Bagheera')"), 'opkomst openen met recht Opkomsten: afwezige leiding stil uit de indeling')
    pg.click('.ctx >> text=Leiding indelen'); w(500)
    nb = pg.locator('.modal .tk-tl .blk').count()
    pg.click('.modal >> text=Activiteit toevoegen'); w(400)
    check(pg.locator('.modal .tk-tl .blk').count() == nb + 1 and 'toegevoegd om' in pg.locator('.toast').inner_text(), 'leiding indelen: activiteit toevoegen op het eerste vrije moment')
    pg.click('.modal >> text=Klaar'); w(300)
    open_meta(); tf = lambda k: pg.locator('.meta .timefield').nth(k).locator('.tp-h')
    tf(0).select_option('18'); w(300)
    check(tf(1).input_value() == '19' and 'Eindtijd verschoven naar 19:' in pg.locator('.toast').inner_text(), 'bouwer: begintijd na de eindtijd schuift de eindtijd mee')
    check(pg.locator('.blk[aria-label^="Openen, 18:00 tot 18:05"]').count() == 1 and pg.locator('.blk[aria-label^="Sluiten, 18:55 tot 19:00"]').count() == 1, 'bouwer: begintijd wijzigen, Openen en Sluiten schuiven mee')
    tf(1).select_option('17'); w(300)
    check(tf(1).input_value() == '19' and 'moet na de begintijd' in pg.locator('.toast').inner_text(), 'bouwer: eindtijd vóór de begintijd wordt geweigerd')
    w(700); check(oefen_get("s['speltakken/oefen/opkomsten/opk-vuur'].end") // 60 == 19, 'bouwer: nieuwe tijden opgeslagen')
    # venster met het toetsenbord: focus gaat erin, Tab blijft erin, de kop is de naam, Esc sluit en de focus gaat terug
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(300)
    trig = pg.locator('.prow [aria-label^="Afwezigheid "][aria-label$=" aanpassen"]').first
    trig.focus(); pg.keyboard.press('Enter'); w(300)
    in_card = lambda: pg.evaluate("!!document.activeElement && !!document.activeElement.closest('.modal-card')")
    focus_in, stays = in_card(), True
    for k in ['Tab'] * 15 + ['Shift+Tab'] * 4: pg.keyboard.press(k); stays = stays and in_card()
    dname = pg.evaluate("""(() => { const d = document.querySelector('.modal [role=dialog]'); const t = d && document.getElementById(d.getAttribute('aria-labelledby') || ''); return t ? t.textContent : null; })()""")
    rest_inert = pg.evaluate("document.querySelector('header.bar').inert && document.querySelector('main').inert && !document.querySelector('.modal').closest('[inert]') && !document.querySelector('.toast').inert")
    pg.keyboard.press('Escape'); w(300)
    check(focus_in and stays and dname == 'Wie is er afwezig?' and pg.locator('.modal').count() == 0 and trig.evaluate('e => e === document.activeElement'),
          'venster: focus erin, Tab blijft erin, kop is de naam, Esc sluit en de focus gaat terug naar de knop')
    check(rest_inert and pg.locator('[inert]').count() == 0, 'venster: de rest van de app is zolang onbereikbaar (inert), de melding onderin niet; daarna alles weer bereikbaar')
    # ontkoppelen vraagt eerst bevestiging
    vk = lambda: pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))')
    vk().locator('[aria-label^="Opkomst "][aria-label$=" ontkoppelen"]').click(); w(200)
    armed = vk().count() == 1 and vk().locator('button:text-is("Ontkoppelen?")').count() == 1
    vk().locator('button:text-is("Ontkoppelen?")').click(); w(700)
    check(armed and vk().count() == 0 and 'Ontkoppeld' in pg.locator('.toast').inner_text(), 'ontkoppelen in de jaarplanning: eerst Ontkoppelen?, pas daarna los')
    # terugknop met een venster open: het venster gaat dicht (op Android is dat de gewone manier om iets te sluiten)
    pg.click('header nav a[href$="/dashboard"]'); w(800); pg.click('header nav a[href$="/jaarplanning"]'); w(1000)
    pg.locator('.prow [aria-label^="Afwezigheid "][aria-label$=" aanpassen"]').first.click(); w(300)
    opened = pg.locator('.modal').count() == 1
    pg.evaluate('history.back()'); w(800)
    check(opened and '/dashboard' in pg.url and pg.locator('.modal').count() == 0, 'terugknop met een venster open: venster dicht, terug naar de vorige pagina')
    # Ongedaan maken na het opslaan (de database vervangt de opkomst dan door een nieuw object): wat je intussen aanpaste blijft
    jg = "s['speltakken/oefen/opkomsten/opk-jungle']"
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1200)
    titles = lambda: pg.eval_on_selector_all('.lanes .blk .t', 'els => els.map(e => e.textContent)')
    pg.locator('.lanes .blk:has-text("Knopen leren")').click(); pg.keyboard.press('Delete'); w(1200)
    pg.locator('.lanes .blk:has-text("Levend stratego")').click(); w(200)
    pg.fill('#bf-title', 'Levend stratego XYZ'); w(1200); pg.click('.side .closex'); w(200)
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(900)
    check('Knopen leren' in titles() and 'Levend stratego XYZ' in titles(), 'Ongedaan maken na het opslaan: onderdeel terug, nieuwe naam van een ander onderdeel blijft')
    pg.reload(); w(1200)
    check('Knopen leren' in titles() and 'Levend stratego XYZ' in titles(), 'Ongedaan maken na het opslaan: ook na herladen allebei bewaard')
    # twee keer snel na elkaar slepen (de tweede terwijl de eerste wordt opgeslagen): allebei helemaal bewaard
    row = pg.evaluate("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 24")
    def drag(name, rows, steps, pause):
        el = pg.locator(f'.lanes .blk:has-text("{name}")').first; el.scroll_into_view_if_needed()
        bb = el.bounding_box(); x, y = bb['x'] + 60, bb['y'] + 12
        pg.mouse.move(x, y); pg.mouse.down()
        for i in range(1, steps + 1): pg.mouse.move(x, y + rows * row * i / steps); w(pause)
        pg.mouse.up()
    start_of = lambda t: oefen_get(jg + f".blocks.find(b => b.title === '{t}').start")
    k0, s0 = start_of('Knopen leren'), start_of('Levend stratego XYZ')
    drag('Knopen leren', 2, 4, 20); w(100); drag('Levend stratego XYZ', -3, 15, 60)
    check(soon(lambda: start_of('Knopen leren') == k0 + 10 and start_of('Levend stratego XYZ') == s0 - 15),
          f'twee keer snel na elkaar slepen: allebei goed opgeslagen ({start_of("Knopen leren") - k0:+d} en {start_of("Levend stratego XYZ") - s0:+d} min)')
    # Leiding indelen: de prullenbak staat alleen bij het gekozen onderdeel en nooit op een naam; verwijderen kan terug
    pg.click('.ctx >> text=Leiding indelen'); w(500)
    tk = pg.locator('.modal .tk-tl .blk'); n_tk = tk.count()
    check(n_tk > 0 and pg.locator('.modal .tk-tl .bdel').count() == 0, 'leiding indelen: geen prullenbak zolang je geen onderdeel kiest')
    pg.locator('.modal .tk-tl .blk:has-text("Junglejacht") .t').click(); w(200)
    check(pg.locator('.modal .tk-tl .blk.sel .bdel').count() == 1 and pg.locator('.modal .tk-tl .bdel').count() == 1, 'leiding indelen: prullenbak alleen bij het gekozen onderdeel')
    pg.locator('.modal .tk-tl .blk.sel .bdel').click(); w(300)
    check(tk.count() == n_tk - 1 and pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1, 'leiding indelen: onderdeel verwijderd, melding met Ongedaan maken')
    w(1200); pg.click('.toast.show button:has-text("Ongedaan maken")')
    check(soon(lambda: tk.count() == n_tk and 'Junglejacht' in oefen_get(jg + ".blocks.map(b => b.title).join('|')")), 'leiding indelen: Ongedaan maken zet het onderdeel terug (ook na het opslaan)')
    on_name = """(sel) => [...document.querySelectorAll(sel)].filter(b => b.getBoundingClientRect().width).some(btn => { const r = btn.getBoundingClientRect();
      return [...btn.closest('.blk').querySelectorAll('.nm')].some(n => { const q = n.getBoundingClientRect(); return q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }); })"""
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    pg.locator('.modal .tk-tl .blk:has-text("Levend stratego") .t').click(); w(200)
    check(pg.locator('.modal .tk-tl .bdel').count() == 1 and not pg.evaluate(f"({on_name})('.modal .tk-tl .bdel')"), 'leiding indelen mobiel: prullenbak ligt niet op een naam')
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'leiding indelen mobiel: geen horizontale scroll')
    tkw = pg.evaluate("""(() => { const h = document.querySelector('.modal .tk-head'), f = h.querySelector('.field'); return Math.round(f.getBoundingClientRect().width) + '/' + Math.round(h.getBoundingClientRect().width); })()""")
    check(tkw.split('/')[0] == tkw.split('/')[1] and int(tkw.split('/')[0]) > 300, f'leiding indelen mobiel: Opkomst titel over de hele breedte ({tkw})')
    shot('04b-indelen-mobiel', False); pg.locator('.modal .tk-head').scroll_into_view_if_needed(); shot('04c-indelen-titel-mobiel', False)
    pg.click('.modal >> text=Klaar'); w(300)
    check(pg.locator('.lanes .bdel').count() > 3 and not pg.evaluate(f"({on_name})('.lanes .bdel')"), 'bouwer mobiel: prullenbak ligt niet op een naam, ook niet bij onderdelen naast elkaar')
    pg.evaluate("document.querySelector('.lanes').scrollIntoView({ block: 'start' })"); w(200); shot('03b-bouwer-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    # --- toegankelijkheid: toetsenbord in de bouwer, bewerkpaneel als venster, namen van velden, contrast, kalender
    ACT = "(() => { const a = document.activeElement; return a ? (a.id || a.dataset.bid || a.tagName) : null; })()"
    NONAME = """() => [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter(el => el.getClientRects().length && !el.closest('[inert]')).filter(el => {
      if (el.getAttribute('aria-label')) return false;
      const lb = el.getAttribute('aria-labelledby'); if (lb && lb.split(' ').some(i => (document.getElementById(i)?.textContent || '').trim())) return false;
      return !([...(el.labels || [])].some(l => l.textContent.trim()) || (el.closest('label')?.textContent || '').trim());
    }).map(el => el.outerHTML.slice(0, 100))"""
    open_meta(); noname = pg.evaluate(NONAME)
    check(not noname and pg.locator('select[aria-label="Begintijd uur"]').count() == 1 and pg.locator('select[aria-label="Eindtijd minuten"]').count() == 1, f'bouwer: elk veld heeft een naam, begin- en eindtijd apart ({noname[:2]})')
    n_blk = pg.locator('.lanes .blk').count()
    pg.locator('#bf-add').focus(); pg.keyboard.press('Enter'); w(400)
    new_bid = pg.evaluate("document.querySelector('.lanes .blk.sel')?.dataset.bid")
    check(pg.locator('.lanes .blk').count() == n_blk + 1 and pg.evaluate(ACT) == 'bf-title', '+ Onderdeel (toetsenbord): nieuw onderdeel, focus in het titelveld')
    check('+ Onderdeel' in pg.locator('.tl-foot').inner_text(), 'bouwer: voettekst noemt + Onderdeel')
    pg.fill('#bf-title', 'Toetsenbordblok'); w(200); pg.keyboard.press('Escape'); w(300)
    check(pg.locator('#bf-title').count() == 0 and pg.evaluate(ACT) == new_bid, 'Esc sluit het onderdeel, de focus gaat terug naar het blok')
    pg.keyboard.press('Enter'); w(300)
    check(pg.evaluate(ACT) == 'bf-title' and pg.input_value('#bf-title') == 'Toetsenbordblok', 'Enter op een blok: de focus gaat meteen naar het titelveld')
    pg.click('.side .closex'); w(300)
    check(pg.evaluate(ACT) == new_bid, 'kruisje: de focus gaat terug naar het blok')
    pg.keyboard.press('Delete'); w(400)
    after_del = pg.evaluate(ACT)
    check(pg.locator('.lanes .blk:has-text("Toetsenbordblok")').count() == 0 and after_del not in (None, 'BODY', new_bid)
          and (after_del == 'bf-add' or pg.locator(f'.lanes [data-bid="{after_del}"]').count() == 1), f'Delete op een blok: de focus gaat naar het volgende blok of + Onderdeel ({after_del})')
    shot('16-bouwer-toetsenbord', False)
    # melding met Ongedaan maken blijft staan zolang de knop focus heeft
    pg.locator('.toast.show button:has-text("Ongedaan maken")').focus(); w(7600)
    check(pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1, 'melding met Ongedaan maken verdwijnt niet zolang de knop focus heeft')
    pg.locator('#bf-add').focus(); w(100)
    # smal scherm (ook een laptop op 200%): het bewerkpaneel ligt als vel over de pagina en is dan een venster
    pg.set_viewport_size({'width': 768, 'height': 900}); w(300)
    jb = pg.locator('.lanes .blk:has-text("Junglejacht")'); jb_id = jb.get_attribute('data-bid'); jb.click(); w(400)
    sheet = pg.locator('.sheet [role=dialog][aria-modal=true]')
    in_sheet = lambda: pg.evaluate("!!document.activeElement && !!document.activeElement.closest('.sheet [role=dialog]')")
    ok, stays = sheet.count() == 1 and in_sheet() and pg.evaluate("document.querySelector('header.bar').inert && !document.querySelector('.scrim').inert && !document.querySelector('.toast').inert"), True
    for k in ['Tab'] * 30 + ['Shift+Tab'] * 5: pg.keyboard.press(k); stays = stays and in_sheet()
    pg.keyboard.press('Escape'); w(400)
    check(ok and stays and sheet.count() == 0 and pg.evaluate(ACT) == jb_id and pg.locator('[inert]').count() == 0,
          'bouwer smal: bewerkpaneel is een venster (focus erin, Tab blijft erin, rest onbereikbaar), Esc sluit en de focus gaat terug naar het blok')
    jb.click(); w(300); pg.mouse.click(380, 30); w(400)
    check(sheet.count() == 0 and pg.locator('[inert]').count() == 0, 'bouwer smal: tikken naast het vel sluit het nog steeds')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    pg.goto(BASE + '/s/oefen/activiteiten'); w(1200)
    check(not pg.evaluate(NONAME), 'activiteitenbank: elk veld heeft een naam')
    cf = pg.evaluate("(() => { const c = document.querySelector('.toolbar .catfilter'), r = c.getBoundingClientRect(); return [Math.round(r.height), c.scrollWidth > c.clientWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1]; })()")
    check(cf[0] <= 50 and cf[1] and cf[2], f'banken mobiel: categorieën op één rij die zijwaarts schuift, de pagina schuift niet ({cf})')
    pg.locator('.toolbar .catfilter .chip').last.click(); w(200)
    check(pg.locator('.toolbar .catfilter .chip').last.get_attribute('aria-pressed') == 'true', 'banken mobiel: laatste categorie bereikbaar en te kiezen')
    pg.locator('.toolbar .catfilter .chip:text-is("Alle")').click(); w(200); shot('16a-bank-filter-mobiel', False)
    card = pg.locator('.bcard').first; card.click(); w(400)
    ok = sheet.count() == 1 and in_sheet(); shot('16b-vel-venster-mobiel', False)
    pg.keyboard.press('Escape'); w(400)
    check(ok and sheet.count() == 0 and pg.evaluate("document.activeElement.classList.contains('bcard')") and pg.locator('[inert]').count() == 0,
          'activiteitenbank mobiel: paneel is een venster, Esc sluit en de focus gaat terug naar de kaart')
    card.click(); w(300); pg.fill('#lf-title', 'Nog niet opgeslagen'); pg.keyboard.press('Escape'); w(300)
    check(sheet.count() == 1 and pg.locator('.toast.show button:has-text("Weggooien")').count() == 1, 'Esc met niet-opgeslagen wijzigingen: vraagt eerst')
    pg.click('.toast.show button:has-text("Weggooien")'); w(400)
    check(sheet.count() == 0 and pg.locator('[inert]').count() == 0, 'Weggooien in de melding werkt terwijl het vel open stond')
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1200)
    pg.locator('.bcard').first.click(); w(400); ok = sheet.count() == 1 and in_sheet()
    pg.keyboard.press('Escape'); w(400)
    check(ok and sheet.count() == 0 and pg.evaluate("document.activeElement.classList.contains('bcard')"), 'opkomstenbank mobiel: paneel is een venster, Esc sluit en de focus gaat terug')
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    cal_lbl = pg.eval_on_selector_all('.cal button.cday', 'els => els.map(e => e.getAttribute("aria-label"))')
    check(pg.locator('.cal [aria-current=date]').count() == 1 and cal_lbl and all(re.search(r' · (programma klaar|aandachtspunten|programma nog leeg|alleen onderwerp|nog open|kamp|geen opkomst)', x or '') for x in cal_lbl),
          'kalender: vandaag heeft aria-current, elke dag noemt zijn status')
    pg.evaluate("document.querySelector('.cal').scrollIntoView({ block: 'center' })"); w(200); shot('16c-kalender-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'kalender mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    for bank in ['activiteiten', 'opkomsten']:
        pg.goto(BASE + '/s/oefen/' + bank); w(1200)
        pg.locator('.bcard').first.click(); w(300); opened = pg.locator('aside.side.editing').count() == 1
        pg.keyboard.press('Escape'); w(300)
        check(opened and pg.locator('aside.side.editing').count() == 0, f'{bank}bank breed: Esc sluit het zijpaneel')
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1200)
    check(not pg.evaluate(NONAME) and pg.locator('.rangebar label:text-is("Van")').get_attribute('for'), 'jaarplanning: elk veld heeft een naam (ook Van en Tot en met)')
    pg.goto(BASE + '/s/oefen/instellingen'); w(1200)
    check(not pg.evaluate(NONAME), 'instellingen: elk veld heeft een naam')
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1200)
    col = lambda sel, prop='color': pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).{prop}")
    check(col('.zone span') == 'rgb(138, 82, 0)' and col('.tick', 'opacity') == '1', 'contrast: signaaltekst donkerder, tijden in de tijdlijn niet doorschijnend')
    pg.click('.ctx >> text=Leiding indelen'); w(500)
    check(not pg.evaluate(NONAME), 'leiding indelen: elk veld heeft een naam')
    pg.keyboard.press('Escape'); w(300)
    # een verlopen melding is niet meer aan te klikken: de knop verdwijnt mee
    pg.locator('.lanes .blk:has-text("Junglejacht")').click(); pg.keyboard.press('Delete'); w(300)
    check(pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1, 'melding met Ongedaan maken staat er')
    w(7300)
    check(pg.locator('.toast button').count() == 0 and pg.locator('.toast.has-act').count() == 0 and pg.evaluate("getComputedStyle(document.querySelector('.toast')).pointerEvents") == 'none',
          'verlopen melding: knop weg en niet meer aan te klikken')
    # opnieuw beginnen: eerst bevestigen, en bij niet-opgeslagen wijzigingen eerst vragen
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Rond de wereld")'); w(300); pg.fill('#tf-title', 'Rond de wereld X'); w(200)
    pg.click('.oefenbar >> text=Opnieuw beginnen'); w(300)
    armed = pg.locator('.oefenbar button:has-text("Klik nogmaals: alles terugzetten")').count() == 1 and pg.locator('#tf-title').count() == 1
    pg.click('.oefenbar >> text=Klik nogmaals: alles terugzetten'); w(300)
    check(armed and pg.locator('.toast.show button:has-text("Weggooien")').count() == 1 and pg.input_value('#tf-title') == 'Rond de wereld X',
          'oefenomgeving: opnieuw beginnen vraagt eerst bevestiging, en waarschuwt bij niet-opgeslagen wijzigingen')
    pg.click('.toast.show button:has-text("Weggooien")'); w(1800)
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(900)
    check(pg.input_value('#om-title') == 'Junglejacht en stratego' and 'Levend stratego XYZ' not in titles() and 'Levend stratego' in ' '.join(titles()), 'oefenomgeving: opnieuw beginnen zet voorbeelddata terug')
    # voorbeelddata van vorige week: niets aan veranderd → stil vernieuwd; wel veranderd → blijft staan en de oefenbalk meldt het
    today, old = date.today(), date.today() - timedelta(days=10)
    oefen_meta = lambda: pg.evaluate("JSON.parse(localStorage.getItem('opk.oefen.v1.meta'))")
    set_meta = lambda m: pg.evaluate("m => m ? localStorage.setItem('opk.oefen.v1.meta', JSON.stringify(m)) : localStorage.removeItem('opk.oefen.v1.meta')", m)
    jt = "s['speltakken/oefen/opkomsten/opk-jungle'].title"
    check(oefen_meta()['made'] == today.isoformat(), 'oefenomgeving: voorbeelddata onthoudt van wanneer hij is')
    oefen_set(jt + " = 'Oude titel'"); set_meta({'made': old.isoformat(), 'touched': False})
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    check(oefen_get(jt) == 'Junglejacht en stratego' and oefen_meta() == {'made': today.isoformat(), 'touched': False} and pg.locator('.oefenbar:has-text("loopt achter")').count() == 0,
          'oefenomgeving: voorbeelddata van vorige week zonder wijzigingen → stil vernieuwd')
    MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
    oefen_set(jt + " = 'Mijn eigen titel'"); set_meta({'made': old.isoformat(), 'touched': True})
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    bar = pg.locator('.oefenbar')
    check(oefen_get(jt) == 'Mijn eigen titel' and f'van {old.day} {MAANDEN[old.month - 1]} en loopt achter' in bar.inner_text(),
          'oefenomgeving: oude voorbeelddata met wijzigingen blijft staan, de oefenbalk zegt van wanneer hij is')
    shot('13d-oefenen-oud', False)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'oefenbalk met oude voorbeelddata mobiel: geen horizontale scroll'); shot('13e-oefenen-oud-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('.oefenbar button:has-text("Opnieuw beginnen")'); w(200); pg.click('.oefenbar >> text=Klik nogmaals: alles terugzetten'); w(1800)
    check(oefen_get(jt) == 'Junglejacht en stratego' and pg.locator('.oefenbar:has-text("loopt achter")').count() == 0 and oefen_meta()['made'] == today.isoformat(),
          'oefenomgeving: opnieuw beginnen zet verse voorbeelddata neer, melding weg')
    # oudere opslag zonder datum: niets weggooien, wel melden als de speltak al een week oud is
    set_meta(None); oefen_set("s['speltakken/oefen'].createdAt = Date.now() - 10 * 864e5; " + jt + " = 'Van vroeger'")
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    check(oefen_get(jt) == 'Van vroeger' and pg.locator('.oefenbar:has-text("loopt achter")').count() == 1, 'oefenomgeving: oudere opslag zonder datum blijft staan, met de melding')
    pg.click('.oefenbar button:has-text("Opnieuw beginnen")'); w(200); pg.click('.oefenbar >> text=Klik nogmaals: alles terugzetten'); w(1800)
    pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(900)
    pg.click('header.bar .acct .btn'); w(200); pg.click('.menu >> text=Opnieuw beginnen'); w(200)
    check(pg.locator('.menu button:has-text("Klik nogmaals: alles terugzetten")').count() == 1 and pg.locator('.loading').count() == 0, 'accountmenu: opnieuw beginnen vraagt eerst bevestiging')
    pg.click('header.bar .acct .btn'); w(200)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(200); pg.evaluate('window.scrollTo(0, 0)'); w(100)
    pg.click('.oefenbar >> text=Opnieuw beginnen'); w(200)
    check(pg.locator('.oefenbar button:has-text("Klik nogmaals")').count() == 1 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'oefenbalk mobiel met bevestiging: geen horizontale scroll')
    shot('13b-oefenen-bevestigen-mobiel', False); w(3200)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    tt = pg.locator('#om-title')
    whole = "e => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1"
    one = tt.evaluate(whole); h1 = tt.bounding_box()['height']
    pg.fill('#om-title', 'Junglejacht en stratego in het grote bos'); w(300)
    check(one and tt.evaluate(whole) and tt.bounding_box()['height'] > h1 * 1.5, 'bouwer mobiel: lange titel loopt door op een volgende regel, niets afgekapt')
    tt.click(); pg.keyboard.press('End'); pg.keyboard.press('Enter'); w(200)
    check('\n' not in tt.input_value(), 'bouwer: Enter maakt geen regeleinde in de titel')
    pg.evaluate("window.scrollTo(0, 0)"); shot('03c-bouwer-titel-mobiel', False)
    pg.fill('#om-title', 'Junglejacht en stratego'); w(700)
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(900)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'oefenomgeving mobiel: geen horizontale scroll'); shot('13-oefenen-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900})
    pg.click('.oefenbar >> text=Stoppen'); w(1200)
    check('/s/oefen' not in pg.url and pg.evaluate("localStorage.getItem('opk.sid')") != 'oefen', 'oefenen stoppen: terug naar je eigen speltak')
    logout_to(BASE + '/inloggen')
    pg.click('a:has-text("Oefenomgeving")'); w(1200)
    check('/s/oefen/' in pg.url and pg.locator('.watermark.on').count() == 1, 'oefenomgeving werkt zonder inloggen')
    shot('14-oefenen')
    green = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()")
    pg.evaluate('history.back()'); w(800)
    check('/inloggen' in pg.url and green != '#1e3a5f' and pg.evaluate("getComputedStyle(document.querySelector('.auth-card .btn.primary')).backgroundColor") == 'rgb(30, 58, 95)',
          f'terug van de oefenomgeving ({green}) naar inloggen: weer marine')
    # opkomstbouwer: de komende opkomsten staan bovenaan, met datum en status
    pg.goto(BASE + '/s/oefen/bouwer'); w(1000)
    coming = pg.locator('.picklist.coming .pick')
    check(coming.count() >= 2 and 'Junglejacht en stratego' in coming.first.inner_text() and coming.first.locator('.pk-when').count() == 1 and coming.first.locator('.pill').count() == 1,
          'bouwer: komende opkomsten bovenaan, met datum en status')
    check(pg.title() == 'Opkomstbouwer · Welpen · Opkomstplanner', f'paginatitel noemt de pagina ({pg.title()})'); shot('25-bouwer-komend')
    coming.first.locator('button:has-text("Openen")').click(); w(900)
    check(pg.url.endswith('/bouwer/opk-jungle') and pg.locator('h1').count() == 1 and 'Junglejacht en stratego' in pg.locator('h1').inner_text(), 'komende opkomst openen; de bouwer heeft een kop (h1) met de titel')
    jl = pg.locator('.lanes .blk:has(.t:text-is("Junglejacht"))').get_attribute('aria-label') or ''
    check(re.fullmatch(r'Junglejacht, \d\d:\d\d tot \d\d:\d\d, 2 van 2 leiding, Baloe, Kaa, Grasveld', jl) is not None, f'onderdeel in de tijdlijn: naam noemt leiding, namen en locatie ({jl})')
    pg.click('.ctx >> text=Leiding indelen'); w(500)
    tl = pg.locator('.modal .tk-tl .blk:has(.t:text-is("Junglejacht"))').get_attribute('aria-label') or ''
    check(tl == jl, f'leiding indelen: onderdeel noemt ook leiding, namen en locatie ({tl})')
    pg.click('.modal >> text=Klaar'); w(300)
    # overslaan-link en accountmenu met het toetsenbord
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000)
    check(pg.title() == 'Jaarplanning · Welpen · Opkomstplanner', f'paginatitel per pagina ({pg.title()})')
    pg.keyboard.press('Tab'); skip = pg.evaluate("document.activeElement.className + '|' + document.activeElement.textContent")
    pg.keyboard.press('Enter'); w(100)
    check(skip == 'skiplink|Naar inhoud' and pg.evaluate("document.activeElement.id") == 'inhoud', f'eerste Tab: Naar inhoud, Enter springt naar de inhoud ({skip})')
    acct = pg.locator('header.bar .acct .btn')
    check(acct.get_attribute('aria-label') == 'Akela, account' and acct.get_attribute('aria-haspopup') == 'menu' and acct.get_attribute('aria-expanded') == 'false', 'accountknop: zichtbare naam in de naam, uitgeklapt of niet')
    acct.focus(); pg.keyboard.press('Enter'); w(200)
    act_txt = lambda: pg.evaluate("(document.activeElement.getAttribute('role') || '') + '|' + document.activeElement.textContent")
    a1 = act_txt(); pg.keyboard.press('ArrowDown'); w(50); a2 = act_txt()
    check(acct.get_attribute('aria-expanded') == 'true' and a1 == 'menuitem|Opnieuw beginnen' and a2 == 'menuitem|Oefenen stoppen', f'accountmenu met Enter: focus op het eerste item, pijltjes werken ({a1}, {a2})')
    pg.keyboard.press('Escape'); w(200)
    check(pg.locator('.menu').count() == 0 and acct.get_attribute('aria-expanded') == 'false' and pg.evaluate("document.activeElement === document.querySelector('header.bar .acct .btn')"), 'Esc sluit het accountmenu, de focus gaat terug naar de knop')
    acct.click(); w(200); pg.keyboard.press('Tab'); w(200)
    check(pg.locator('.menu').count() == 0, 'Tab uit het accountmenu sluit het')
    # jaarplanning op de telefoon: compacte rijen
    pg.set_viewport_size({'width': 390, 'height': 844}); w(300); pg.click('.presets >> text=Dit seizoen'); w(500)
    hs = pg.evaluate("[...document.querySelectorAll('.prow:not(.head)')].map(r => r.getBoundingClientRect().height)")
    check(len(hs) > 20 and max(hs) <= 240 and sum(hs) / len(hs) <= 170 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
          f'jaarplanning mobiel: compacte rijen zonder horizontaal scrollen (max {max(hs):.0f} px, gemiddeld {sum(hs) / len(hs):.0f} px)')
    check(pg.locator('.prow .f-abs.none .addtxt').first.is_visible() and pg.locator('.prow .brief.none .btxt').first.bounding_box()['width'] <= 1
          and pg.locator('.prow .f-plan .plabel').first.is_visible(), 'jaarplanning mobiel: "+ Afwezig", lege brief als envelop, Planning door met label')
    pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))').scroll_into_view_if_needed(); shot('26-jaarplanning-mobiel', False)
    # tablet: dezelfde compacte rij (datum, onderwerp en opkomst op één regel; wie plant en afwezig eronder)
    for wd in (768, 1024):
        pg.set_viewport_size({'width': wd, 'height': 900}); w(300)
        hs = pg.evaluate("[...document.querySelectorAll('.prow:not(.head)')].map(r => r.getBoundingClientRect().height)")
        lines = pg.evaluate("""[...document.querySelectorAll('.prow:not(.head):not(.geen)')].filter(r => r.querySelector('.plink')).slice(0, 5).map(r => {
          const t = s => Math.round(r.querySelector(s).getBoundingClientRect().top); return t('.pdate') <= t('.f-opk') + 4 && t('.f-plan') > t('.f-opk') + 20; })""")
        check(len(hs) > 20 and max(hs) <= 150 and sum(hs) / len(hs) <= 125 and lines and all(lines) and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
              f'jaarplanning {wd} px: compacte rijen, opkomst naast de datum (max {max(hs):.0f} px, gemiddeld {sum(hs) / len(hs):.0f} px)')
    pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))').scroll_into_view_if_needed(); shot('26b-jaarplanning-tablet', False)
    # laptop (ook 1920 px): de opkomst in elke gekoppelde rij dezelfde vorm. Titel over de hele kolom, status en knoppen samen op de regel eronder
    for wd in (1920, 1360):
        pg.set_viewport_size({'width': wd, 'height': 900}); w(300)
        shape = pg.evaluate("""[...document.querySelectorAll('.prow:not(.head):not(.geen)')].filter(r => r.querySelector('.plink')).map(r => {
          const c = r.querySelector('.f-opk > .pcell'), C = c.getBoundingClientRect(), L = c.querySelector('.plink').getBoundingClientRect(), P = c.querySelector('.pill').getBoundingClientRect();
          const mid = x => (x.top + x.bottom) / 2, btns = [...c.querySelectorAll(':scope > .iconbtn')].map(b => b.getBoundingClientRect());
          return [Math.round(r.getBoundingClientRect().height), P.top >= L.bottom - 1 && Math.abs(P.left - C.left) < 2, btns.every(b => Math.abs(mid(b) - mid(P)) <= 3), Math.abs(L.width - C.width) < 2]; })""")
        hts = [x[0] for x in shape]
        check(len(shape) >= 4 and max(hts) - min(hts) <= 2 and all(x[1] and x[2] and x[3] for x in shape),
              f'jaarplanning {wd} px: elke gekoppelde rij even hoog, status en knoppen samen onder de titel ({shape[:3]})')
    shot('26c-jaarplanning-laptop', False)
    gtop = pg.locator('.prow.geen .ptopic').evaluate_all('es => es.map(e => e.value)')
    check('Trainingsweekend leiding' in gtop and 'Geen opkomst' not in gtop, f'oefenomgeving: bij Geen opkomst staat de reden, niet nog eens "Geen opkomst" ({gtop})')
    # --- koppelen: zoeken, en wat bij het onderwerp past staat bovenaan met een label
    pg.click('.presets >> text=Dit seizoen'); w(400)
    ridx = lambda t: pg.evaluate("t => [...document.querySelectorAll('.prow:not(.head)')].findIndex(r => r.querySelector('.ptopic')?.value === t)", t)
    check(pg.locator('h1:text-is("Jaarplanning")').count() == 1 and pg.locator('.subline:has-text("Seizoen ")').count() == 1, 'jaarplanning: kop zoals in het menu, het seizoen eronder')
    pg.click('.presets >> text=Komende 3 maanden'); w(400)
    prow(ridx('Sinterklaas')).locator('.btn:has-text("Koppelen")').click(); w(300)
    heads = pg.locator('.modal h3').all_inner_texts(); past = pg.locator('.modal h3:text-is("Past bij Sinterklaas") + .picklist')
    check(heads[:2] == ['Past bij Sinterklaas', 'Uit de opkomstenbank'] and past.locator('.pick .info > b').all_inner_texts() == ['Sinterklaasopkomst']
          and past.locator('.pick-kicker').inner_text().strip() == 'Concept' and 'Concepten' not in heads and pg.locator('.modal .pill:has-text("Past bij onderwerp")').count() == 0,
          f'koppelen: wat bij het onderwerp past bovenaan in een eigen groep, met waar het vandaan komt ({heads})')
    prim = pg.locator('.modal .btn.primary')
    check(prim.count() == 1 and prim.get_attribute('aria-label') == 'Kiezen: Sinterklaasopkomst' and pg.locator('.modal .pick .btn:not(.primary):has-text("Kiezen")').count() == 3,
          'koppelen: alleen Kiezen bij de beste suggestie is de hoofdknop (Nieuwe opkomst en de bank gewoon)')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(300)
    pb = prim.bounding_box()
    check(pb is not None and pb['y'] + pb['height'] <= 844 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'koppelen mobiel: de beste suggestie meteen in beeld ({pb})')
    shot('28a-koppelen-past-bij-mobiel', False)
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('.modal .closex'); w(200)
    prow(ridx('Rond de wereld')).locator('.btn:has-text("Koppelen")').click(); w(300)
    bank_titles = lambda: pg.locator('.modal .picklist').first.locator('.pick .info > b').all_inner_texts()
    t0 = bank_titles(); tb = pg.locator('.modal h3:text-is("Uit de opkomstenbank") + .picklist .pick .info > b').all_inner_texts()
    check(t0 == ['Rond de wereld'] and pg.locator('.modal .picklist').first.locator('.pick-kicker').inner_text().strip() == 'Uit de opkomstenbank' and len(tb) == 2 and tb == sorted(tb),
          f'koppelen: wat bij het onderwerp past bovenaan (uit de bank), de rest op naam ({t0}, {tb})')
    shot('28b-koppelen-past-bij', False)
    pg.fill('.modal input[aria-label="Zoek opkomst"]', 'toren'); w(200); t1 = bank_titles()
    shot('28-koppelen-zoeken', False)
    pg.fill('.modal input[aria-label="Zoek opkomst"]', 'qqq'); w(200)
    check(t1 == ['Knopen en pionieren'] and pg.locator('.modal .empty:has-text("Niets gevonden")').count() == 1, f'koppelen: zoeken in titel en onderdelen ({t1})')
    pg.click('.modal .closex'); w(200)
    # snelkeuze in Datum en soort: de vaste zaterdag niet dubbel
    prow(ridx('Rond de wereld')).locator('.pdate').click(); w(300)
    qc = pg.locator('.modal .chip').all_inner_texts()
    check(not any('(standaard)' in c for c in qc) and qc.count('Zaterdag') == 1, f'datum en soort: geen dubbele snelkeuze voor zaterdag ({qc})')
    pg.click('.modal .closex'); w(200)
    # ontkoppelen kan terug; Leiding indelen heeft een eigen icoon (niet hetzelfde potlood als Planning door en Afwezig)
    vk = lambda: pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))')
    check(vk().locator('[aria-label^="Leiding indelen "] svg.lucide-users').count() == 1, 'jaarplanning: Leiding indelen met het icoon van een groepje mensen')
    vk().locator('[aria-label^="Opkomst "][aria-label$=" ontkoppelen"]').click(); w(200); vk().locator('button:text-is("Ontkoppelen?")').click(); w(500)
    undo = pg.locator('.toast.show button:has-text("Ongedaan maken")')
    loose = vk().count() == 0 and undo.count() == 1
    undo.click(); w(600)
    check(loose and vk().count() == 1 and soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-1'].opkId === 'opk-vuur' && s['speltakken/oefen/opkomsten/opk-vuur'].state === 'planned'")),
          'ontkoppelen: Ongedaan maken zet de opkomst terug op dezelfde datum')
    # geen opkomst voor een hele periode (bijv. een vakantie), datums met alleen cijfers (cijferpad op een iPhone)
    # van de zaterdag met een opkomst (pl-1) t/m een vrije zaterdag 7 weken later: daartussen een zaterdag met alleen een onderwerp
    # (pl-2, Sinterklaas), een die al Geen opkomst is (pl-3) en het kamp
    d1 = oefen_get("s['speltakken/oefen/planning/pl-1'].date")
    d2 = (date.fromisoformat(oefen_get("s['speltakken/oefen/planning/pl-1'].slot")) + timedelta(days=49)).isoformat()
    slot_rows = lambda d: oefen_get(f"Object.entries(s).filter(([k, v]) => k.startsWith('speltakken/oefen/planning/') && v && v.slot === '{d}').map(([k, v]) => v.type + '|' + v.topic)")
    t3, free0 = oefen_get("s['speltakken/oefen/planning/pl-3'].topic"), slot_rows(d2)
    dd = lambda iso, f: date.fromisoformat(iso).strftime(f)
    pg.click('button:has-text("Extra datum")'); w(300); pg.click('.modal .chip:has-text("Geen opkomst")')
    pg.fill('#xd-date', dd(d1, '%d%m%Y')); pg.press('#xd-date', 'Tab'); tidy = pg.input_value('#xd-date')
    pg.fill('#xd-end', dd(d2, '%d%m%y')); pg.fill('#xd-topic', 'Testvakantie'); pg.press('#xd-topic', 'Tab')
    shot('29-geen-opkomst-periode', False)
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200); shot('29b-geen-opkomst-periode-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'extra datum mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    check(tidy == dd(d1, '%d-%m-%Y') and pg.input_value('#xd-end') == dd(d2, '%d-%m-%Y'), f'datum met alleen cijfers: na wegklikken netjes als dd-mm-jjjj ({tidy})')
    pg.click('.modal button:has-text("Toevoegen")'); w(500); msg = pg.locator('.toast').inner_text()
    check(free0 == [] and soon(lambda: slot_rows(d2) == ['geen|Testvakantie'] and oefen_get("s['speltakken/oefen/planning/pl-3'].type === 'geen' && s['speltakken/oefen/planning/pl-3'].topic === 'Testvakantie' && s['speltakken/oefen/planning/pl-1'].type === 'opkomst' && s['speltakken/oefen/planning/pl-1'].opkId === 'opk-vuur'")),
          'geen opkomst voor een periode: vrije zaterdag op Geen opkomst met de reden (ook een al vrije dag), een zaterdag met een opkomst blijft staan')
    check(oefen_get("s['speltakken/oefen/planning/pl-2'].type === 'opkomst' && s['speltakken/oefen/planning/pl-2'].topic === 'Sinterklaas'"),
          'geen opkomst voor een periode: een zaterdag met alleen een onderwerp blijft staan (onderwerp niet overschreven)')
    check('2 zaterdagen op Geen opkomst gezet' in msg and 'met een opkomst, onderwerp of kamp overgeslagen' in msg and pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1,
          f'geen opkomst voor een periode: de melding zegt wat er gebeurde, met Ongedaan maken ({msg})')
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(300)
    check(soon(lambda: slot_rows(d2) == [] and oefen_get(f"s['speltakken/oefen/planning/pl-3'].type === 'geen' && s['speltakken/oefen/planning/pl-3'].topic === {json.dumps(t3)}")),
          'geen opkomst voor een periode: Ongedaan maken haalt de nieuwe rij weg en zet de oude reden terug')
    # inplannen vanuit de bouwer op een datum met een ander onderwerp: de lijst zegt wat het onderwerp wordt, en Ongedaan maken zet het terug
    pg.goto(BASE + '/s/oefen/bouwer'); w(900); pg.click('main .btn:has-text("Nieuwe opkomst")'); w(700); pg.fill('#om-title', 'Speurtocht'); w(700)
    sp_id = pg.url.rstrip('/').rsplit('/', 1)[-1]
    pg.click('.plan-head >> text=Inplannen'); w(300)
    sk = pg.locator('.modal .pick:has-text("Sinterklaas")').first
    sk_change = sk.locator('.pk-change').all_inner_texts()
    dates = pg.evaluate("[...document.querySelectorAll('.modal .pick .info > b')].map(b => b.textContent)")
    check(sk_change == ['Onderwerp wordt Speurtocht (nu: Sinterklaas)'] and pg.locator('.modal .pick .pk-change').count() >= 1, f'inplannen: bij een datum met een ander onderwerp staat wat het onderwerp wordt ({sk_change})')
    shot('29c-inplannen-onderwerp', False)
    sk.locator('button:has-text("Hier inplannen")').click(); w(300)
    tt = pg.locator('.toast').inner_text()
    linked_ok = soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-2'].topic === 'Speurtocht' && s['speltakken/oefen/planning/pl-2'].opkId === " + json.dumps(sp_id)))
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(300)
    check('Onderwerp was "Sinterklaas"' in tt and linked_ok and len(dates) > 3
          and soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-2'].topic === 'Sinterklaas' && !s['speltakken/oefen/planning/pl-2'].opkId && s['speltakken/oefen/opkomsten/" + sp_id + "'].state === 'draft'"))
          and pg.locator('.pill:has-text("Concept")').count() == 1, f'inplannen: melding noemt het oude onderwerp; Ongedaan maken zet onderwerp en concept terug ({tt})')
    pg.click('.plan-head >> button:has-text("Verwijderen")'); w(200); pg.click('.plan-head >> text=Klik nogmaals om te verwijderen'); w(700)
    # startpagina van de bouwer: de komende datums met een onderwerp maar zonder programma, met één klik een programma maken
    open_rows = pg.locator('section[aria-labelledby="bw-open"] .pick')
    ot = open_rows.locator('.info > b').all_inner_texts()
    sink = pg.locator('section[aria-labelledby="bw-open"] .pick:has-text("Sinterklaas")')
    check(open_rows.count() == 3 and ot == ['Sinterklaas', 'Rond de wereld', 'Pannenkoekenopkomst']
          and 'Past bij: Sinterklaasopkomst (concept)' in sink.inner_text() and sink.locator('button:has-text("Koppelen")').count() == 1,
          f'bouwer: nog zonder programma de eerstvolgende 3 datums met een onderwerp; bij een passend concept ook Koppelen ({ot})')
    shot('25b-bouwer-zonder-programma')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200)
    pg.locator('#bw-open').scroll_into_view_if_needed(); shot('25c-bouwer-zonder-programma-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'bouwer nog zonder programma mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.locator('section[aria-labelledby="bw-open"] .pick:has-text("Pannenkoekenopkomst") button:has-text("Maken")').click(); w(900)
    pk_id = pg.url.rstrip('/').rsplit('/', 1)[-1]
    check(pg.input_value('#om-title') == 'Pannenkoekenopkomst' and pg.locator('.plan-head .pill:has-text("Ingepland")').count() == 1
          and soon(lambda: oefen_get("s['speltakken/oefen/planning/pl-6'].opkId === " + json.dumps(pk_id))), 'bouwer: Maken maakt een opkomst met het onderwerp als titel, gekoppeld aan de datum')
    # dashboard: lege locatie en omschrijving openen met één klik of tik (gevuld blijft het dubbelklikken)
    jg = oefen_get("(({ location, short }) => ({ location, short }))(s['speltakken/oefen/opkomsten/opk-jungle'])")
    oefen_set("const o = s['speltakken/oefen/opkomsten/opk-jungle']; o.location = ''; o.short = ''")
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    shot('07e-dashboard-leeg-veld-mobiel', False)
    pg.locator('.hero button:has-text("Locatie toevoegen")').click(); w(200)
    loc_one = pg.locator('.hero input.inline-edit[aria-label="Locatie"]').count() == 1
    pg.keyboard.type('Speelveld'); pg.keyboard.press('Enter'); w(300)
    pg.locator('.hero button:has-text("Korte omschrijving toevoegen")').click(); w(200)
    short_one = pg.locator('.hero textarea.inline-edit').count() == 1
    pg.keyboard.press('Escape'); w(200)
    pg.locator('.hero .facts span:text-is("Speelveld")').click(); w(600)
    check(loc_one and short_one and 'Speelveld' in pg.locator('.hero .facts').inner_text() and pg.locator('.hero .inline-edit').count() == 0
          and pg.locator('.hero button:has-text("Korte omschrijving toevoegen")').count() == 1,
          'dashboard: lege locatie en omschrijving openen met één klik; een ingevulde locatie opent niet met één klik')
    oefen_set("Object.assign(s['speltakken/oefen/opkomsten/opk-jungle'], " + json.dumps(jg) + ")")
    pg.set_viewport_size({'width': 1360, 'height': 900}); pg.goto(BASE + '/s/oefen/jaarplanning'); w(900)
    # banken: de kop is de naam uit het menu, het aantal staat eronder
    pg.click('nav >> text=Activiteitenbank'); w(700)
    check(pg.locator('h1:text-is("Activiteitenbank")').count() == 1 and re.search(r'\d+ activiteiten', pg.locator('.subline').inner_text()) is not None, 'activiteitenbank: kop zoals in het menu, aantal eronder')
    pg.click('nav >> text=Opkomstenbank'); w(700)
    check(pg.locator('h1:text-is("Opkomstenbank")').count() == 1 and re.search(r'\d+ opkomsten', pg.locator('.subline').inner_text()) is not None, 'opkomstenbank: kop zoals in het menu, aantal eronder')
    # --- jaarplanning en bouwer (eigen stand van de oefendata, daarna terug): kampdag wisselen, extra datum op een lege zaterdag,
    # inplannen uit de bank met Ongedaan maken, opmerking zichtbaar, rij leegmaken terugzetten, Gebruiken bij wat past
    w(900); bak_r3 = oefen_get('s')
    P_ = "s['speltakken/oefen/planning/"
    plan_of = lambda pid, f: oefen_get(P_ + pid + "']." + f)
    # kamp op een laptop: een andere dag kiezen sluit het bewerkpaneel van het onderdeel van de vorige dag
    pg.goto(BASE + '/s/oefen/bouwer/opk-kamp'); w(1200)
    days = pg.locator('.daytabs .daytab:not(.add)')
    days.nth(0).click(); w(300); pg.locator('.lanes .blk:has(.t:text-is("Nachtspel"))').click(); w(400)
    ed1 = pg.locator('#bf-title').count() == 1 and pg.input_value('#bf-title') == 'Nachtspel'
    days.nth(2).click(); w(400)
    check(ed1 and pg.locator('#bf-title').count() == 0 and days.nth(2).get_attribute('aria-selected') == 'true',
          'kamp: een andere dag kiezen sluit het onderdeel van de vorige dag (geen tijden van de verkeerde dag)')
    pg.locator('.lanes .blk:has(.t:text-is("Opruimen en inpakken"))').click(); w(300)
    ed2 = pg.locator('#bf-title').count() == 1
    pg.click('.dayedit button:has-text("Dag kopiëren")'); w(500)
    check(ed2 and pg.locator('#bf-title').count() == 0 and days.count() == 4 and days.nth(3).get_attribute('aria-selected') == 'true', 'kamp: Dag kopiëren sluit het onderdeel van de vorige dag')
    check(pg.locator('.plan-head button:has-text("Nieuw")').count() == 1 and pg.locator('.plan-head button:has-text("Alle opkomsten")').count() == 0, 'met recht Opkomsten: knop Nieuw in de bouwer')
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", bak_r3)
    # extra datum op een lege zaterdag (geen rij) en een weekend over een lege zaterdag (rij zonder inhoud): geen tweede rij voor die zaterdag
    s7 = plan_of('pl-7', 'slot'); s8 = (date.fromisoformat(s7) + timedelta(days=7)).isoformat(); s10 = (date.fromisoformat(s7) + timedelta(days=21)).isoformat()
    fri10, sun10 = (date.fromisoformat(s10) - timedelta(days=1)).isoformat(), (date.fromisoformat(s10) + timedelta(days=1)).isoformat()
    oefen_set(f"s['speltakken/oefen/planning/pl-leeg'] = {{ id: 'pl-leeg', slot: '{s10}', date: '{s10}' }}")
    on_day = lambda d: oefen_get(f"Object.entries(s).filter(([k, v]) => k.startsWith('speltakken/oefen/planning/') && v && (v.slot === '{d}' || v.date <= '{d}' && (v.endDate || v.date) >= '{d}')).map(([k, v]) => [k.split('/').pop(), v.slot, v.type, v.date, v.endDate, v.topic])")
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(400)
    n_topic = lambda t: pg.evaluate("t => [...document.querySelectorAll('.prow:not(.head) .ptopic')].filter(i => i.value === t).length", t)
    dd2 = lambda iso: date.fromisoformat(iso).strftime('%d-%m-%Y')
    def extra(kind, d1, d2, topic):
        pg.click('button:has-text("Extra datum")'); w(300); pg.click(f'.modal .chip:text-is("{kind}")')
        pg.fill('#xd-date', dd2(d1)); pg.fill('#xd-end', dd2(d2) if d2 else ''); pg.fill('#xd-topic', topic); pg.click('.modal button:has-text("Toevoegen")'); w(700)
    extra('Opkomst', s8, '', 'Kerstviering')
    r8 = on_day(s8)
    check(len(r8) == 1 and r8[0][1:] == [s8, 'opkomst', s8, '', 'Kerstviering'] and n_topic('Kerstviering') == 1 and pg.locator(f'#r-s-{s8}').count() == 0,
          f'extra datum op een lege zaterdag: die zaterdag zelf, geen tweede rij ({r8})')
    extra('Kamp / weekend', fri10, sun10, 'Groepsweekend')
    r10 = on_day(s10)
    check(r10 == [['pl-leeg', s10, 'kamp', fri10, sun10, 'Groepsweekend']] and n_topic('Groepsweekend') == 1, f'extra weekend over een zaterdag zonder inhoud: dat wordt de rij (vr–zo), geen lege zaterdag ernaast ({r10})')
    t7 = plan_of('pl-7', 'topic'); extra('Opkomst', s7, '', 'Tweede opkomst')
    r7 = sorted(on_day(s7), key=lambda x: x[0])
    check(len(r7) == 2 and plan_of('pl-7', 'topic') == t7 and any(x[1] is None and x[5] == 'Tweede opkomst' for x in r7), f'extra datum op een zaterdag met inhoud: die blijft, de extra datum komt ernaast ({r7})')
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", bak_r3)
    # inplannen op een dag zonder opkomst: niet stil overschrijven
    s3 = plan_of('pl-3', 'date')
    pg.goto(BASE + '/s/oefen/opkomsten'); w(1000); pg.click('.bcard:has-text("Grote vlaggenroof")'); w(300); pg.click('.side >> text=Inplannen'); w(400)
    pg.fill('.modal input[aria-label="Andere datum"]', dd2(s3)); pg.click('.modal button:has-text("Op deze datum")'); w(500)
    gt = pg.locator('.toast').inner_text()
    check('is geen opkomst (Trainingsweekend leiding)' in gt and pg.locator('.modal').count() == 1 and plan_of('pl-3', 'type') == 'geen' and not plan_of('pl-3', 'opkId'),
          f'inplannen op een dag zonder opkomst: geweigerd met uitleg, de dag blijft Geen opkomst ({gt})')
    pg.click('.modal .closex'); w(200)
    # koppelen uit de bank (met recht Opkomsten): Opkomst overnemen, en Ongedaan maken zet het onderwerp terug en haalt de kopie weg
    copies = lambda src: oefen_get(f"Object.values(s).filter(o => o && o.state === 'planned' && o.srcId === '{src}').length")
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Dit seizoen'); w(400)
    prow(ridx('Bosspel met de Scouts')).locator('.btn:has-text("Koppelen")').click(); w(300)
    pg.locator('.modal .pick:has-text("Knopen en pionieren")').first.locator('button:has-text("Kiezen")').click(); w(900)
    kt = pg.locator('.toast').inner_text(); kundo = pg.locator('.toast.show button:has-text("Ongedaan maken")')
    linked7 = plan_of('pl-7', 'topic') == 'Knopen en pionieren' and copies('opk-bank-knopen') == 1
    check(linked7 and pg.locator('.modal h2:has-text("Opkomst overnemen")').count() == 1 and 'zonder namen' in kt and kundo.count() == 1,
          f'koppelen uit de bank: Opkomst overnemen, melding met Ongedaan maken ({kt})')
    shot('46-koppelen-bank-ongedaan', False)
    kundo.click(); w(700)
    check(pg.locator('.modal').count() == 0 and soon(lambda: plan_of('pl-7', 'topic') == 'Bosspel met de Scouts' and not plan_of('pl-7', 'opkId') and copies('opk-bank-knopen') == 0)
          and oefen_get("s['speltakken/oefen/opkomsten/opk-bank-knopen'].state") == 'bank', 'koppelen uit de bank, Ongedaan maken: onderwerp terug, kopie weg, de bank blijft')
    # opmerking bij een datum: in de jaarplanning (ook bij Geen opkomst), op het dashboard en in de bouwer, voor iedereen te lezen
    NOTE = 'Vertrek om 13:45 bij het station'
    oefen_set(P_ + "pl-1'].note = " + json.dumps(NOTE) + "; " + P_ + "pl-0'].note = 'Neem een zaklamp mee'")
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(400)
    vrow = pg.locator('.prow:has(.plink:has-text("Vuur en kompas"))')
    check(vrow.locator('.pnote').text_content() == 'Opmerking: ' + NOTE and pg.locator('.prow.geen .pnote:has-text("Leiding heeft een trainingsweekend.")').count() == 1,
          'opmerking: in de jaarplanning onder het onderwerp, ook bij Geen opkomst')
    vrow.scroll_into_view_if_needed(); shot('47-opmerking-jaarplanning', False)
    pg.set_viewport_size({'width': 390, 'height': 844}); w(300); vrow.scroll_into_view_if_needed(); shot('47b-opmerking-jaarplanning-mobiel', False)
    nb = vrow.locator('.pnote').bounding_box(); rb = vrow.bounding_box()
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1') and nb['x'] >= rb['x'] and nb['x'] + nb['width'] <= rb['x'] + rb['width'] + 1, 'opmerking in de jaarplanning mobiel: binnen de rij, geen horizontale scroll')
    pg.goto(BASE + '/s/oefen/dashboard'); w(1200)
    nl = pg.locator('.nextlist').inner_text()
    check(NOTE in nl and 'Leiding heeft een trainingsweekend.' in nl and pg.locator('.hero .hero-note').text_content() == 'Opmerking: Neem een zaklamp mee'
          and pg.locator('.hero p.hero-short').count() == 1, 'opmerking: op het dashboard bij Daarna en op de kaart (naast de omschrijving van de opkomst)')
    shot('47c-opmerking-dashboard-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'opmerking op het dashboard mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200); shot('47d-opmerking-dashboard', False)
    pg.goto(BASE + '/s/oefen/bouwer/opk-vuur'); w(1000)
    check(pg.locator('.ctx .ctx-note').text_content() == 'opmerking: ' + NOTE, 'opmerking: in de bouwer bij een ingeplande opkomst')
    # rij leegmaken kan terug: onderwerp, planning, afwezig en opmerking, en de opkomst weer gekoppeld
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(1000); pg.click('.presets >> text=Komende 3 maanden'); w(400)
    pl1 = oefen_get(P_ + "pl-1']")
    vrow.locator('.pdate').click(); w(300); pg.click('.modal button:has-text("Rij leegmaken")'); w(150); pg.click('.modal button:has-text("Klik nogmaals om leeg te maken")'); w(600)
    cleared = not oefen_get(P_ + "pl-1']") and oefen_get("s['speltakken/oefen/opkomsten/opk-vuur'].state") == 'draft' and vrow.count() == 0
    pg.click('.toast.show button:has-text("Ongedaan maken")'); w(700)
    pl1b = oefen_get(P_ + "pl-1']") or {}
    check(cleared and all(pl1b.get(k) == pl1[k] for k in ('topic', 'planners', 'absent', 'note', 'opkId', 'date', 'slot')) and oefen_get("s['speltakken/oefen/opkomsten/opk-vuur'].state") == 'planned' and vrow.count() == 1,
          f'rij leegmaken: Ongedaan maken zet de rij terug, met de opkomst weer gekoppeld ({pl1b.get("topic")}, {pl1b.get("opkId")})')
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", bak_r3)
    # nog zonder programma: past er een concept of iets uit de bank bij, dan is Gebruiken de hoofdknop (Maken gewoon)
    pg.goto(BASE + '/s/oefen/bouwer'); w(1000)
    sk = pg.locator('section[aria-labelledby="bw-open"] .pick:has-text("Sinterklaas")'); rw = pg.locator('section[aria-labelledby="bw-open"] .pick:has-text("Rond de wereld")')
    check(sk.locator('.btn.primary').all_inner_texts() == ['Gebruiken'] and sk.locator('.btn:not(.primary):has-text("Maken")').count() == 1 and rw.locator('.btn.primary').all_inner_texts() == ['Gebruiken'],
          'bouwer, nog zonder programma: Gebruiken is de hoofdknop bij wat past, Maken een gewone knop')
    pg.set_viewport_size({'width': 390, 'height': 844}); w(200); pg.locator('#bw-open').scroll_into_view_if_needed(); shot('25d-bouwer-gebruiken-mobiel', False)
    check(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'bouwer met Gebruiken mobiel: geen horizontale scroll')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    sk.locator('button:has-text("Gebruiken")').click(); w(700)
    check(soon(lambda: plan_of('pl-2', 'opkId') == 'opk-sint' and oefen_get("s['speltakken/oefen/opkomsten/opk-sint'].state") == 'planned') and 'Gekoppeld' in pg.locator('.toast').inner_text(),
          'Gebruiken bij een concept: dat concept wordt gekoppeld (geen tweede, lege opkomst)')
    rw.locator('button:has-text("Gebruiken")').click(); w(900)
    check(pg.locator('.modal h2:has-text("Opkomst overnemen")').count() == 1 and copies('opk-bank-wereld') == 1 and pg.locator('.toast.show button:has-text("Ongedaan maken")').count() == 1,
          'Gebruiken uit de bank: een kopie zonder namen ingepland, Opkomst overnemen, met Ongedaan maken')
    pg.click('.modal >> text=Klaar'); w(300)
    pg.evaluate("v => localStorage.setItem('opk.oefen.v1', JSON.stringify(v))", bak_r3)
    pg.goto(BASE + '/s/oefen/jaarplanning'); w(900)
    # --- nieuwe opkomst: titel klaar om te typen; leeg weggaan laat geen concept achter, ingevuld blijft hij staan
    n_draft = lambda: oefen_get("Object.keys(s).filter(k => k.startsWith('speltakken/oefen/opkomsten/') && s[k].state === 'draft').length")
    pg.click('nav >> text=Opkomstbouwer'); w(800); n0 = n_draft()
    pg.click('main .btn:has-text("Nieuwe opkomst")'); w(800)
    focused, made = pg.evaluate("document.activeElement && document.activeElement.id"), n_draft()
    pg.click('nav >> text=Opkomstbouwer'); w(900)
    check(focused == 'om-title' and made == n0 + 1 and n_draft() == n0 and pg.locator('.pick:has-text("Naamloze opkomst")').count() == 0,
          f'nieuwe opkomst: de titel heeft de focus; leeg weggaan laat geen "Naamloze opkomst" achter ({focused}, {made} → {n_draft()})')
    pg.click('nav >> text=Dashboard'); w(700); pg.click('main .btn:has-text("Nieuwe opkomst")'); w(800); pg.click('nav >> text=Jaarplanning'); w(900)
    check(n_draft() == n0, 'nieuwe opkomst vanaf het dashboard: leeg weggaan ruimt hem ook op')
    pg.click('nav >> text=Opkomstbouwer'); w(700); pg.click('main .btn:has-text("Nieuwe opkomst")'); w(600); pg.keyboard.type('Blijft staan'); w(800)
    pg.click('nav >> text=Opkomstbouwer'); w(900)
    check(n_draft() == n0 + 1 and pg.locator('.pick:has-text("Blijft staan")').count() == 1, 'nieuwe opkomst met een titel blijft staan als concept')
    pg.click('.pick:has-text("Blijft staan") >> text=Openen'); w(700); pg.fill('#om-title', ''); w(800)
    pg.click('nav >> text=Opkomstbouwer'); w(900)
    check(n_draft() == n0 + 1, 'een opkomst die al bestond, wordt nooit vanzelf opgeruimd (ook niet zonder titel)')
    # --- bouwer op de telefoon: details ingeklapt, tellers op één regel, tijdlijn en activiteitenbank snel in beeld
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1200)
    lanes_top = pg.evaluate("document.querySelector('.lanes').getBoundingClientRect().top + scrollY")
    check(pg.locator('.metatoggle[aria-expanded="false"]').count() == 1 and pg.locator('#om-meta').count() == 0 and pg.locator('.summary.mini').is_visible() and pg.locator('.summary .stat').count() == 0 and lanes_top < 1000,
          f'bouwer mobiel: details ingeklapt, tellers op één regel, de tijdlijn begint op {lanes_top:.0f} px')
    shot('30-bouwer-mobiel', False)
    fab = pg.locator('.plan-fab')
    # bij het openen staat + Onderdeel onderin, waar de knop Activiteit zweeft: die knop is dan weg (een tik op + Onderdeel raakt + Onderdeel)
    COVER = """(() => { const a = document.getElementById('bf-add').getBoundingClientRect(), f = document.querySelector('.plan-fab'), r = f && f.getBoundingClientRect();
      const hit = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
      return [a.bottom <= innerHeight, !!hit && !!hit.closest('#bf-add'), !r || r.bottom <= a.top || r.top >= a.bottom || r.right <= a.left || r.left >= a.right]; })()"""
    cover0 = pg.evaluate(COVER); fab_low = fab.count()
    pg.evaluate('window.scrollBy(0, 300)'); w(400)
    cover1 = pg.evaluate(COVER)
    check(cover0 == [True, True, True] and fab_low == 0 and cover1[1:] == [True, True], f'bouwer mobiel: de knop Activiteit ligt nooit over + Onderdeel ({cover0}, {cover1})')
    fab_ok = fab.is_visible(); fab.click(); w(900)
    side_top = pg.evaluate("document.querySelector('.side').getBoundingClientRect().top")
    check(fab_ok and 0 <= side_top < 250 and pg.locator('.side .tabs button[aria-selected="true"]:has-text("Activiteitenbank")').count() == 1 and fab.count() == 0,
          f'bouwer mobiel: knop Activiteit onderin brengt je naar de activiteitenbank (bovenkant op {side_top:.0f} px), daarna is hij weg')
    nb = pg.locator('.lanes .blk').count()
    pg.locator('.lib:has-text("EHBO-kwartet") button:has-text("Inplannen")').click(); w(1000)
    inview = pg.evaluate("(() => { const b = document.querySelectorAll('.lanes .blk.flash'); if (b.length !== 1) return false; const r = b[0].getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()")
    check(pg.locator('.lanes .blk').count() == nb + 1 and inview, 'bouwer mobiel: na Inplannen staat het nieuwe onderdeel in beeld en licht het op')
    shot('31-bouwer-mobiel-ingepland', False)
    pg.click('.metatoggle'); w(300)
    check(pg.locator('#om-meta').is_visible() and pg.locator('.metatoggle[aria-expanded="true"]').count() == 1 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
          'bouwer mobiel: Details klapt uit, geen horizontale scroll')
    lines = "(() => { const h = document.querySelector('main h1'), r = document.createRange(); r.selectNodeContents(h); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; })()"
    hl = []
    for nav_to in ('activiteiten', 'opkomsten'):
        pg.click(f'header nav a[href$="/{nav_to}"]'); w(700); hl.append(pg.evaluate(lines))
    check(hl == [1, 1], f'telefoon: de kop Activiteitenbank en Opkomstenbank past op één regel, niet midden in het woord afgebroken ({hl})')
    pg.click('header nav a[href$="/bouwer"]'); w(700); pg.click('main .btn:has-text("Nieuwe opkomst")'); w(800)
    check(pg.locator('#om-meta').is_visible() and pg.locator('.metatoggle[aria-expanded="true"]').count() == 1, 'bouwer mobiel: een nieuwe opkomst opent met de details open')
    pg.set_viewport_size({'width': 1360, 'height': 900}); w(200)
    pg.click('nav >> text=Opkomstbouwer'); w(700)
    check(n_draft() == n0 + 1, 'bouwer breed: lege nieuwe opkomst weer opgeruimd')
    # --- bouwer op een laptop: details van een bestaande opkomst ook ingeklapt, zodat de tijdlijn boven de vouw begint; open of dicht wordt onthouden
    pg.evaluate("localStorage.removeItem('opk.details.breed')"); pg.goto(BASE + '/s/oefen/bouwer/opk-jungle'); w(1200)
    lt = pg.evaluate("document.querySelector('.lanes').getBoundingClientRect().top + scrollY")
    check(pg.locator('.metatoggle[aria-expanded="false"]').count() == 1 and pg.locator('#om-meta').count() == 0 and pg.locator('.present').count() == 0 and pg.locator('.summary .stat').count() > 3 and lt < 900,
          f'bouwer breed: details ingeklapt (met inklapknop), tellers blijven, de tijdlijn begint op {lt:.0f} px (boven de vouw)')
    shot('30b-bouwer-breed-ingeklapt', False)
    pg.click('.metatoggle'); w(300)
    opened = pg.locator('#om-meta .timefield').count() == 2 and pg.locator('.present .chip').count() > 0
    pg.reload(); w(1200)
    kept = pg.locator('.metatoggle[aria-expanded="true"]').count() == 1 and pg.locator('#om-meta').is_visible()
    pg.click('.metatoggle'); w(300); pg.reload(); w(1200)
    check(opened and kept and pg.locator('.metatoggle[aria-expanded="false"]').count() == 1 and pg.evaluate("localStorage.getItem('opk.details.smal')") == '1',
          'bouwer breed: Details klapt open (tijden, aanwezige leiding); open of dicht onthouden op dit apparaat, los van de telefoon')
    # bewerkpaneel bij het laatste onderdeel (onderaan de tijdlijn): de bovenkant met titel en sluiten komt niet onder de kopbalk, het onderdeel blijft in beeld
    pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); w(300)
    pg.locator('.lanes .blk').last.locator('.t').click(); w(600)
    ED = """(() => { const h = document.querySelector('header.bar').getBoundingClientRect().bottom, x = document.querySelector('.side .closex').getBoundingClientRect(),
      t = document.getElementById('bf-title').getBoundingClientRect(), b = document.querySelector('.lanes .blk.sel').getBoundingClientRect();
      return [Math.round(h), Math.round(x.top), Math.round(t.top), Math.round(b.top), Math.round(b.bottom), innerHeight]; })()"""
    ed = pg.evaluate(ED)
    check(ed[1] >= ed[0] and ed[2] >= ed[0] and ed[3] >= ed[0] and ed[4] <= ed[5], f'bouwer breed: bewerkpaneel bij het laatste onderdeel staat onder de kopbalk, het onderdeel blijft in beeld ({ed})')
    shot('30c-bouwer-paneel-onderaan', False)
    pg.keyboard.press('Escape'); w(300)
    pg.locator('.lanes .blk').first.locator('.t').click(); w(600); ed = pg.evaluate(ED)
    check(ed[1] >= ed[0] and ed[3] >= ed[0] and ed[4] <= ed[5], f'bouwer breed: bewerkpaneel bij het eerste onderdeel ook goed in beeld ({ed})')
    pg.keyboard.press('Escape'); w(300)
    # --- eigen oefendata (los van de rest): kop, contrast, Activiteitengebieden, velden, lege dashboardkaart
    qc = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL')
    qc.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    q = qc.new_page(); q.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    q.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    q.goto(BASE + '/s/oefen/dashboard'); q.wait_for_timeout(1200)
    fsz = lambda sel: q.evaluate(f"parseFloat(getComputedStyle(document.querySelector('{sel}')).fontSize)")
    hs = [fsz('main h1'), fsz('.hero h2.hero-title')]
    check(hs[0] < hs[1], f'dashboard: paginakop kleiner dan de titel van de komende opkomst ({hs})')
    bl = q.evaluate("(() => { const e = document.querySelector('.catspread .barrow .bl'); if (!e) return null; const s = getComputedStyle(e); return [s.backgroundColor, s.fontWeight, s.paddingLeft]; })()")
    check(bl == ['rgba(0, 0, 0, 0)', '400', '0px'] and q.locator('.catspread .barrow .nm').count() == 0, f'dashboard: Activiteitengebieden met gewone labels, geen naam-pillen ({bl})')
    # categorie met een "kleur" die CSS meestuurt (oude data, een back-up of een kopie uit de groep): Activiteitengebieden laadt niets van buiten
    FILLS = "[...document.querySelectorAll('.catspread .barrow .fill')].map(e => [e.getAttribute('style') || '', getComputedStyle(e).backgroundImage, getComputedStyle(e).backgroundColor])"
    f0 = q.evaluate(FILLS)
    check(len(f0) > 1 and all('--c: #' in x[0] and 'background' not in x[0] and x[1] == 'none' for x in f0) and len(set(x[2] for x in f0)) > 1,
          f'dashboard: Activiteitengebieden krijgen hun kleur via --c (geen kleur als tekst in de stijl), elk gebied zijn eigen kleur ({f0[:2]})')
    pix = []
    q.on('request', lambda r: pix.append(r.url) if 'pixel-cat' in r.url else None)
    cats0 = q.evaluate("JSON.parse(localStorage.getItem('opk.oefen.v1'))['speltakken/oefen'].settings.categories")
    q.evaluate("""() => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k));
      s['speltakken/oefen'].settings.categories.forEach(c => c.color = 'red, red) url("/pixel-cat.png'); localStorage.setItem(k, JSON.stringify(s)); }""")
    q.reload(); q.wait_for_timeout(1200)
    f1 = q.evaluate(FILLS)
    check(len(f1) > 1 and not pix and all('url' not in x[0] and x[1] == 'none' for x in f1) and all(re.search(r'--c: #[0-9A-Fa-f]{6}', x[0]) for x in f1),
          f'dashboard: categorie met een kleur die CSS meestuurt → gewone kleur (#rrggbb), niets van buiten geladen ({pix}, {f1[:1]})')
    q.evaluate("c => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k)); s['speltakken/oefen'].settings.categories = c; localStorage.setItem(k, JSON.stringify(s)); }", cats0)
    q.reload(); q.wait_for_timeout(1000)
    sig = q.evaluate("[...document.querySelectorAll('.nextlist .pill.warn')].map(e => getComputedStyle(e).color)")
    lg = q.evaluate("[...document.querySelectorAll('.counts .legend-dot, .cal .cday.topic:not(.today)')].map(e => getComputedStyle(e).boxShadow.includes('inset'))")
    check(sig and all(c == 'rgb(138, 82, 0)' for c in sig) and len(lg) >= 6 and all(lg), f'contrast: waarschuwingstekst donker oranje, legenda en kalendervakjes met rand ({set(sig)}, {len(lg)})')
    q.goto(BASE + '/s/oefen/bouwer/opk-jungle'); q.wait_for_timeout(1200); open_meta(q)
    mt = q.evaluate("""(() => { const rows = {}; document.querySelectorAll('.meta > .field').forEach(f => { const c = f.querySelector('input, select'); if (!c) return;
      const k = Math.round(f.getBoundingClientRect().top); const r = c.getBoundingClientRect(); (rows[k] = rows[k] || []).push(Math.round(r.top) + '/' + Math.round(r.height)); }); return Object.values(rows); })()""")
    check(mt and all(len(set(r)) == 1 and r[0].endswith('/38') for r in mt), f'bouwer: velden in de details-rij even hoog en op één lijn ({mt})')
    q.goto(BASE + '/s/oefen/instellingen'); q.wait_for_timeout(1200)
    # een label dat over twee regels loopt: de keuzelijsten ernaast blijven op één lijn
    q.evaluate("document.querySelectorAll('.settings .two')[1].querySelector('.field label').textContent += ' met een heel lange uitleg erbij'"); q.wait_for_timeout(100)
    st = q.evaluate("[...document.querySelectorAll('.settings .two')[1].querySelectorAll('select')].map(s => Math.round(s.getBoundingClientRect().bottom) + '/' + Math.round(s.getBoundingClientRect().height))")
    lh = q.evaluate("document.querySelectorAll('.settings .two')[1].querySelector('.field label').getBoundingClientRect().height")
    check(len(st) == 2 and st[0] == st[1] and st[0].endswith('/38') and lh > 25, f'instellingen: velden naast elkaar op één lijn, ook met een label van twee regels ({st}, label {lh:.0f} px)')
    # instellingen in kolommen: kaarten sluiten aan (geen gaten onder een korte kaart), Team over de volle breedte,
    # leesvolgorde = volgorde op de pagina (per kolom van boven naar beneden); een kleurstip openen verschuift geen kaart naar een andere kolom
    q.reload(); q.wait_for_timeout(1000)
    LAY = """(() => { const s = document.querySelector('.settings').getBoundingClientRect();
      return { sw: s.width, cards: [...document.querySelectorAll('.settings > *')].map(e => { const r = e.getBoundingClientRect();
        return { h: e.querySelector('h2').textContent, l: Math.round(r.left), t: r.top, b: r.bottom, w: r.width }; }) }; })()"""
    lay = q.evaluate(LAY); team, rest = lay['cards'][0], lay['cards'][1:]
    order = sorted(rest, key=lambda c: (c['l'], c['t']))
    gaps = [round(y['t'] - x['b']) for x, y in zip(order, order[1:]) if x['l'] == y['l']]
    check(team['h'] == 'Team' and abs(team['w'] - lay['sw']) < 2 and len({c['l'] for c in rest}) == 3 and [c['h'] for c in order] == [c['h'] for c in rest] and gaps and max(gaps) <= 24,
          f'instellingen: kaarten sluiten aan in 3 kolommen, Team over de volle breedte, volgorde per kolom van boven naar beneden (tussenruimte {gaps})')
    q.locator('.catrow .sw.cur').first.click(); q.wait_for_timeout(200)
    check([c['l'] for c in q.evaluate(LAY)['cards']] == [c['l'] for c in lay['cards']] and q.locator('.catrow .swatches').count() == 1, 'instellingen: kleuren uitklappen houdt elke kaart in zijn kolom')
    q.screenshot(path=f'{OUT}/35-instellingen-kolommen.png', full_page=True)
    # telwaarden: een getal met een label, geen vakje dat op een invoerveld lijkt
    STATS = """sel => [...document.querySelectorAll(sel)].map(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(), bs = getComputedStyle(e, '::before');
      return { bg: s.backgroundColor, sh: s.boxShadow, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), f: getComputedStyle(e.querySelector('b')).fontFamily,
               sep: bs.content === 'none' ? null : r.left + parseFloat(bs.left) }; })"""
    q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(1000)
    js = q.evaluate(STATS, '.rangestats .stat')
    check(len(js) == 4 and all(x['bg'] == 'rgba(0, 0, 0, 0)' and x['sh'] == 'none' and 'Bricolage' in x['f'] for x in js) and len({x['t'] for x in js}) == 1
          and js[0]['sep'] is None and all(x['sep'] is not None for x in js[1:]),
          'jaarplanning: tellingen als grote getallen met een scheidingslijn, geen vakjes naast de datumvelden')
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(300)
    js = q.evaluate(STATS, '.rangestats .stat'); cb = q.locator('.rangebar').bounding_box()
    check(len({x['t'] for x in js}) == 1 and max(x['r'] for x in js) <= cb['x'] + cb['width'] - 16 and q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
          'jaarplanning mobiel: de vier tellingen op één regel, binnen de kaart')
    q.locator('.rangebar').scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/36-jaarplanning-tellingen-mobiel.png')
    # bouwer net boven telefoonbreedte: een kamp heeft meer tellingen dan op één regel past; elke regel begint links, zonder lijn ervoor
    q.set_viewport_size({'width': 920, 'height': 900}); q.goto(BASE + '/s/oefen/bouwer/opk-kamp'); q.wait_for_timeout(1200)
    bs = q.evaluate(STATS, '.summary .stat'); sm = q.locator('.summary').bounding_box()
    clip = q.evaluate("getComputedStyle(document.querySelector('.summary')).clipPath")
    m = re.search(r'inset\(\S+ \S+ \S+ ([\d.]+)px\)', clip); edge = sm['x'] + (float(m.group(1)) if m else 0)
    rows = sorted({x['t'] for x in bs}); firsts = [min((x for x in bs if x['t'] == t), key=lambda x: x['l']) for t in rows]
    check(len(rows) >= 2 and len({f['l'] for f in firsts}) == 1 and m is not None
          and all(f['sep'] is None or f['sep'] < edge for f in firsts) and all(x['sep'] > edge for x in bs if x not in firsts),
          f'bouwer: tellingen over twee regels: elke regel begint links, de scheidingslijn ervoor valt weg ({len(rows)} regels, {clip})')
    ul = q.evaluate("(() => { const s = document.querySelector('.summary button.stat > span'); return s ? getComputedStyle(s).textDecorationLine : ''; })()")
    check(ul == 'underline', 'bouwer: Aandachtspunten bij de tellingen is herkenbaar als knop (onderstreept)')
    q.locator('.summary').scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/37-bouwer-tellingen-kamp.png')
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    # tabblad- en thuisschermicoon: eigen tent-icoon (koper/marine), naam en kleur voor het thuisscherm
    ic = q.evaluate("""(async () => { const get = async sel => { const l = document.querySelector(sel); if (!l) return null;
        const r = await fetch(l.href); return { url: r.url, st: r.status, ct: r.headers.get('content-type') || '', tx: (r.headers.get('content-type') || '').includes('png') ? '' : await r.text() }; };
      const out = { icon: await get('link[rel=icon]'), apple: await get('link[rel=apple-touch-icon]'), man: await get('link[rel=manifest]') };
      if (out.man && out.man.st === 200) { const m = JSON.parse(out.man.tx); out.m = m;
        out.mi = await Promise.all((m.icons || []).map(async i => { const r = await fetch(new URL(i.src, out.man.url)); return r.status + ' ' + (r.headers.get('content-type') || ''); })); }
      return out; })()""")
    fav, ap, mf = ic.get('icon') or {}, ic.get('apple') or {}, ic.get('m') or {}
    check(fav.get('st') == 200 and 'svg' in fav.get('ct', '') and '#D98B3A' in fav.get('tx', '') and '#1E3A5F' in fav.get('tx', '')
          and ap.get('st') == 200 and 'image/png' in ap.get('ct', ''),
          'tabblad en thuisscherm: eigen tent-icoon (marine op koper), geen standaardicoon')
    check(mf.get('name') == 'Opkomstplanner' and mf.get('theme_color') == '#1E3A5F' and ic.get('mi') and all(x.startswith('200 image/') for x in ic['mi'])
          and 'AddType application/manifest+json .webmanifest' in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', '.htaccess'), encoding='utf-8').read(),
          f'thuisscherm: naam Opkomstplanner, kleur marine, iconen te laden; Apache kent het type .webmanifest ({ic.get("mi")})')
    # --- programma-status, kampen en pdf (eigen oefendata): alleen de vaste blokken is nog geen programma, een kamp toont de stand
    # van zijn programma, een kamp dat qua lengte niet bij de rij past geeft een melding, pdf-voettekst, kamp-pdf, eerste vrije moment
    q.goto(BASE + '/s/oefen/dashboard'); q.wait_for_timeout(800)
    q.evaluate("""(() => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k)), P = 'speltakken/oefen/';
      const sint = s[P + 'opkomsten/opk-sint'], j = s[P + 'opkomsten/opk-jungle'], kamp = s[P + 'opkomsten/opk-kamp'], one = j.blocks.find(b => !b.cat.startsWith('__'));
      s[P + 'opkomsten/opk-leeg'] = { ...sint, id: 'opk-leeg', state: 'planned', title: 'Lege opkomst', blocks: sint.blocks.filter(b => b.cat.startsWith('__')) };
      s[P + 'planning/pl-2'].opkId = 'opk-leeg'; s[P + 'planning/pl-2'].topic = 'Lege opkomst';
      s[P + 'planning/pl-kamp'].absent = ['Baloe'];
      s[P.slice(0, -1)].groupName = 'Scouting Sint-Jorisgroep Oosterhout-Noord';
      j.title = 'Grote Sinterklaasspeurtocht door het dorp met de hele groep';
      s[P + 'opkomsten/opk-dag'] = { ...kamp, id: 'opk-dag', state: 'draft', title: 'Dagtocht', days: [kamp.days[2]] };
      s[P + 'opkomsten/opk-vol'] = { ...j, id: 'opk-vol', state: 'draft', title: 'Volle opkomst', start: 840, end: 990,
        blocks: [{ ...one, id: 'vol-a', start: 840, dur: 150 }, { ...one, id: 'vol-x', title: 'Na afloop', start: 1080, dur: 30 }] };
      const p6 = s[P + 'planning/pl-6'], d = new Date(p6.date + 'T12:00:00'); d.setDate(d.getDate() + 1);
      p6.type = 'kamp'; p6.endDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      localStorage.setItem(k, JSON.stringify(s)); })()""")
    q.reload(); q.wait_for_timeout(1200)
    nt_of = lambda t: q.locator(f'.nextlist li:has-text("{t}") .nt').inner_text() if q.locator(f'.nextlist li:has-text("{t}")').count() else ''
    lt, kt = nt_of('Lege opkomst'), nt_of('Winterweekend')
    check('Nog leeg' in lt and 'Programma klaar' not in lt, f'dashboard Daarna: opkomst met alleen de vaste blokken is Nog leeg, niet Programma klaar ({lt!r})')
    check('Kamp' in kt and 'Aandachtspunten' in kt and 'Programma klaar' not in kt, f'dashboard Daarna: kamp met afwezige leiding ingedeeld toont Kamp en Aandachtspunten ({kt!r})')
    def cal_mark(name):
        for _ in range(3):
            c = q.locator(f'.cal button[aria-label*="{name}"]')
            if c.count(): return (c.first.get_attribute('class') or '').split(), c.first.get_attribute('aria-label') or ''
            q.click('.cal-head [aria-label="Volgende maand"]'); q.wait_for_timeout(150)
        return [], ''
    cc, cl = cal_mark('Lege opkomst')
    check('leeg' in cc and 'warn' not in cc and 'ok' not in cc and 'programma nog leeg' in cl and 'aandachtspunten' not in cl,
          f'agenda: opkomst met alleen de vaste blokken heet programma nog leeg (zoals de pil Nog leeg), niet klaar of aandachtspunten ({cl})')
    nl = q.locator('.counts li:has-text("Programma nog leeg")')
    check(nl.count() == 1 and int(nl.locator('b').inner_text()) >= 1 and nl.locator('.legend-dot.cday.leeg').count() == 1,
          'seizoen: opkomsten met een leeg programma apart geteld als Programma nog leeg')
    q.goto(BASE + '/s/oefen/dashboard'); q.wait_for_timeout(1000)
    q.locator('.nextlist').scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/38-dashboard-daarna-status.png')
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(300)
    check(q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'dashboard Daarna met Nog leeg en Kamp + Aandachtspunten mobiel: geen horizontale scroll')
    q.locator('.nextlist').scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/38b-dashboard-daarna-status-mobiel.png')
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    # pdf: lange groepsnaam en titel → de titel wordt ingekort, de datum in de voettekst blijft heel
    q.goto(BASE + '/s/oefen/bouwer/opk-jungle'); q.wait_for_timeout(1200)
    with q.expect_download() as dl: q.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/voettekst.pdf'); T = pdf_texts(f'{OUT}/voettekst.pdf')
    ft = sorted({t for x, y, t in T if abs(y - 25.51) < 1 and x < 60})
    check(len(ft) == 1 and ft[0].startswith('Scouting Sint-Jorisgroep Oosterhout-Noord  ·  Grote Sinterklaas') and 'hele groep' not in ft[0]
          and re.search(r'  ·  (maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) \d{1,2} (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) \d{4}$', ft[0]),
          f'pdf-voettekst: lange groep en titel, de titel wordt ingekort en de datum blijft heel ({ft})')
    # kamp-pdf: een dag die op de volgende pagina doorloopt krijgt daar een kop met de dagnaam; een kamp van één dag heet "1 dag"
    q.goto(BASE + '/s/oefen/bouwer/opk-kamp'); q.wait_for_timeout(1200)
    with q.expect_download() as dl: q.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/kamp-vervolg.pdf'); T = pdf_texts(f'{OUT}/kamp-vervolg.pdf')
    vv = [t for _, _, t in T if re.fullmatch(r'(Vrijdag|Zaterdag|Zondag) \d+ \w+ \\\(vervolg\\\)', t)]
    check(len(vv) >= 1, f'kamp-pdf: een dag die op een nieuwe pagina doorloopt krijgt daar de dagnaam met (vervolg) ({vv})')
    q.goto(BASE + '/s/oefen/bouwer/opk-dag'); q.wait_for_timeout(1200)
    with q.expect_download() as dl: q.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/kamp-1-dag.pdf'); T = pdf_texts(f'{OUT}/kamp-1-dag.pdf')
    check(any(t.startswith('1 dag  ·') for _, _, t in T) and not any('1 dagen' in t for _, _, t in T), 'kamp-pdf van één dag: "1 dag", niet "1 dagen"')
    # pdf van een bank-opkomst: de bank heeft nooit namen, dus geen regel "Verantwoordelijk: nog niemand ingevuld"; Minimaal leiding blijft
    check(any(t == 'VERANTWOORDELIJK' for _, _, t in pdf_texts(f'{OUT}/voettekst.pdf')), 'pdf van een ingeplande opkomst: regel Verantwoordelijk staat er')
    q.goto(BASE + '/s/oefen/bouwer/opk-bank-knopen'); q.wait_for_timeout(1200)
    with q.expect_download() as dl: q.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/bank.pdf'); T = pdf_texts(f'{OUT}/bank.pdf')
    check(not any('VERANTWOORDELIJK' in t or 'nog niemand ingevuld' in t for _, _, t in T) and sum(1 for _, _, t in T if t == 'MINIMAAL LEIDING') >= 2,
          'pdf van een bank-opkomst: geen regel Verantwoordelijk, wel Minimaal leiding')
    # eerste vrije moment: de opkomst is vol en er staat een onderdeel na het einde → geen moment na de eindtijd
    q.goto(BASE + '/s/oefen/bouwer/opk-vol'); q.wait_for_timeout(1200)
    q.click('.lib:has-text("Trefbal") button:has-text("Inplannen")'); q.wait_for_timeout(400)
    tt = q.locator('.toast').inner_text()
    check('Geen vrij moment lang genoeg' in tt and '16:30' not in tt, f'bouwer: opkomst vol met een onderdeel na het einde → geen vrij moment, niet in de nabespreking ({tt})')
    # kamp vr–zo inplannen op een rij za–zo: de lijst toont wat er echt ingepland wordt, met de lengte van de rij erbij, en een melding
    q.click('nav >> text=Opkomstbouwer'); q.wait_for_timeout(500); q.click('main .btn:has-text("Weekendkamp")'); q.wait_for_timeout(900)
    q.fill('#om-title', 'Testkamp'); q.wait_for_timeout(700)
    q.click('.plan-head >> text=Inplannen'); q.wait_for_timeout(400)
    pk = q.locator('.modal .pick:has-text("Pannenkoekenopkomst")'); pt = pk.locator('.info').inner_text()
    check(re.match(r'zaterdag \d+ (\w+ )?t/m maandag \d+', pt) and pk.locator('.err:has-text("Jaarplanning 2 dagen")').count() == 1,
          f'kamp inplannen op een rij za–zo: toont za t/m ma (wat er echt ingepland wordt) en dat de jaarplanning 2 dagen heeft ({pt!r})')
    q.screenshot(path=f'{OUT}/39-kamp-inplannen-past-niet.png')
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(300)
    pk.scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/39b-kamp-inplannen-past-niet-mobiel.png')
    check(q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'kamp inplannen mobiel: geen horizontale scroll')
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    pk.locator('text=Hier inplannen').click(); q.wait_for_timeout(500)
    tt = q.locator('.toast').inner_text()
    check('Het kamp heeft 3 dagen, de jaarplanning 2' in tt and 'Controleer de data' in tt, f'kamp op een rij met een andere lengte: melding bij het inplannen ({tt})')
    q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(1000)
    lp = q.locator('.prow:has(.plink:has-text("Lege opkomst")) .pill').all_inner_texts()
    check('Nog leeg' in lp, f'jaarplanning: opkomst met alleen de vaste blokken heeft de pil Nog leeg ({lp})')
    lh = q.locator('.prow .plink:has-text("Lege opkomst") .hint').inner_text()
    check('0 onderdelen' in lh, f'jaarplanning: de vaste blokken tellen niet als onderdelen ({lh!r})')
    # pdf van een programma met alleen de vaste blokken: eerst een onderdeel toevoegen, geen pdf met alleen openen en sluiten
    q.goto(BASE + '/s/oefen/bouwer/opk-leeg'); q.wait_for_timeout(1000)
    got = []; on_dl = lambda d: got.append(d); q.on('download', on_dl)
    q.click('button:has-text("PDF maken")'); q.wait_for_timeout(1200); q.remove_listener('download', on_dl)
    check(not got and 'Voeg eerst een onderdeel toe' in q.locator('.toast').inner_text(), 'pdf van een programma met alleen de vaste blokken: melding, geen lege pdf')
    q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(1000)
    q.locator('.prow:has(.plink:has-text("Testkamp")) .pdate').click(); q.wait_for_timeout(300)
    q.click('.modal >> text=Opslaan'); q.wait_for_timeout(400)
    tt = q.locator('.toast').inner_text()
    check('Het kamp heeft 3 dagen, de jaarplanning 2' in tt, f'datum van een kamp opslaan terwijl de lengte niet past: melding ({tt})')
    # in de bouwer staat het ook (contextbalk), met de knop om de rij gelijk te trekken met het kamp
    oget = lambda js: q.evaluate("(() => { const s = JSON.parse(localStorage.getItem('opk.oefen.v1')), P = 'speltakken/oefen/'; return " + js + "; })()")
    tk_row = lambda: oget("(() => { const o = Object.keys(s).find(k => k.startsWith(P + 'opkomsten/') && s[k].title === 'Testkamp'), id = o && o.split('/').pop(), r = Object.values(s).find(x => x && x.opkId === id && 'slot' in x); return r ? [r.date, r.endDate] : null; })()")
    q.locator('.prow .plink:has-text("Testkamp")').click(); q.wait_for_timeout(1000)
    mf = q.locator('.ctx .ctx-misfit')
    mt = mf.inner_text() if mf.count() else ''
    check('Het kamp heeft 3 dagen, de jaarplanning 2' in mt and mf.locator('button:has-text("Jaarplanning aanpassen")').count() == 1,
          f'bouwer: kamp dat niet bij de jaarplanning past → melding in de contextbalk met Jaarplanning aanpassen ({mt!r})')
    q.screenshot(path=f'{OUT}/45-kamp-past-niet-bouwer.png')
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(300)
    mf.scroll_into_view_if_needed(); q.screenshot(path=f'{OUT}/45b-kamp-past-niet-bouwer-mobiel.png')
    check(q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'melding kamp past niet in de bouwer mobiel: geen horizontale scroll')
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    r0 = tk_row(); mf.locator('button:has-text("Jaarplanning aanpassen")').click(); q.wait_for_timeout(700); r1 = tk_row()
    d0 = date.fromisoformat(r0[0])
    check(r1 == [r0[0], (d0 + timedelta(days=2)).isoformat()] and q.locator('.ctx .ctx-misfit').count() == 0 and 'Jaarplanning aangepast' in q.locator('.toast').inner_text(),
          f'Jaarplanning aanpassen: de rij loopt nu t/m de laatste kampdag, de melding is weg ({r0} → {r1})')
    q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(1000)
    # kamp-rij zonder eigen tijden: vertrek en terug volgen de soort (zoals een nieuw weekendkamp), niet de opkomsttijden
    q.click('.presets >> text=Komende 3 maanden'); q.wait_for_timeout(300)
    brow = q.locator('.prow:not(.head)').nth(q.evaluate("[...document.querySelectorAll('.prow:not(.head)')].findIndex(r => r.querySelector('.ptopic')?.value === 'Bosspel met de Scouts')"))
    md_times = lambda: [q.locator(f'.modal .field:has(> label:text-is("{l}")) {c}').input_value() for l in ('Begintijd / vertrek', 'Eindtijd / terug') for c in ('.tp-h', '.tp-m')]
    brow.locator('.pdate').click(); q.wait_for_timeout(300); kt0 = md_times()
    q.click('.modal .seg .chip:has-text("Kamp / weekend")'); q.wait_for_timeout(150); kt1 = md_times()
    q.click('.modal .seg .chip:text-is("Opkomst")'); q.wait_for_timeout(150); kt2 = md_times()
    q.click('.modal .chip:has-text("Weekend vr–zo")'); q.wait_for_timeout(150); kt3 = md_times()
    check(kt1 == ['19', '0', '15', '0'] and kt2 == kt0 and kt3 == kt1, f'datum en soort: Kamp / weekend stelt vertrek 19:00 en terug 15:00 voor, terug naar Opkomst weer de opkomsttijden ({kt0}, {kt1}, {kt2}, {kt3})')
    q.screenshot(path=f'{OUT}/43-kamp-tijden.png')
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(200)
    check(q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'datum en soort (kamp) mobiel: geen horizontale scroll'); q.screenshot(path=f'{OUT}/43b-kamp-tijden-mobiel.png')
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    q.click('.modal >> text=Opslaan'); q.wait_for_timeout(900)
    p7 = lambda: oget("[s[P + 'planning/pl-7'].type, s[P + 'planning/pl-7'].start, s[P + 'planning/pl-7'].end]")
    # de standaardtijden worden niet als eigen tijden opgeslagen: ze blijven de soort (en de standaard) volgen
    check(p7() == ['kamp', None, None] and 'kamp / weekend' in brow.locator('.pdate').inner_text(), f'kamp-rij opgeslagen zonder eigen tijden: volgt de kamptijden (de standaard is niet bevroren) ({p7()})')
    bidx = "[...document.querySelectorAll('.prow:not(.head)')].findIndex(r => r.querySelector('.ptopic')?.value === 'Bosspel met de Scouts')"
    brow_now = lambda: q.locator('.prow:not(.head)').nth(q.evaluate(bidx))
    # terug naar Opkomst op één dag: gewoon de opkomsttijden, geen foutmelding "eindtijd moet na de begintijd" (19:00–15:00)
    brow_now().locator('.pdate').click(); q.wait_for_timeout(300); kt4 = md_times()
    q.click('.modal .seg .chip:text-is("Opkomst")'); q.click('.modal .chip:text-is("Zaterdag")'); q.wait_for_timeout(150); kt5 = md_times()
    q.click('.modal >> text=Opslaan'); q.wait_for_timeout(500)
    check(kt4 == ['19', '0', '15', '0'] and kt5 == kt0 and q.locator('.modal').count() == 0 and 'eindtijd moet na' not in (q.locator('.toast').inner_text() if q.locator('.toast').count() else '')
          and p7() == ['opkomst', None, None], f'kamp-rij terug naar Opkomst op één dag: opkomsttijden, geen foutmelding ({kt4}, {kt5}, {p7()})')
    # oude rij met de standaardtijden opgeslagen (van vóór deze versie): Kamp / weekend stelt toch de kamptijden voor
    q.evaluate("(() => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k)), P = 'speltakken/oefen/', st = s[P.slice(0, -1)].settings || {};"
               " s[P + 'planning/pl-7'].start = st.defStart ?? 840; s[P + 'planning/pl-7'].end = st.defEnd ?? 990; localStorage.setItem(k, JSON.stringify(s)); })()")
    q.reload(); q.wait_for_timeout(1000); q.click('.presets >> text=Komende 3 maanden'); q.wait_for_timeout(300)
    brow_now().locator('.pdate').click(); q.wait_for_timeout(300)
    q.click('.modal .chip:has-text("Weekend vr–zo")'); q.wait_for_timeout(150); kt6 = md_times()
    q.click('.modal >> text=Opslaan'); q.wait_for_timeout(600)
    check(kt6 == ['19', '0', '15', '0'] and p7() == ['kamp', None, None], f'rij met opgeslagen standaardtijden → Kamp / weekend: vertrek 19:00, terug 15:00 ({kt6}, {p7()})')
    brow = brow_now()
    brow.locator('.btn:has-text("Koppelen")').click(); q.wait_for_timeout(300); q.click('.modal >> text=Weekendkamp'); q.wait_for_timeout(1200)
    kd = oget("(id => id && s[P + 'opkomsten/' + id] ? [s[P + 'opkomsten/' + id].days[0].start, s[P + 'opkomsten/' + id].days.at(-1).end, s[P + 'opkomsten/' + id].days.length] : null)(s[P + 'planning/pl-7'].opkId)")
    check(kd == [1140, 900, 3], f'koppelen → Weekendkamp: vrijdag vanaf 19:00 tot zondag 15:00, net als de rij ({kd})')
    # ingepland kamp in de bouwer: dag erbij → melding en de pdf telt de dagen vanaf de datum (kop en dagkoppen kloppen met elkaar);
    # Jaarplanning aanpassen trekt de rij gelijk. Eerste dag eraf → de rij begint op de nieuwe eerste dag (Ongedaan maken zet hem terug).
    q.goto(BASE + '/s/oefen/bouwer/opk-kamp'); q.wait_for_timeout(1200)
    kr = lambda: oget("[s[P + 'planning/pl-kamp'].date, s[P + 'planning/pl-kamp'].endDate]")
    k0 = kr(); kf = date.fromisoformat(k0[0]); iso = lambda n: (kf + timedelta(days=n)).isoformat()
    ktab = lambda i: q.locator('.daytab:not(.add)').nth(i).inner_text()
    mf = q.locator('.ctx .ctx-misfit'); mft = lambda: mf.inner_text() if mf.count() else ''
    check(k0 == [iso(0), iso(2)] and mf.count() == 0, f'kamp vr–zo op een rij vr–zo: geen melding ({k0})')
    q.click('.daytab.add'); q.wait_for_timeout(600)
    check('Het kamp heeft 4 dagen, de jaarplanning 3' in mft(), f'bouwer: dag toegevoegd aan een ingepland kamp → melding ({mft()!r})')
    with q.expect_download() as dl: q.click('button:has-text("PDF maken")')
    dl.value.save_as(f'{OUT}/kamp-dag-erbij.pdf'); T = [t for _, _, t in pdf_texts(f'{OUT}/kamp-dag-erbij.pdf')]
    mon = kf + timedelta(days=3)
    check(any(f't/m maandag {mon.day} ' in t for t in T) and not any('t/m zondag' in t for t in T) and any(t.startswith(f'Maandag {mon.day} ') for t in T),
          f'kamp-pdf met een dag erbij: kop en voettekst t/m maandag {mon.day}, net als de dagkoppen (niet t/m zondag)')
    mf.locator('button:has-text("Jaarplanning aanpassen")').click(); q.wait_for_timeout(700)
    check(kr() == [iso(0), iso(3)] and mf.count() == 0, f'Jaarplanning aanpassen: rij t/m maandag ({kr()})')
    q.locator('.daytab:not(.add)').nth(0).click(); q.wait_for_timeout(200)
    q.click('.dayacts >> text=Dag verwijderen'); q.wait_for_timeout(150); q.click('.dayacts >> text=Klik nogmaals: dag verwijderen'); q.wait_for_timeout(700)
    check('Het kamp heeft 3 dagen, de jaarplanning 4' in mft(), f'eerste dag weggehaald: melding, de dagen schuiven niet stil op ({mft()!r}, {ktab(0)!r})')
    mf.locator('button:has-text("Jaarplanning aanpassen")').click(); q.wait_for_timeout(700)
    sat = kf + timedelta(days=1)
    check(kr() == [iso(1), iso(3)] and ktab(0).startswith(f'Zaterdag {sat.day} ') and mf.count() == 0,
          f'Jaarplanning aanpassen na het weghalen van de vrijdag: de rij begint op zaterdag, het zaterdagprogramma heet weer zaterdag ({kr()}, {ktab(0)!r})')
    q.click('.toast button:has-text("Ongedaan maken")'); q.wait_for_timeout(600)
    check(kr() == [iso(0), iso(3)] and 'Het kamp heeft 3 dagen, de jaarplanning 4' in mft(), f'Ongedaan maken: de oude data van de rij terug ({kr()})')
    mf.locator('button:has-text("Jaarplanning aanpassen")').click(); q.wait_for_timeout(700)
    # taken per leiding: dag met datum ("za 14"), niet de eerste twee letters van de naam
    q.click('.side .tabs button:has-text("Controle")'); q.wait_for_timeout(300)
    wl = [x.strip() for x in q.locator('.who-list .what span').all_inner_texts() if x.strip()]
    check(wl and all(re.match(r'(ma|di|wo|do|vr|za|zo) \d{1,2} \d\d:\d\d–', x) for x in wl) and any(x.startswith(f'za {sat.day} ') for x in wl),
          f'bouwer, taken per leiding: kampdag met datum ({wl[:3]})')
    # dag kopiëren: de kopie van zaterdag heet zondag (de datum), de dagen erna schuiven mee; geen "Zaterdag (kopie)" op een zondag
    q.locator('.daytab:not(.add)').nth(0).click(); q.wait_for_timeout(200)
    q.click('.dayacts >> text=Dag kopiëren'); q.wait_for_timeout(600)
    tabs_k = [ktab(i).split('\n')[0] for i in range(q.locator('.daytab:not(.add)').count())]
    labels_k = oget("s[P + 'opkomsten/opk-kamp'].days.map(d => d.label)")
    check(tabs_k[1].startswith(f'Zondag {(sat + timedelta(days=1)).day} ') and not any('kopie' in t for t in tabs_k) and len(set(labels_k)) == len(labels_k) == 4
          and labels_k == ['Zaterdag', 'Zondag', 'Maandag', 'Dinsdag'], f'dag kopiëren in een kamp: de kopie krijgt de volgende weekdag ({tabs_k}, {labels_k})')
    q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(1000)
    q.evaluate("(() => { const k = 'opk.oefen.v1', s = JSON.parse(localStorage.getItem(k)); s['speltakken/oefen'].groupName = 'Scouting De Voorbeeldgroep'; localStorage.setItem(k, JSON.stringify(s)); })()")
    # nog niets ingevuld voor de komende data
    q.goto(BASE + '/s/oefen/dashboard'); q.wait_for_timeout(1000)
    drop = "pre => { const s = JSON.parse(localStorage.getItem('opk.oefen.v1')); Object.keys(s).forEach(k => { if (k.startsWith(pre)) delete s[k]; }); localStorage.setItem('opk.oefen.v1', JSON.stringify(s)); }"
    q.evaluate(drop, 'speltakken/oefen/planning/'); q.reload(); q.wait_for_timeout(1200)
    nt = q.locator('.hero h2.hero-title.none')
    check(nt.count() == 1 and nt.inner_text() == 'Onderwerp nog kiezen' and fsz('.hero h2.hero-title') <= 28 and q.locator('text=Nog geen onderwerp').count() == 0,
          'dashboard zonder onderwerp: kleine gedempte tekst Onderwerp nog kiezen, niet het grootste op de pagina')
    ne = q.locator('.nextempty')
    check(ne.count() == 1 and ne.inner_text().startswith('De komende 5 zaterdagen zijn nog leeg.') and q.locator('.nextlist').count() == 0 and q.locator('.catspread').count() == 0
          and (ne.locator('a:has-text("Naar jaarplanning")').get_attribute('href') or '').endswith('/jaarplanning'),
          'dashboard Daarna: alle komende data leeg → één regel met Naar jaarplanning; geen Activiteitengebieden met nullen')
    q.screenshot(path=f'{OUT}/33-dashboard-nog-leeg.png', full_page=True)
    q.set_viewport_size({'width': 390, 'height': 844}); q.wait_for_timeout(200)
    check(q.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'dashboard zonder onderwerp mobiel: geen horizontale scroll')
    q.screenshot(path=f'{OUT}/33b-dashboard-nog-leeg-mobiel.png', full_page=False)
    q.set_viewport_size({'width': 1360, 'height': 900}); q.wait_for_timeout(200)
    q.click('.hero-notopic button:has-text("Invullen")'); q.wait_for_timeout(200)
    q.fill('.hero input.inline-edit', 'Bosspel'); q.keyboard.press('Enter'); q.wait_for_timeout(600)
    check(q.locator('.hero h2.hero-title:not(.none)').inner_text() == 'Bosspel' and q.locator('.hero-notopic').count() == 0, 'dashboard: onderwerp invullen met de knop Invullen')
    # lege banken in de oefenomgeving (geen groep: geen tabbladen); eerst het opslaan van het onderwerp laten afronden
    q.wait_for_timeout(800); q.evaluate(drop, 'speltakken/oefen/activiteiten/'); q.evaluate(drop, 'speltakken/oefen/opkomsten/')
    q.goto(BASE + '/s/oefen/opkomsten'); q.wait_for_timeout(1200)
    check(q.locator('.toolbar').count() == 0 and q.locator('aside.side').count() == 0 and q.locator('main .btn:has-text("Nieuwe opkomst")').count() == 1
          and q.locator('h1').first.inner_text() == 'Opkomstenbank' and q.locator('.subline').inner_text() == 'Nog geen opkomsten', 'lege opkomstenbank (oefenen): uitleg met één knop')
    qc.close()
    # --- toegankelijkheid (eigen oefendata): vaste kopbalk, volgorde in de tijdlijn, Ctrl+Z, Leiding indelen met het toetsenbord, controle, contrast
    kc = b.new_context(viewport={'width': 390, 'height': 844}, locale='nl-NL')
    kc.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    k = kc.new_page(); k.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    k.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    kw = lambda ms=400: k.wait_for_timeout(ms)
    KACT = "(() => { const a = document.activeElement; return a ? (a.id || a.dataset.bid || a.className || a.tagName) : null; })()"
    # focus komt nooit (deels) onder de vaste kopbalk, ook niet als die op een telefoon twee regels hoog is: Shift+Tab van onder naar boven
    UNDER = """(() => { const a = document.activeElement, bar = document.querySelector('header.bar');
      if (!a || !bar || a === document.body || bar.contains(a) || a.classList.contains('skiplink')) return '';
      const r = a.getBoundingClientRect(), t = bar.getBoundingClientRect().bottom;
      return r.height && r.top < t - 1 ? (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 30) + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom) + '/' + Math.round(t) : ''; })()"""
    def tab_under(path, steps):
        k.goto(BASE + '/s/oefen/' + path); kw(1200)
        k.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); kw(200)
        k.evaluate("""(() => { const l = [...document.querySelectorAll('main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled]), main textarea, main [tabindex="0"]')].filter(e => e.getClientRects().length); l[l.length - 1].focus(); })()""")
        bad = []
        for _ in range(steps):
            k.keyboard.press('Shift+Tab'); u = k.evaluate(UNDER)
            if u: bad.append(u)
        return bad
    bad = tab_under('jaarplanning', 140)
    bh = k.evaluate("(() => { const b = document.querySelector('header.bar').getBoundingClientRect(); return [getComputedStyle(document.documentElement).getPropertyValue('--barh'), Math.ceil(b.height)]; })()")
    check(not bad and bh[1] > 90 and bh[0] == f'{bh[1]}px', f'jaarplanning mobiel: met Shift+Tab komt niets met focus onder de kopbalk van twee regels ({bh}; {bad[:3]})')
    k.set_viewport_size({'width': 1360, 'height': 900}); kw(300)
    bad = tab_under('bouwer/opk-jungle', 90)
    check(not bad and k.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--barh')") == '64px', f'bouwer breed: met Shift+Tab komt niets met focus onder de kopbalk ({bad[:3]})')
    # tijdlijn: onderdelen in de pagina op volgorde van tijd (Tab en schermlezer); de prullenbak zit niet in de Tab-volgorde
    when = lambda sel: k.eval_on_selector_all(sel, "els => els.map(e => e.textContent.slice(0, 5))")
    ktitles = lambda sel='.lanes .blk .t': k.eval_on_selector_all(sel, 'els => els.map(e => e.textContent)')
    ws = when('.lanes .blk .when')
    bd = k.evaluate("[...document.querySelectorAll('.lanes .bdel')].map(b => b.tabIndex + '|' + b.getAttribute('aria-hidden'))")
    check(len(ws) >= 5 and ws == sorted(ws) and bd and all(x == '-1|true' for x in bd), f'bouwer: onderdelen in de pagina op volgorde van tijd, prullenbak niet in de Tab-volgorde ({ws}, {set(bd)})')
    k.locator('.lanes .blk').first.focus(); k.keyboard.press('Tab')
    check(k.evaluate("[...document.querySelectorAll('.lanes .blk')].indexOf(document.activeElement)") == 1, 'bouwer: Tab van een onderdeel gaat naar het volgende onderdeel (niet naar een prullenbak)')
    # slepen naar later (voorbij Ranja drinken): de volgorde in de pagina volgt, en het onderdeel houdt de focus
    krow = k.evaluate("parseFloat(document.querySelector('.lanes').style.getPropertyValue('--row')) || 24")
    kl = k.locator('.lanes .blk:has-text("Knopen leren")'); kid = kl.get_attribute('data-bid'); kl.scroll_into_view_if_needed(); bb = kl.bounding_box()
    x, y = bb['x'] + 60, bb['y'] + 12
    t0 = ktitles(); k.mouse.move(x, y); k.mouse.down()
    for i in range(1, 11): k.mouse.move(x, y + 9 * krow * i / 10); kw(30)
    k.mouse.up(); kw(500)
    t1, ws = ktitles(), when('.lanes .blk .when')
    check(t0.index('Knopen leren') < t0.index('Ranja drinken') and t1.index('Knopen leren') > t1.index('Ranja drinken') and ws == sorted(ws) and k.evaluate(KACT) == kid,
          f'bouwer: na slepen voorbij een ander onderdeel klopt de volgorde weer en houdt het onderdeel de focus ({t1})')
    # controle: aandachtspunten (zoveel als de teller) en wat nog aangevuld kan worden apart; het niveau staat in de kop, niet alleen in de kleur
    k.click('.tabs >> text=Controle'); kw(300)
    cnt = int(k.locator('.summary button.stat b').inner_text())
    groups = k.evaluate("[...document.querySelectorAll('.side .issues')].map(u => [u.previousElementSibling.textContent, [...u.children].map(li => li.className)])")
    check(cnt >= 1 and len(groups) == 2 and groups[0][0] == 'Aandachtspunten' and groups[0][1] == ['warn'] * cnt and groups[1][0] == 'Nog aanvullen' and set(groups[1][1]) == {'info'},
          f'controle: {cnt} aandachtspunt(en) onder Aandachtspunten, de rest onder Nog aanvullen ({groups})')
    k.locator('.side').screenshot(path=f'{OUT}/34-controle-niveaus.png')
    # Ctrl+Z na Delete zet het onderdeel terug; in een tekstveld blijft Ctrl+Z van de browser (je tekst)
    n0 = k.locator('.lanes .blk').count()
    k.locator('.lanes .blk:has-text("Junglejacht")').focus(); k.keyboard.press('Delete'); kw(300)
    ub = k.locator('.toast.show button:has-text("Ongedaan maken")'); ks = ub.get_attribute('aria-keyshortcuts') if ub.count() else None
    k.locator('#om-title').focus(); k.keyboard.press('Control+z'); kw(300)
    in_text = k.locator('.lanes .blk').count() == n0 - 1 and ub.count() == 1
    k.locator('.lanes .blk').first.focus(); k.keyboard.press('Control+z'); kw(500)
    check(ks == 'Control+Z' and in_text and k.locator('.lanes .blk').count() == n0 and k.locator('.lanes .blk:has-text("Junglejacht")').count() == 1 and k.locator('.toast.show').count() == 0,
          'Ctrl+Z na Delete zet het onderdeel terug (niet vanuit een tekstveld)')
    # een melding van de pagina zet niets terug terwijl er een venster open staat; na het sluiten wel
    k.locator('.lanes .blk:has-text("Junglejacht")').focus(); k.keyboard.press('Delete'); kw(300)
    k.click('.ctx >> text=Leiding indelen'); kw(500); k.keyboard.press('Control+z'); kw(300)
    stays = k.locator('.modal .tk-tl .blk:has-text("Junglejacht")').count() == 0 and ub.count() == 1
    k.keyboard.press('Escape'); kw(300); k.keyboard.press('Control+z'); kw(500)
    check(stays and k.locator('.modal').count() == 0 and k.locator('.lanes .blk:has-text("Junglejacht")').count() == 1, 'Ctrl+Z: niet vanuit een ander venster, wel weer na het sluiten ervan')
    # Leiding indelen: elk onderdeel is een groep met een titelknop (geen knop in een knop), op volgorde van tijd
    k.click('.ctx >> text=Leiding indelen'); kw(500)
    grp = k.evaluate("[...document.querySelectorAll('.modal .tk-tl .blk')].map(b => [b.getAttribute('role'), b.hasAttribute('tabindex'), !!b.querySelector('button.tk-pick'), b.querySelector('.when').textContent.slice(0, 5)])")
    nested = k.evaluate("document.querySelectorAll('.modal [role=button] button, .modal button button').length")
    check(grp and all(g[0] == 'group' and not g[1] and g[2] for g in grp) and [g[3] for g in grp] == sorted(g[3] for g in grp) and nested == 0,
          f'leiding indelen: onderdelen zijn groepen met een titelknop, op volgorde van tijd, geen knop in een knop ({[g[3] for g in grp]})')
    tk_t = ktitles('.modal .tk-tl .blk .t'); nxt = tk_t[tk_t.index('Junglejacht') + 1]
    jp = k.locator('.modal .tk-tl .blk:has-text("Junglejacht") .tk-pick'); jp.focus(); k.keyboard.press('Enter'); kw(300)
    f1 = k.evaluate("(() => { const a = document.activeElement; return [!!a.closest('.tk-sel'), a.getAttribute('aria-label')]; })()"); ex = jp.get_attribute('aria-expanded')
    k.screenshot(path=f'{OUT}/35-indelen-toetsenbord.png')
    k.locator('.tk-sel button:has-text("Sluiten")').focus(); k.keyboard.press('Enter'); kw(300)
    f2 = k.evaluate("document.activeElement.classList.contains('tk-pick') && document.activeElement.textContent")
    check(f1 == [True, 'Begin uur'] and ex == 'true' and f2 == 'Junglejacht' and k.locator('.tk-sel').count() == 0,
          f'leiding indelen met het toetsenbord: Enter op een onderdeel zet de focus op Begin, Sluiten zet hem terug op het onderdeel ({f1}, {f2})')
    k.screenshot(path=f'{OUT}/35b-indelen-focus-terug.png')
    k.keyboard.press('Space'); kw(300)
    k.locator('.tk-sel button:has-text("Verwijderen")').focus(); k.keyboard.press('Enter'); kw(300)
    f3 = k.evaluate("document.activeElement.classList.contains('tk-pick') ? document.activeElement.textContent : document.activeElement.tagName")
    k.keyboard.press('Control+z'); kw(600)
    check(f3 == nxt and k.locator('.modal .tk-tl .blk:has-text("Junglejacht")').count() == 1, f'leiding indelen: na Verwijderen de focus op het volgende onderdeel ({f3}), Ctrl+Z in het venster zet het terug')
    k.locator('.modal .tk-tl .blk:has-text("Levend stratego") .when').click(); kw(300)
    check(k.locator('.modal .tk-tl .blk.sel:has-text("Levend stratego")').count() == 1 and not k.evaluate("!!document.activeElement.closest('.tk-sel')"),
          'leiding indelen: kiezen met de muis laat de focus staan (het beeld schuift niet weg van de namen)')
    k.keyboard.press('Escape'); kw(300)
    # dashboard: na Verstuurd verdwijnt de brief; de focus gaat naar de volgende brief of de kalender, niet kwijt
    k.goto(BASE + '/s/oefen/dashboard'); kw(1200)
    nts = k.locator('.notice').count()
    k.locator('.notice button:has-text("Verstuurd")').first.focus(); k.keyboard.press('Enter'); kw(400)
    fa = k.evaluate("(() => { const a = document.activeElement; return a.id || (a.closest('.notice') ? 'notice' : a.tagName); })()")
    k.keyboard.press('Control+z'); kw(500)
    check(nts >= 1 and fa == ('notice' if nts > 1 else 'dash-cal') and k.locator('.notice').count() == nts, f'dashboard: na Verstuurd blijft de focus in de buurt ({fa}), Ctrl+Z zet de brief terug')
    # contrast bij elk accent: alle tekst op de kaart van de komende opkomst (ook elke soort status) en Ingepland op de pagina ≥ 4,5:1
    LOW = """() => {
      const P = s => { let m = s.match(/rgba?\\(([^)]+)\\)/), f = 1; if (!m) { m = s.match(/color\\(srgb ([^)]+)\\)/); f = 255; } if (!m) return null;
        const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0] * f, p[1] * f, p[2] * f, p.length > 3 ? p[3] : 1]; };
      const over = (t, u) => [0, 1, 2].map(i => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
      const L = c => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
      const cr = (a, u) => (Math.max(L(a), L(u)) + .05) / (Math.min(L(a), L(u)) + .05);
      const hero = document.querySelector('.hero'), row = hero.querySelector('.hero-eyebrow'), out = [];
      for (const c of ['warn', 'good', 'neutral', 'acc']) { const s = document.createElement('span'); s.className = 'pill tmp-pill ' + c; s.textContent = 'Test ' + c; row.appendChild(s); }
      const tw = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
      for (let t; (t = tw.nextNode());) {
        const e = t.parentElement; if (!t.textContent.trim() || !e.getClientRects().length || e.closest('.hero-date, .btn.primary')) continue;
        let bg = P(getComputedStyle(hero).backgroundColor), op = 1; const chain = [];
        for (let n = e; n !== hero; n = n.parentElement) chain.unshift(n);
        for (const n of chain) { const s = getComputedStyle(n), c = P(s.backgroundColor); if (c && c[3]) bg = over(c, bg); op *= +s.opacity; }
        const s = getComputedStyle(e), c = P(s.color), r = cr(over([c[0], c[1], c[2], c[3] * op], bg), bg);
        if (r < (parseFloat(s.fontSize) >= 24 ? 3 : 4.5)) out.push(t.textContent.trim().slice(0, 20) + ' ' + r.toFixed(2));
      }
      const m = document.createElement('span'); m.className = 'pill acc tmp-pill'; m.textContent = 'Ingepland'; document.querySelector('main').appendChild(m);
      const ms = getComputedStyle(m), mr = cr(P(ms.color), P(ms.backgroundColor)); if (mr < 4.5) out.push('Ingepland (pagina) ' + mr.toFixed(2));
      document.querySelectorAll('.tmp-pill').forEach(x => x.remove());
      return out; }"""
    low = {}
    for acc in ['Marine', 'Groen', 'Blauw', 'Rood', 'Paars', 'Oranje', 'Grijs']:
        k.click('header.bar nav a[href$="/instellingen"]'); kw(500); k.click(f'.accents .acc:has-text("{acc}")'); kw(300)
        k.click('header.bar nav a[href$="/dashboard"]'); kw(600)
        r = k.evaluate(LOW)
        if r: low[acc] = r[:4]
        if acc == 'Oranje': k.screenshot(path=f'{OUT}/36b-dashboard-oranje.png')
    check(not low, f'contrast: tekst en status op de kaart van de komende opkomst en Ingepland ≥ 4,5:1 bij elk accent ({low})')
    kc.close()
    # --- toegankelijkheid (eigen oefendata): contrast licht en donker, groepen keuzeknoppen, namen van herhaalde knoppen, koppen, bevestigen met twee klikken
    ac = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL', color_scheme='dark')
    ac.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    a = ac.new_page(); a.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    a.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    aw = lambda ms=400: a.wait_for_timeout(ms)
    # donker (volgt het systeem) en licht: melding op het dashboard, kop eronder, categorielabels, voorbeeldtekst in velden ≥ 4,5:1
    for scheme in ('dark', 'light'):
        a.emulate_media(color_scheme=scheme); low, seen = [], {}
        a.goto(BASE + '/s/oefen/dashboard'); aw(1200)
        for sels, glow in ((['.notice .ntext span', '.notice .btn.ghost'], False), (['main .subline'], True)):
            n, o = a.evaluate(LOWC, [sels, glow]); seen[sels[0]] = n; low += o
        if scheme == 'dark': a.screenshot(path=f'{OUT}/37-donker-dashboard.png')
        for path in ('bouwer', 'opkomsten'):
            a.goto(BASE + '/s/oefen/' + path); aw(1000); n, o = a.evaluate(LOWC, [['.ocat'], False]); seen[path] = n; low += o
        a.goto(BASE + '/s/oefen/instellingen'); aw(1000)
        n, o = a.evaluate(LOWC, [['input:placeholder-shown::placeholder'], False]); seen['placeholder'] = n; low += o
        ph = a.evaluate("getComputedStyle(document.querySelector('input:placeholder-shown'), '::placeholder').opacity")
        check(all(seen.values()) and not low and ph == '1', f'contrast {scheme}: melding, kop, categorielabels en voorbeeldtekst in velden ≥ 4,5:1 ({seen}; {low[:4]})')
    a.emulate_media(color_scheme='light')
    # keuzeknoppen zitten in een groep met een naam (schermlezer: "Categorieën van de opkomst, groep" in plaats van een losse knop)
    nogrp = {}
    a.goto(BASE + '/s/oefen/bouwer/opk-jungle'); aw(1200); open_meta(a)
    a.locator('.lanes .blk:has-text("Junglejacht") .t').click(); aw(400); nogrp['bouwer'] = a.evaluate(CHIPGRP); a.keyboard.press('Escape'); aw(300)
    a.click('.ctx >> text=Leiding indelen'); aw(500); a.locator('.modal .tk-tl .blk:has-text("Junglejacht") .tk-pick').click(); aw(300)
    nogrp['leiding indelen'] = a.evaluate(CHIPGRP); n_chips = a.evaluate("document.querySelectorAll('.modal .chip').length"); a.keyboard.press('Escape'); aw(300)
    a.goto(BASE + '/s/oefen/jaarplanning'); aw(1200); nogrp['jaarplanning'] = a.evaluate(CHIPGRP)
    a.locator('.prow .f-plan .addbtn').first.click(); aw(300); nogrp['planning door'] = a.evaluate(CHIPGRP); a.keyboard.press('Escape'); aw(300)
    for path in ('instellingen', 'activiteiten', 'opkomsten'):
        a.goto(BASE + '/s/oefen/' + path); aw(1000); nogrp[path] = a.evaluate(CHIPGRP)
        if path == 'instellingen': n_acc = a.locator('.field[role=group]:has(> label:text-is("Kleur")) .acc').count()
    bad = {k: v for k, v in nogrp.items() if v}
    check(not bad and n_chips > 3 and n_acc == 7, f'keuzeknoppen: elke groep heeft een naam (bouwer, leiding indelen, jaarplanning, instellingen, banken) ({bad}, {n_chips}, {n_acc})')
    # herhaalde knoppen hebben een eigen naam: datum of titel erbij (in de lijst van een schermlezer niet 30× "Planning door aanpassen")
    a.goto(BASE + '/s/oefen/jaarplanning'); aw(1200); a.click('.presets >> text=Dit seizoen'); aw(400)
    NM = "sel => [...document.querySelectorAll(sel)].map(b => b.getAttribute('aria-label') || b.textContent.trim())"
    jn = {k: a.evaluate(NM, sel) for k, sel in (('plan', '.f-plan .addbtn'), ('abs', '.f-abs .addbtn'), ('brief', '.brief'), ('indelen', '.f-opk [aria-label^="Leiding indelen"]'), ('los', '.f-opk .iconbtn.danger'), ('koppelen', '.f-opk .btn.sm'))}
    uniq = all(len(v) > 1 and len(set(v)) == len(v) for v in jn.values())
    bvis = a.evaluate("[...document.querySelectorAll('.brief')].every(b => b.getAttribute('aria-label').endsWith(b.textContent.trim()))")
    check(uniq and bvis and re.fullmatch(r'Planning door \w+ \d+ \w+ aanpassen', jn['plan'][0]) is not None and all(x.startswith('Opkomst ') and x.endswith(' ontkoppelen') for x in jn['los']),
          f'jaarplanning: herhaalde knoppen met de datum in de naam, brief met de zichtbare tekst erin ({ {k: v[:2] for k, v in jn.items()} })')
    a.goto(BASE + '/s/oefen/bouwer'); aw(1000)
    pk = a.evaluate("[...document.querySelectorAll('.picklist .pick > .btn, .picklist .pick > .row > .btn.primary')].map(b => b.getAttribute('aria-label'))")
    # ook Maken en Koppelen bij de datums nog zonder programma noemen het onderwerp
    check(len([x for x in pk if x and x.startswith('Openen: ')]) > 2 and all(x and re.fullmatch(r'(Openen|Programma maken|Koppelen|Gebruiken): .+', x) for x in pk),
          f'opkomstbouwer: elke knop Openen (en Maken, Koppelen) heeft de titel in de naam ({pk[:3]}, {[x for x in pk if not x.startswith("Openen")][:2]})')
    a.goto(BASE + '/s/oefen/instellingen'); aw(1000)
    a.locator('.catrow .sw.cur').first.click(); aw(200)
    swn = a.evaluate("[...document.querySelectorAll('.swatches .sw')].map(b => b.getAttribute('aria-label'))")
    rb = a.locator('.member button[aria-expanded]').first; rl0, re0 = rb.get_attribute('aria-label'), rb.get_attribute('aria-expanded'); rb.click(); aw(200)
    check(len(swn) == 13 and len(set(swn)) == 13 and not any('#' in x for x in swn) and rl0.startswith('Rechten van ') and re0 == 'false' and rb.get_attribute('aria-expanded') == 'true',
          f'instellingen: kleuren hebben een naam (geen hexcode), Rechten zegt van wie en of hij open is ({swn[:3]}, {rl0})')
    # koppen: maanden in de jaarplanning zijn koppen (springen per maand), banken slaan geen niveau over
    a.goto(BASE + '/s/oefen/jaarplanning'); aw(1000)
    LV = "[...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter(h => h.getClientRects().length).map(h => +h.tagName[1])"
    lv = {'jaarplanning': a.evaluate(LV)}
    months = a.locator('main h2.pmonth').count()
    for path in ('activiteiten', 'opkomsten'):
        a.goto(BASE + '/s/oefen/' + path); aw(1000); lv[path] = a.evaluate(LV)
    jumps = {k: v for k, v in lv.items() if not v or v[0] != 1 or any(y - x > 1 for x, y in zip(v, v[1:]))}
    check(months >= 2 and a.locator('aside h2:text-is("Opkomst uit de bank")').count() == 1 and not jumps, f'koppen: {months} maanden als kop in de jaarplanning, geen niveau overgeslagen ({jumps})')
    # bevestigen met twee klikken: blijft staan zolang de focus erop staat (toetsenbord, schermlezer) of de muis erop, en wordt voorgelezen
    a.goto(BASE + '/s/oefen/instellingen'); aw(1000)
    n_cat = a.locator('.catrow').count(); cb = a.locator('.catrow .iconbtn.danger').first
    cb.focus(); a.keyboard.press('Enter'); aw(3400)
    kb_hold = cb.get_attribute('data-armed') is not None and (a.locator('#sr-live').text_content() or '').startswith('Zeker?')
    a.keyboard.press('Shift+Tab'); aw(3400); kb_off = cb.get_attribute('data-armed') is None
    cb.hover(); cb.click(); aw(3400); ms_hold = cb.get_attribute('data-armed') is not None
    a.mouse.move(5, 300); aw(3400); ms_off = cb.get_attribute('data-armed') is None
    check([kb_hold, kb_off, ms_hold, ms_off] == [True] * 4 and a.locator('.catrow').count() == n_cat,
          f'twee keer klikken: de vraag blijft staan met focus of muis erop (en wordt voorgelezen), verdwijnt 3 s daarna; niets verwijderd ({[kb_hold, kb_off, ms_hold, ms_off]})')
    ac.close()
    # aanraakscherm: grotere naamknoppen, geen prullenbak op een blokje van 5 minuten, groter raakvlak op het dashboard
    tc = b.new_context(viewport={'width': 390, 'height': 844}, locale='nl-NL', has_touch=True, is_mobile=True)
    tc.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    tq = tc.new_page(); tq.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    tq.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    tq.goto(BASE + '/s/oefen/bouwer/opk-jungle'); tq.wait_for_timeout(1200)
    # prullenbak alleen op het gekozen onderdeel: een tik rechtsboven op een ander onderdeel kiest dat onderdeel en verwijdert niets
    # met een toetsenbord (bijv. een iPad) of schermlezer: niets in de Tab-volgorde is onzichtbaar, ook de verborgen prullenbak niet
    inv = tq.evaluate("""(() => { const op = e => { let o = 1; for (let n = e; n; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
      return [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]')]
        .filter(e => e.tabIndex >= 0 && e.getClientRects().length && !e.closest('[inert]') && op(e) < .05).map(e => e.className + ':' + (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)); })()""")
    tq.locator('.lanes .blk[aria-label^="Junglejacht"]').focus(); tq.keyboard.press('Tab')
    tb = tq.evaluate("document.activeElement.className")
    check(not inv and 'bdel' not in tb and 'blk' in tb, f'aanraakscherm: niets in de Tab-volgorde is onzichtbaar; Tab van een onderdeel gaat naar het volgende, niet naar een verborgen prullenbak ({inv[:3]}, {tb})')
    bd = tq.evaluate("[...document.querySelectorAll('.lanes .blk:not(.sel) .bdel')].map(b => getComputedStyle(b).opacity + '|' + getComputedStyle(b).pointerEvents)")
    n_blk = tq.locator('.lanes .blk').count()
    tq.evaluate("document.querySelector('.lanes .blk[aria-label^=\"Levend stratego\"]').scrollIntoView({ block: 'center' })"); tq.wait_for_timeout(200)
    lb = tq.locator('.lanes .blk[aria-label^="Levend stratego"] .bdel').bounding_box()
    tq.touchscreen.tap(lb['x'] + lb['width'] / 2, lb['y'] + lb['height'] / 2); tq.wait_for_timeout(500)
    sel_bd = tq.evaluate("(() => { const b = document.querySelector('.lanes .blk.sel .bdel'); return b ? getComputedStyle(b).opacity + '|' + getComputedStyle(b).pointerEvents : ''; })()")
    check(len(bd) > 3 and all(x == '0|none' for x in bd) and tq.locator('.lanes .blk').count() == n_blk and tq.locator('.lanes .blk.sel[aria-label^="Levend stratego"]').count() == 1 and sel_bd == '1|auto',
          f'aanraakscherm: prullenbak alleen op het gekozen onderdeel; een tik rechtsboven verwijdert niets ongezien ({sel_bd})')
    tq.screenshot(path=f'{OUT}/32-bouwer-aanraken-gekozen.png')
    tq.keyboard.press('Escape'); tq.wait_for_timeout(300)
    tq.click('.ctx >> text=Leiding indelen'); tq.wait_for_timeout(500)
    nm_h = tq.evaluate("Math.min(...[...document.querySelectorAll('.modal .tk-names .nm')].map(e => e.getBoundingClientRect().height).filter(h => h > 0))")
    check(tq.evaluate("matchMedia('(pointer: coarse)').matches") and nm_h >= 28, f'aanraakscherm: naamknoppen bij Leiding indelen minstens 28 px hoog ({nm_h:.0f})')
    tq.locator('.modal .tk-tl .blk:has(.t:text-is("Openen"))').tap(); tq.wait_for_timeout(300)
    check(tq.locator('.modal .tk-tl .blk.sel.tiny').count() == 1 and not tq.locator('.modal .tk-tl .blk.sel .bdel').is_visible() and tq.locator('.tk-sel button:has-text("Verwijderen")').is_visible(),
          'aanraakscherm: geen prullenbak op een blokje van 5 minuten, wel Verwijderen eronder')
    tq.screenshot(path=f'{OUT}/27-indelen-aanraken.png')
    # kort onderdeel (Ranja drinken, 15 min): niet alle namen passen in het blokje; het paneel eronder komt in beeld met alle aanwezige leiding
    rj = tq.locator('.modal .tk-tl .blk:has(.t:text-is("Ranja drinken"))')
    rj.tap(); tq.wait_for_timeout(800)
    panel = tq.locator('.modal .tk-sel')
    pnames = panel.locator('.tk-who .chip').all_inner_texts(); pb = panel.bounding_box()
    clipped = tq.evaluate("""(() => { const b = [...document.querySelectorAll('.modal .tk-tl .blk')].find(x => x.querySelector('.t')?.textContent === 'Ranja drinken'), c = b.querySelector('.c2').getBoundingClientRect();
      return [...b.querySelectorAll('.tk-names .nm')].filter(n => n.getBoundingClientRect().bottom > c.bottom + 1).map(n => n.textContent); })()""")
    check(pnames == ['Akela', 'Baloe', 'Bagheera', 'Kaa', 'Raksha'] and pb and 0 <= pb['y'] < 844 - 40, f'aanraakscherm: kort onderdeel gekozen → paneel in beeld met alle aanwezige leiding ({pnames}; in het blokje afgekapt: {clipped})')
    panel.locator('.chip:text-is("Raksha")').tap(); tq.wait_for_timeout(500)
    check(panel.locator('.chip:text-is("Raksha")').get_attribute('aria-pressed') == 'true' and rj.locator('.nm.on:text-is("Raksha")').count() == 1,
          'aanraakscherm: laatste naam via het paneel ingedeeld (ook in de tijdlijn aan)')
    tq.screenshot(path=f'{OUT}/27b-indelen-paneel-aanraken.png')
    panel.locator('.chip:text-is("Raksha")').tap(); tq.wait_for_timeout(300)
    check(rj.locator('.nm.on:text-is("Raksha")').count() == 0, 'aanraakscherm: naam via het paneel weer weggehaald')
    tq.goto(BASE + '/s/oefen/dashboard'); tq.wait_for_timeout(1200)
    fh = tq.evaluate("[...document.querySelectorAll('.hero .facts > [data-editable]')].map(e => e.getBoundingClientRect().height)")
    check(len(fh) == 2 and min(fh) >= 30, f'aanraakscherm: tijden en locatie op het dashboard groter raakvlak ({fh})')
    # onderwerp typen in een lege zaterdag op de telefoon: de eerste letter maakt de rij aan; het veld (en het toetsenbord) blijft
    tq.goto(BASE + '/s/oefen/jaarplanning'); tq.wait_for_timeout(1200)
    # kleine knoppen in de rij (Leiding indelen, Ontkoppelen, Planning door, Afwezig, brief): net erboven tikken raakt de knop nog;
    # een tik op een knop ernaast raakt nooit de verkeerde, en de rijen blijven even hoog
    hit = tq.evaluate("""(() => { const bad = [], small = [...document.querySelectorAll('.prow .iconbtn, .prow .addbtn, .prow .brief')].filter(e => e.getClientRects().length);
      for (const row of document.querySelectorAll('.prow:not(.head)')) { row.scrollIntoView({ block: 'center' });
        for (const e of row.querySelectorAll('button, input')) { const r = e.getBoundingClientRect(); if (!r.width) continue;
          for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + 1], [r.left + r.width / 2, r.bottom - 1]]) {
            const h = document.elementFromPoint(x, y), hb = h && h.closest('button, input'); if (hb && hb !== e) bad.push((e.getAttribute('aria-label') || e.className) + ' → ' + (hb.getAttribute('aria-label') || hb.className)); } } }
      const big = small.filter(e => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top - 2); return !!h && (h === e || e.contains(h)); });
      return [small.length, big.length, bad.slice(0, 4)]; })()""")
    check(hit[0] > 10 and hit[1] == hit[0] and not hit[2] and tq.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'aanraakscherm: kleine knoppen in de jaarplanning hebben een groter raakvlak, zonder de buren te raken ({hit})')
    tq.locator('.prow[id^="r-s-"] .ptopic').first.tap(); tq.keyboard.type('Pionieren', delay=40); tq.wait_for_timeout(700)
    ft = tq.evaluate("(() => { const a = document.activeElement; return [!!a && a.classList.contains('ptopic'), a && a.value]; })()")
    check(ft == [True, 'Pionieren'], f'aanraakscherm: onderwerp typen in een lege zaterdag houdt het hele woord en de focus ({ft})')
    tc.close()

    # --- seizoen rond de zomerpauze (klok verzet) en een datum in de pauze openen
    def at_time(day):
        c = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL')
        c.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
        q = c.new_page(); q.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        q.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        q.clock.set_fixed_time(day + 'T12:00:00'); return c, q
    for day, want in (('2026-07-31', '2025–2026'), ('2026-08-01', '2026–2027'), ('2026-09-01', '2026–2027')):
        c, q = at_time(day); q.goto(BASE + '/s/oefen/dashboard'); q.wait_for_timeout(1200)
        check(q.locator(f'h3:text-is("Seizoen {want}")').count() == 1, f'dashboard op {day}: seizoen {want}')
        if day == '2026-09-01':
            q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(800); q.click('.presets >> text=Dit seizoen'); q.wait_for_timeout(300)
            ds = q.locator('.pdate b').all_inner_texts()
            check(any(' mrt' in x for x in ds) and not any(' maa' in x for x in ds), 'maart afgekort als mrt, niet maa')
        if day == '2026-08-01':
            q.goto(BASE + '/s/oefen/jaarplanning'); q.wait_for_timeout(800); q.click('.presets >> text=Dit seizoen'); q.wait_for_timeout(300)
            check(q.locator('h1:text-is("Jaarplanning")').count() == 1 and q.locator('.subline:has-text("Seizoen 2026–2027")').count() == 1, 'jaarplanning in augustus: Dit seizoen is het komende seizoen (kop Jaarplanning, seizoen eronder)')
            q.goto(BASE + '/s/oefen/jaarplanning?focus=s:2026-08-08'); q.wait_for_timeout(1200)
            check(q.locator('.rangebar .field:has(label:text-is("Van")) input').input_value() == '09-07-2026', 'datum in de zomerpauze openen: bereik eromheen, geen eindeloze lus')
        c.close()

    # --- opslag geblokkeerd (bijv. "alle cookies blokkeren"): de app werkt, alleen de laatste speltak wordt niet onthouden
    bc = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL')
    bc.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    # de nep-Firebase (fake.*) houdt zijn opslag, de rest gooit een SecurityError
    bc.add_init_script("""(() => { for (const m of ['getItem', 'setItem', 'removeItem']) { const f = Storage.prototype[m];
      Storage.prototype[m] = function (k, ...a) { if (String(k).startsWith('fake.')) return f.call(this, k, ...a); throw new DOMException('Opslag geblokkeerd', 'SecurityError'); }; } })()""")
    bq = bc.new_page(); bq.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    bq.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    bq.goto(BASE + '/inloggen'); bq.wait_for_timeout(600)
    bq.fill('input[type=email]', 'vluiten2907@gmail.com'); bq.fill('input[type=password]', 'demo123'); bq.click('.btn.primary'); bq.wait_for_timeout(1500)
    check('/beheer' in bq.url and bq.locator('.crash').count() == 0 and bq.locator('h2:has-text("Beheer (totaal)")').count() == 1, 'opslag geblokkeerd: inloggen werkt, geen foutscherm')
    bq.evaluate("""() => window.__fakeRemote('speltakken/sblok', { name: 'Blok', groupName: '', createdBy: 'uroot', settings: {}, tlIds: ['uroot'], memberIds: ['uroot'],
      members: { uroot: { name: 'Beheer (demo)', email: 'vluiten2907@gmail.com', role: 'teamleider', perms: { plan: true, build: true, bank: true, settings: true }, since: 1 } } })""")
    bq.goto(BASE + '/s/sblok/dashboard'); bq.wait_for_timeout(1500)
    check(bq.locator('.crash').count() == 0 and bq.locator('header.bar nav a').count() == 6, 'opslag geblokkeerd: speltak openen werkt (laatste speltak onthouden mislukt stil)')
    bq.goto(BASE + '/'); bq.wait_for_timeout(1200)
    check(bq.locator('.crash').count() == 0 and '/beheer' in bq.url, 'opslag geblokkeerd: startpagina gaat naar Beheer, geen foutscherm')
    bc.close()
    b.close()

check(not errors, 'geen fouten in de console' + ('' if not errors else ': ' + '; '.join(errors[:5])))
print(f'\n{len(failures)} mislukt' if failures else '\nAlles geslaagd')
sys.exit(1 if failures else 0)
