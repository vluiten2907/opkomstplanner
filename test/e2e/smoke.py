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
        pg.fill('input:not([type=email]):not([type=password])', name); pg.fill('input[type=password]', 'geheim123')
        if pg.locator('input[type=email]').is_editable(): pg.fill('input[type=email]', email)
        pg.click('.btn.primary'); w(800)

    def add_block(y, title, dur='15', loc='', who=None):
        pg.locator('.lanes').click(position={'x': 100, 'y': y}); w()
        pg.fill('#bf-title', title); pg.select_option('#bf-dur', dur)
        if loc: pg.fill('#bf-loc', loc)
        if who: pg.click(f'.side .chip:has-text("{who}")')
        w(600); pg.click('.side .closex'); w(200)

    def logout_to(url):
        pg.evaluate("localStorage.setItem('fake.auth.current','null'); localStorage.removeItem('opk.sid')"); pg.goto(url); w(600)

    def invite_link():
        return pg.locator('.banknote .mono-code').last.inner_text()

    # --- geen open registratie meer
    pg.goto(BASE + '/registreren'); w()
    check('/inloggen' in pg.url, 'registreren zonder uitnodiging bestaat niet meer')
    check(pg.locator('text=Nieuw account').count() == 0, 'inlogpagina heeft geen knop Nieuw account')

    # --- Beheer (totaal): groep, speltak en uitnodigingen
    pg.fill('input[type=email]', 'vluiten2907@gmail.com'); pg.fill('input[type=password]', 'demo123'); pg.click('.btn.primary'); w(1200)
    check('/beheer' in pg.url and pg.locator('h2:has-text("Beheer (totaal)")').count() == 1, 'hoofdaccount → Beheer (totaal)')
    pg.click('text=Nieuwe Scouting-groep'); w(); pg.fill('#ng-name', 'Testgroep'); pg.fill('#ng-email', 'ga@test.nl'); pg.click('text=Groep aanmaken'); w(800)
    ga_link = invite_link(); check('/uitnodiging/' in ga_link, 'groep aangemaakt + uitnodiging Beheer (groep)')
    pg.fill('input[placeholder^="Naam nieuwe speltak"]', 'Scouts'); pg.click('text=Speltak aanmaken'); w(800)
    check(pg.locator('.groupcard .member:has-text("Scouts")').count() == 1, 'speltak aangemaakt in groep')
    pg.locator('.groupcard .member:has-text("Scouts") button', has_text=re.compile('^Team$')).click(); w(300)
    pg.fill('input[placeholder="e-mailadres teamleider"]', 'vincent@test.nl'); pg.click('text=Teamleider uitnodigen'); w(800)
    tl_link = invite_link(); check('/uitnodiging/' in tl_link and tl_link != ga_link, 'teamleider uitgenodigd')
    pg.fill('input[placeholder="e-mailadres beheerder"]', 'weg@test.nl'); pg.click('.groupcard >> text=Beheerder uitnodigen'); w(800)
    n_inv = pg.locator('.invrow').count(); check(n_inv == 3, f'openstaande uitnodigingen zichtbaar ({n_inv})')
    pg.locator('.invrow:has-text("weg@test.nl") >> text=Intrekken').click(); w(150); pg.locator('.invrow:has-text("weg@test.nl") >> text=Zeker?').click(); w(800)
    check(pg.locator('.invrow').count() == 2, 'uitnodiging intrekken')
    shot('00-beheer')

    # --- teamleider maakt account via de uitnodiging
    logout_to(tl_link)
    check(pg.locator('input[type=email]').input_value() == 'vincent@test.nl', 'uitnodiging: e-mailadres staat vast')
    register('Vincent Test', 'vincent@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'account via uitnodiging → dashboard speltak'); shot('01-dashboard')
    # --- team en instellingen
    pg.click('nav >> text=Team & instellingen'); w()
    check(pg.locator('.invite .chip:has-text("Teamleider")').count() == 0 and pg.locator('.invite .chip:has-text("Mijn rol overdragen")').count() == 1, 'teamleider kan geen extra teamleider uitnodigen, wel overdragen')
    pg.fill('.invite input[type=email]', 'anna@test.nl'); pg.click('text=Uitnodigingslink maken'); w(600)
    link = pg.locator('.mono-code').inner_text()
    check('/uitnodiging/' in link, 'uitnodigingslink gemaakt')
    check(pg.locator('.invrow:has-text("anna@test.nl")').count() == 1, 'teamleider ziet openstaande uitnodiging')
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
    check(pg.locator('#om-title[placeholder="Opkomst titel"]').count() == 1, 'bouwer: titelveld heet Opkomst titel')
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
    shot('07-mobiel', False)
    for wd in (344, 360, 412):  # o.a. Samsung-toestellen: hele menubalk in beeld
        pg.set_viewport_size({'width': wd, 'height': 780}); w(200)
        inview = pg.evaluate("[...document.querySelectorAll('header.bar nav a, header.bar .acct .btn')].every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1; })")
        check(inview, f'mobiel {wd}px: alle menu-items en account in beeld')
    pg.click('header.bar .acct .btn'); w(200); check(pg.locator('.menu >> text=Uitloggen').is_visible(), 'mobiel: accountmenu opent')
    pg.mouse.click(5, 600); w(200)
    pg.set_viewport_size({'width': 1360, 'height': 900})

    # --- uitnodiging accepteren als tweede persoon
    logout_to(link); register('Anna de Vries', 'anna@test.nl')
    check(re.search(r'/s/[^/]+/dashboard', pg.url) is not None, 'uitnodiging geaccepteerd → dashboard speltak')
    pg.click('nav >> text=Instellingen'); w(400)
    check(pg.locator('text=Anna de Vries (jij)').count() == 1, 'nieuw lid staat in het team')

    # --- Beheer (groep) accepteert en ziet speltak met teamleider
    logout_to(ga_link); register('Greet Beheer', 'ga@test.nl')
    check('/beheer' in pg.url, 'beheerder groep → beheerpagina')
    check(pg.locator('.groupcard .member:has-text("Scouts") >> text=Teamleider: Vincent Test').count() == 1, 'beheerder ziet speltak en teamleider')
    check(pg.locator('h2:has-text("Beheer (totaal)")').count() == 0, 'beheerder groep ziet geen Beheer (totaal)')
    shot('08-beheer-groep')
    pg.set_viewport_size({'width': 390, 'height': 800}); w(300)
    check(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'beheer mobiel: geen horizontale scroll'); shot('09-beheer-mobiel')
    pg.set_viewport_size({'width': 1360, 'height': 900})
    pg.click('.groupcard .member:has-text("Scouts") >> text=Openen'); w(1000)
    check(pg.locator('.adminnote').count() == 1, 'beheerder bekijkt speltak alleen-lezen')
    check(pg.locator('text=Nieuwe opkomst').count() == 0, 'beheerder kan geen opkomst maken')
    b.close()

check(not errors, 'geen fouten in de console' + ('' if not errors else ': ' + '; '.join(errors[:5])))
print(f'\n{len(failures)} mislukt' if failures else '\nAlles geslaagd')
sys.exit(1 if failures else 0)
