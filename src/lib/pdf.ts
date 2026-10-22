// @ts-nocheck
// PDF-opbouw met jsPDF: pagina 1 tijdlijn, pagina 2 materiaallijst, daarna uitlegpagina's.
/* eslint-disable */
import { fmtT, fmtDur, splitNames, splitLines, fmtLong } from './time';
const fmtDate = (iso: string) => (iso ? fmtLong(iso) : '');
const hexRgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x55635A; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export function buildPdf(jsPDF: any, O: any, cats: any[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 15, CW = W - 2 * M, BOTTOM = H - 20;
  const INK = [28, 42, 33], MUTED = [104, 114, 106], LINE = [210, 216, 205], ACC = O.accentRgb || [45, 106, 76], SOFT = [240, 243, 236];
  const keep = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const clean = s => Array.from(String(s == null ? '' : s).replace(/\t/g, ' ')).filter(ch => ch.charCodeAt(0) <= 255 || keep.includes(ch)).join('');
  const lh = pt => pt * 0.3528 * 1.28;
  const font = (style, size, rgb) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(rgb || INK)); };
  const wrap = (text, width, max) => {
    let lines = doc.splitTextToSize(clean(text), width);
    if (max && lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/\s*\S{0,3}$/, '') + '…'; }
    return lines;
  };
  const cat = id => (cats || []).find(c => c.id === id) || { label: 'Zonder categorie', color: '#7E837A' };
  const MULTI = !!(O.days && O.days.length);
  const DAYSX = MULTI ? O.days : [{ label: '', start: O.start, end: O.end, blocks: O.blocks, prep: O.prep || 0, post: O.post || 0 }];
  const blocks = DAYSX.flatMap(D => [...D.blocks].sort((a, b) => a.start - b.start || a.dur - b.dur).map(b => ({ ...b, dayLabel: MULTI ? (D.short || D.label || '') : '' })));
  const tpfx = b => (b.dayLabel ? b.dayLabel + ' ' : '') + fmtT(b.start);
  const title = clean(O.title || 'Opkomst');
  const label = (txt, x, yy) => { font('bold', 8, ACC); doc.setCharSpace(0.6); doc.text(txt, x, yy); doc.setCharSpace(0); };
  let y = M;
  const newPage = () => { doc.addPage(); y = M; };

  /* ---- Pagina 1: tijdlijn ---- */
  const LOGO = O.logo ? 30 : 0;
  if (O.logo) {
    try {
      const r = O.logoW && O.logoH ? O.logoW / O.logoH : 1;
      const lh2 = r >= 1 ? 22 / r : 22, lw2 = r >= 1 ? 22 : 22 * r;
      doc.addImage(O.logo, 'PNG', M + CW - lw2, M - 3, lw2, lh2);
    } catch (e) { /* logo overslaan */ }
  }
  font('bold', 8, ACC); doc.setCharSpace(0.6);
  const head = wrap(O.headLabel || 'PROGRAMMA OPKOMST', CW - LOGO - 20)[0];
  doc.setCharSpace(0); label(head, M, y + 3); y += 6;
  font('bold', 20); const tl = wrap(title, CW - LOGO);
  doc.text(tl, M, y + 6); y += 6 + (tl.length - 1) * lh(20) + 3;
  font('normal', 10, MUTED);
  const timeTxt = MULTI ? DAYSX.length + ' dagen' : fmtT(O.start) + ' – ' + fmtT(O.end) + ((O.prep || O.post) ? '  (leiding ' + fmtT(O.start - (O.prep || 0)) + ' – ' + fmtT(O.end + (O.post || 0)) + ')' : '');
  const sub = wrap([(O.dateLabel || fmtDate(O.date)), timeTxt, O.group, O.location].filter(Boolean).map(clean).join('  ·  '), CW - LOGO);
  doc.text(sub, M, y + 3); y += 3 + sub.length * lh(10);
  if (O.catsLabel) { font('normal', 9.5, MUTED); const cl = wrap('Categorieën: ' + O.catsLabel, CW - LOGO); doc.text(cl, M, y + 2.5); y += cl.length * lh(9.5) + 0.5; }
  const plan = splitNames(O.planners);
  if (plan.length) { font('bold', 9.5, INK); const pl = wrap('Planning door: ' + plan.join(', '), CW - LOGO); doc.text(pl, M, y + 2.5); y += pl.length * lh(9.5) + 0.5; }
  if (O.minNeed) { font('normal', 9.5, MUTED); doc.text(clean('Minimaal ' + O.minNeed + ' leiding nodig'), M, y + 2.5); y += lh(9.5) + 0.5; }
  const pres = splitNames(O.present);
  if (pres.length) { font('normal', 9.5, MUTED); const pl = wrap('Leiding aanwezig: ' + pres.join(', '), CW); doc.text(pl, M, y + 2.5); y += pl.length * lh(9.5) + 0.5; }

  y += 3;
  const X = { t: M, s: M + 18.5, o: M + 23, oW: 50, l: M + 76, lW: 25, n: M + 104, nW: 27, p: M + 134, pW: CW - 134 };
  const tableHead = () => {
    font('bold', 7, MUTED); doc.setCharSpace(0.15);
    doc.text('TIJD', X.t, y + 3); doc.text('ONDERDEEL', X.o, y + 3); doc.text('LOCATIE', X.l, y + 3);
    doc.text('LEIDING', X.n, y + 3); doc.text('VOORBEREIDING', X.p, y + 3);
    doc.setCharSpace(0);
    y += 5; doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(M, y, M + CW, y); y += 0.5;
  };
  const refs = [];
  const drawBar = D => {
    const lo = D.start - (D.prep || 0), hi = D.end + (D.post || 0), total = Math.max(5, hi - lo);
    doc.setFillColor(...SOFT); doc.rect(M, y, CW, 5, 'F');
    doc.setFillColor(222, 226, 218);
    if (D.prep) doc.rect(M, y, D.prep / total * CW, 5, 'F');
    if (D.post) doc.rect(M + (D.end - lo) / total * CW, y, D.post / total * CW, 5, 'F');
    D.blocks.forEach(b => {
      const s = Math.max(b.start, lo), e = Math.min(b.start + b.dur, hi);
      if (e <= s) return;
      doc.setFillColor(...hexRgb(cat(b.cat).color));
      doc.rect(M + (s - lo) / total * CW, y, Math.max(0.4, (e - s) / total * CW - 0.4), 5, 'F');
    });
    font('normal', 7, MUTED);
    const step = total > 600 ? 120 : total > 300 ? 60 : 30;
    for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) {
      const x = M + (m - lo) / total * CW;
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(x, y + 5, x, y + 6.3);
      if (x > M + 6 && x < M + CW - 6) doc.text(fmtT(m), x, y + 9, { align: 'center' });
    }
    doc.text(fmtT(lo), M, y + 9); doc.text(fmtT(hi), M + CW, y + 9, { align: 'right' });
    y += 14;
  };
  const bandRow = (time, text, sub) => {
    const h = 8;
    if (y + h > BOTTOM) { newPage(); tableHead(); }
    doc.setFillColor(...SOFT); doc.rect(M, y + 0.5, CW, h - 1, 'F');
    font('bold', 9.5); doc.text(fmtT(time), X.t, y + 5.2);
    font('bold', 9.5); doc.text(clean(text), X.o, y + 5.2);
    if (sub) { font('normal', 8.5, MUTED); doc.text(clean(sub), X.l, y + 5.2); }
    y += h; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
  };
  const gapRow = (s0, e0) => {
    const h = 7.5;
    if (y + h > BOTTOM) { newPage(); tableHead(); }
    font('normal', 9, MUTED); doc.text(fmtT(s0), X.t, y + 4.8);
    font('italic', 8.5, MUTED); doc.text('niet ingepland  (' + fmtDur(e0 - s0) + ', tot ' + fmtT(e0) + ')', X.o, y + 4.8);
    y += h; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
  };
  const blockRow = b => {
    const P = 2.6, c = cat(b.cat);
    const hasPage = b.pdfPage !== false;
    font('bold', 10); const tLines = wrap(b.title || 'Naamloos onderdeel', X.oW);
    font('normal', 8.5); const sLines = b.short ? wrap(b.short, X.oW, 3) : [];
    font('normal', 9); const lLines = b.location ? wrap(b.location, X.lW) : ['–'];
    const nArr = splitNames(b.names); const nLines = nArr.length ? wrap(nArr.join(', '), X.nW) : ['–'];
    font('normal', 8.5); const prepL = b.prep ? wrap(b.prep, X.pW, 5) : [];
    const hO = tLines.length * lh(10) + sLines.length * lh(8.5) + lh(8) * (hasPage ? 2 : 1) + 1.5;
    const hN = nLines.length * lh(9) + (b.minLeaders ? lh(8) : 0);
    const hT = lh(10) + lh(8) * 2;
    const hP = prepL.length * lh(8.5);
    const h = Math.max(hT, hO, hN, lLines.length * lh(9), hP || lh(8.5)) + 2 * P;
    if (y + h > BOTTOM) { newPage(); tableHead(); }
    const top = y + P + 3.2;
    doc.setFillColor(...hexRgb(c.color)); doc.rect(X.s, y + 1.2, 1.4, h - 2.4, 'F');
    font('bold', 10); doc.text(fmtT(b.start), X.t, top);
    font('normal', 8, MUTED); doc.text(fmtT(b.start + b.dur), X.t, top + lh(10)); doc.text(fmtDur(b.dur), X.t, top + lh(10) + lh(8));
    font('bold', 10); doc.text(tLines, X.o, top);
    let oy = top + tLines.length * lh(10);
    if (sLines.length) { font('normal', 8.5); doc.text(sLines, X.o, oy - 0.4); oy += sLines.length * lh(8.5); }
    font('normal', 8, MUTED); doc.text(clean(c.label), X.o, oy); oy += lh(8);
    if (hasPage) refs.push({ id: b.id, page: doc.getCurrentPageInfo().pageNumber, x: X.o, y: oy });
    font('normal', 9); doc.text(lLines, X.l, top);
    doc.text(nLines, X.n, top);
    if (b.minLeaders) {
      const short = !O.noNames && nArr.length < b.minLeaders;
      font(short ? 'bold' : 'normal', 8, short ? [168, 56, 44] : MUTED);
      doc.text('min. ' + b.minLeaders + ' leiding' + (short ? ' (' + nArr.length + ')' : ''), X.n, top + nLines.length * lh(9));
    }
    if (prepL.length) { font('normal', 8.5); doc.text(prepL, X.p, top); }
    else { font('italic', 8.5, MUTED); doc.text('geen', X.p, top); }
    y += h; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
  };
  const renderDay = D => {
    const bl = [...D.blocks].sort((a, b) => a.start - b.start || a.dur - b.dur);
    const prep = D.prep || 0, post = D.post || 0;
    if (prep) bandRow(D.start - prep, 'Voorbereiding leiding', fmtDur(prep) + ', opkomst start om ' + fmtT(D.start));
    let cursor = D.start, done = false;
    const finish = () => {
      if (bl.length && cursor < D.end) gapRow(cursor, D.end);
      if (post) bandRow(D.end, 'Nabespreking leiding', fmtDur(post) + ', tot ' + fmtT(D.end + post));
      done = true;
    };
    bl.forEach(b => {
      if (!done && b.start >= D.end) finish();
      if (!done && b.start > cursor) gapRow(cursor, b.start);
      blockRow(b);
      if (b.start + b.dur > cursor) cursor = Math.max(cursor, b.start + b.dur);
    });
    if (!done) finish();
    if (!bl.length) { font('italic', 10, MUTED); doc.text('Er zijn nog geen onderdelen ingepland.', M, y + 6); y += 10; }
  };
  if (!MULTI) { drawBar(DAYSX[0]); tableHead(); renderDay(DAYSX[0]); }
  else DAYSX.forEach((D, i) => {
    if (i && y + 45 > BOTTOM) newPage(); else if (i) y += 7;
    font('bold', 13); const dl = clean(D.label || 'Dag ' + (i + 1)); doc.text(dl, M, y + 5);
    const w = doc.getTextWidth(dl);
    font('normal', 10, MUTED); doc.text(fmtT(D.start) + ' – ' + fmtT(D.end) + '   ·   ' + D.blocks.length + (D.blocks.length === 1 ? ' onderdeel' : ' onderdelen'), M + w + 4, y + 5);
    y += 9; drawBar(D); tableHead(); renderDay(D);
  });

  /* ---- Pagina 2: totale materiaallijst ---- */
  newPage();
  label((doc.getCurrentPageInfo().pageNumber === 2 ? 'PAGINA 2  ·  ' : '') + 'CHECKLIST', M, y + 3); y += 6;
  font('bold', 18); doc.text('Materiaallijst', M, y + 6); y += 10;
  font('normal', 9.5, MUTED);
  const intro = wrap('Alles wat voor deze opkomst klaar moet staan. Gelijke regels zijn samengevoegd; rechts staat bij welk onderdeel het hoort.', CW);
  doc.text(intro, M, y + 3); y += intro.length * lh(9.5) + 4;
  const matMap = new Map();
  blocks.forEach(b => splitLines(b.materials).forEach(mt => {
    const k = mt.toLowerCase();
    if (!matMap.has(k)) matMap.set(k, { text: mt, uses: [] });
    matMap.get(k).uses.push(tpfx(b) + ' ' + (b.title || 'naamloos'));
  }));
  const mats = [...matMap.values()];
  if (!mats.length) { font('italic', 10, MUTED); doc.text('Er is nog geen materiaal ingevuld.', M, y + 4); y += 10; }
  const mW = CW * 0.55, uX = M + 9 + mW + 4, uW = CW - (uX - M);
  mats.forEach(it => {
    font('normal', 10); const L = wrap(it.text, mW);
    font('normal', 8.5); const U = wrap(it.uses.join('; '), uW, 3);
    const hh = Math.max(L.length * lh(10), U.length * lh(8.5)) + 2.6;
    if (y + hh > BOTTOM) newPage();
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(M + 1, y + 1, 3.2, 3.2);
    font('normal', 10); doc.text(L, M + 9, y + 3.8);
    font('normal', 8.5, MUTED); doc.text(U, uX, y + 3.6);
    y += hh; doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(M + 9, y - 0.8, M + CW, y - 0.8);
  });
  const preps = blocks.filter(b => b.prep);
  if (preps.length) {
    y += 6;
    if (y + 20 > BOTTOM) newPage();
    font('bold', 13); doc.text('Voorbereiding', M, y + 4); y += 8;
    // per onderdeel: kop (tijd + titel), daaronder grijs wie het doet, dan de tekst; alles afgebroken, niets afgekapt
    preps.forEach(b => {
      font('bold', 9.5); const head = wrap(tpfx(b) + '  ' + (b.title || 'Naamloos onderdeel'), CW - 9);
      const who = splitNames(b.names).join(', ');
      font('normal', 8.5); const W2 = who ? wrap(who, CW - 9) : [];
      font('normal', 9.5); const L = wrap(b.prep, CW - 9);
      const headH = head.length * lh(9.5) + W2.length * lh(8.5);
      const hh = headH + L.length * lh(9.5) + 3;
      // past het niet meer: nieuwe pagina, tenzij het toch niet op één pagina past en de kop met een paar regels nog wel
      if (y + hh > BOTTOM && (hh <= BOTTOM - M || y + headH + Math.min(3, L.length) * lh(9.5) + 3 > BOTTOM)) newPage();
      doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(M + 1, y + 1, 3.2, 3.2);
      let ty = y + 3.8;
      font('bold', 9.5); doc.text(head, M + 9, ty); ty += head.length * lh(9.5);
      if (W2.length) { font('normal', 8.5, MUTED); doc.text(W2, M + 9, ty - 0.2); ty += W2.length * lh(8.5); }
      L.forEach(line => {
        if (ty + 1.2 > BOTTOM) { newPage(); font('italic', 8.5, MUTED); doc.text('vervolg ' + clean(b.title || ''), M + 9, y + 3); y += 7; ty = y + 3.8; }
        font('normal', 9.5); doc.text(line, M + 9, ty); ty += lh(9.5);
      });
      y = ty - 3.8 + 3;
    });
  }

  /* ---- Uitlegpagina's: alleen voor onderdelen die dat aan hebben staan ---- */
  const pageOf = {};
  const withPage = blocks.filter(b => b.pdfPage !== false);
  withPage.forEach((b, i) => {
    newPage();
    pageOf[b.id] = doc.getCurrentPageInfo().pageNumber;
    const c = cat(b.cat);
    label('UITLEG ' + (i + 1) + ' VAN ' + withPage.length + (b.dayLabel ? '  ·  ' + clean(b.dayLabel).toUpperCase() : ''), M, y + 3); y += 7;
    font('bold', 24); const tt = fmtT(b.start) + ' – ' + fmtT(b.start + b.dur); doc.text(tt, M, y + 7);
    const tw = doc.getTextWidth(tt);
    font('normal', 11, MUTED); doc.text(fmtDur(b.dur), M + tw + 4, y + 7);
    y += 11;
    font('bold', 17); const tL = wrap(b.title || 'Naamloos onderdeel', CW);
    doc.text(tL, M, y + 6); y += 6 + (tL.length - 1) * lh(17) + 3;
    doc.setFillColor(...hexRgb(c.color)); doc.rect(M, y, 26, 1.4, 'F'); y += 6;
    if (b.short) { font('normal', 11.5); const sl = wrap(b.short, CW); doc.text(sl, M, y + 3.5); y += sl.length * lh(11.5) + 4; }
    const metaRow = (k, v) => {
      font('bold', 7.5, MUTED); doc.setCharSpace(0.4); doc.text(k.toUpperCase(), M, y + 3); doc.setCharSpace(0);
      font('normal', 10.5); const L = wrap(v, CW - 42); doc.text(L, M + 42, y + 3.2); y += Math.max(1, L.length) * lh(10.5) + 1.6;
    };
    metaRow('Categorie', c.label);
    metaRow('Locatie', b.location || 'niet ingevuld');
    metaRow('Verantwoordelijk', splitNames(b.names).join(', ') || 'nog niemand ingevuld');
    metaRow('Minimaal leiding', String(b.minLeaders || 0));
    y += 4;
    const cont = () => { newPage(); font('italic', 8.5, MUTED); doc.text('vervolg ' + clean(b.title || ''), M, y + 3); y += 7; };
    const section = (name, body, isList) => {
      if (y + 16 > BOTTOM) newPage();
      font('bold', 12); doc.text(name, M, y + 4);
      y += 6; doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.line(M, y, M + CW, y); y += 3;
      if (!body || (isList && !body.length)) { font('italic', 10, MUTED); doc.text('Niet ingevuld.', M, y + 3.5); y += 10; return; }
      if (isList) {
        body.forEach(item => {
          font('normal', 10.5); const L = wrap(item, CW - 8); const hh = L.length * lh(10.5) + 1.8;
          if (y + hh > BOTTOM) cont();
          font('normal', 10.5);
          doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(M + 0.5, y + 0.9, 3, 3);
          doc.text(L, M + 7, y + 3.6); y += hh;
        });
        y += 5; return;
      }
      String(body).split(/\n/).forEach(par => {
        if (!par.trim()) { y += lh(10.5) * 0.6; return; }
        font('normal', 10.5);
        wrap(par, CW).forEach(line => {
          if (y + lh(10.5) > BOTTOM) cont();
          font('normal', 10.5); doc.text(line, M, y + 3.6); y += lh(10.5);
        });
        y += 1.4;
      });
      y += 5;
    };
    section('Beschrijving', b.desc);
    section('Voorbereiding', b.prep);
    section('Materiaal', splitLines(b.materials), true);
  });

  refs.forEach(r => { if (!pageOf[r.id]) return; doc.setPage(r.page); font('normal', 8, ACC); doc.text('Uitleg op pagina ' + pageOf[r.id], r.x, r.y); });
  const N = doc.getNumberOfPages();
  for (let p = 1; p <= N; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, H - 13, M + CW, H - 13);
    font('normal', 7.5, MUTED);
    doc.text(wrap([O.groupName ? clean(O.groupName) : '', title, (O.dateLabel || fmtDate(O.date))].filter(Boolean).join('  ·  '), CW - 30)[0], M, H - 9);
    doc.text('pagina ' + p + ' van ' + N, M + CW, H - 9, { align: 'right' });
  }
  return doc;
}
