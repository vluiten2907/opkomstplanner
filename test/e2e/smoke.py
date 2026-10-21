"""
Rooktest van de hele app tegen de demo-build (nep-Firebase), zonder internet.
Start via:  bash test/e2e/run.sh
Faalt (exit 1) bij een mislukte controle of een fout in de console.
Screenshots komen in test/e2e/out/ (niet in git).
"""
import os, re, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://localhost:4173')
OUT = os.environ.get('E2E_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
os.makedirs(OUT, exist_ok=True)
errors, failures = [], []

def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg)
    if not cond: failures.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1360, 'height': 900}, locale='nl-NL', accept_downloads=True)
    ctx.route('**/*', lambda r: r.continue_() if 'localhost' in r.request.url else r.abort())
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    w = lambda ms=400: pg.wait_for_timeout(ms)
    shot = lambda n, full=True: pg.screenshot(path=f'{OUT}/{n}.png', full_page=full)

    def register(name, email):
        pg.fill('input:not([type=email]):not([type=password])', name); pg.fill('input[type=email]', email); pg.fill('input[type=password]', 'geheim123')
        pg.click('.btn.primary'); w(800)

    def add_block(y, title, dur='15', loc='', who=None):
        pg.locator('.lanes').click(position={'x': 100, 'y': y}); w()
        pg.fill('#bf-title', title); pg.select_option('#bf-dur', dur)
        if loc: pg.fill('#bf-loc', loc)
        if who: pg.click(f'.side .chip:has-text("{who}")')
        w(600); pg.click('.side .closex'); w(200)

    # --- account en speltak
    pg.goto(BASE + '/registreren'); w(); register('Vincent Test', 'vincent@test.nl')
    check('/speltakken' in pg.url, 'registreren → speltakken')
    pg.click('text=Nieuwe speltak als teamleider'); w(); pg.fill('#n-group', 'Testgroep'); pg.fill('#n-name', 'Scouts')
    pg.click('text=Speltak aanmaken'); w(1000)
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'speltak aanmaken → dashboard'); shot('01-dashboard')

    # --- team en instellingen
    pg.click('nav >> text=Team & instellingen'); w()
    pg.fill('input[type=email]', 'anna@test.nl'); pg.click('text=Uitnodigingslink maken'); w(600)
    link = pg.locator('.mono-code').inner_text()
    check('/uitnodiging/' in link, 'uitnodigingslink gemaakt')
    for n in ['Bram', 'Carla']:
        pg.fill('input[placeholder="Naam"]', n); pg.locator('input[placeholder="Naam"]').press('Enter'); w(300)
    shot('02-instellingen')

    # --- jaarplanning
    pg.click('nav >> text=Jaarplanning'); w(600)
    rows = pg.locator('.prow:not(.head)'); check(rows.count() > 20, 'jaarplanning toont opkomstdagen')
    first = rows.nth(1)
    first.locator('.ptopic').fill('Pionieren'); w(700)
    first.locator('.addbtn').first.click(); w(300); pg.click('.modal .chip:has-text("Vincent Test")'); pg.click('.modal >> text=Klaar'); w(300)
    first.locator('.addbtn').nth(1).click(); w(300); pg.click('.modal .chip:has-text("Bram")'); pg.click('.modal >> text=Klaar'); w(300)
    first.locator('.brief').click(); w(300); pg.locator('.modal input[type=checkbox]').first.check(); pg.click('.modal >> text=Opslaan'); w(300)
    first.locator('.btn:has-text("Koppelen")').click(); w(300); pg.click('.modal >> text=Nieuwe opkomst'); w(800)
    check('/bouwer/' in pg.url, 'koppelen → nieuwe opkomst in bouwer')

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
    aanwezig = lambda: int(pg.locator('.summary .stat:has-text("Leiding aanwezig") b').inner_text())
    voor = aanwezig()
    pg.locator('.blk:has-text("Kompasposten")').first.click(); w(300)
    pg.fill('.side input[placeholder^="Andere namen"]', 'Henk'); pg.locator('.side input[placeholder^="Andere namen"]').blur(); w(600); pg.click('.side .closex'); w(200)
    check(aanwezig() == voor + 1 and pg.locator('.present .chip:has-text("Henk")').count() == 1, 'met de hand ingedeelde leiding telt mee als aanwezig')
    shot('03-bouwer')

    # --- leiding indelen (tijdlijn naast elkaar)
    pg.click('text=Leiding indelen'); w(500)
    check(pg.locator('.modal .tk-tl .blk').count() >= 2, 'indeelvenster toont tijdlijn')
    check(pg.locator('.modal .tk-head >> text=Opkomst titel').count() == 1, 'indeelvenster heeft veld Opkomst titel')
    pg.select_option('.modal select >> nth=0', 'Vincent Test'); w(200)
    pg.locator('.modal .blk:has-text("Kompasposten") .tk-names button:has-text("Vincent Test")').first.click(); w(200)
    shot('04-indelen', False)
    pg.click('.modal >> text=Klaar'); w(300)

    # --- pdf
    with pg.expect_download() as dl: pg.click('text=PDF maken')
    check(dl.value.suggested_filename.endswith('.pdf'), 'pdf gedownload')

    # --- inplannen vanuit bouwer houdt namen, bank verwijdert ze
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Nieuwe opkomst'); w(700); pg.fill('#om-title', 'Sluipspel'); w()
    add_block(120, 'Sluipen', '30', 'Veld', 'Vincent Test')
    pg.click('text=Inplannen'); w(); pg.click('.modal >> text=Hier inplannen >> nth=0'); w(800)
    check('Vincent Test' in pg.locator('.blk:has-text("Sluipen") .names').inner_text(), 'inplannen vanuit bouwer houdt leiding')
    pg.click('text=In bank'); w(600)
    pg.click('nav >> text=Opkomstenbank'); w(500); pg.click('.bcard:has-text("Sluipspel")'); w(); pg.click('.side >> text=Bewerken'); w(700)
    check('Vincent Test' not in pg.locator('.blk:has-text("Sluipen") .names').inner_text(), 'opkomstenbank bewaart geen namen')

    # --- overnemen uit bank
    pg.click('nav >> text=Opkomstenbank'); w(500); pg.click('.bcard:has-text("Sluipspel")'); w(300)
    pg.click('.side >> text=Inplannen'); w(400); pg.click('.modal >> text=Hier inplannen >> nth=0'); w(600)
    check(pg.locator('.modal h2:has-text("Opkomst overnemen")').count() == 1, 'overnemen uit bank opent overneemvenster')
    pg.click('.modal >> text=Klaar'); w(300)

    # --- dashboard, banken, kamp
    pg.click('nav >> text=Dashboard'); w(700); check(pg.locator('.hero').count() == 1, 'dashboard toont komende opkomst'); shot('05-dashboard')
    pg.click('nav >> text=Activiteitenbank'); w(400); check(pg.locator('.bcard').count() >= 1, 'activiteitenbank gevuld')
    pg.click('nav >> text=Opkomstbouwer'); w(300); pg.click('text=Weekendkamp'); w(600)
    pg.fill('#om-title', 'Herfstkamp'); pg.click('.daytab >> nth=1'); w(300); pg.click('text=Maaltijden toevoegen'); w(400)
    check(pg.locator('.blk').count() == 3, 'weekendkamp: 3 maaltijden op zaterdag'); shot('06-kamp')

    # --- mobiel
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.click('nav >> text=Jaarplanning'); w(500)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobiel: geen horizontale scroll')
    shot('07-mobiel', False); pg.set_viewport_size({'width': 1360, 'height': 900})

    # --- uitnodiging accepteren als tweede persoon
    pg.evaluate("localStorage.setItem('fake.auth.current','null')"); pg.goto(link); w(500)
    pg.click('text=Account aanmaken'); w(400); register('Anna de Vries', 'anna@test.nl')
    if pg.locator('text=Toetreden').count(): pg.click('text=Toetreden'); w(800)
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'uitnodiging geaccepteerd → dashboard speltak')
    pg.click('nav >> text=Instellingen'); w(400)
    check(pg.locator('text=Anna de Vries (jij)').count() == 1, 'nieuw lid staat in het team')
    b.close()

check(not errors, 'geen fouten in de console' + ('' if not errors else ': ' + '; '.join(errors[:5])))
print(f'\n{len(failures)} mislukt' if failures else '\nAlles geslaagd')
sys.exit(1 if failures else 0)
