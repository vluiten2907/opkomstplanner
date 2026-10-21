import { ACCENTS, FIXED_CATS, allBlocks, dayTitle, isKamp, minNeed, opkCatOf, plannersOf, type Opk, type Plan, type Settings } from './model';
import { fmtNL, fmtRange, addDays } from './time';
import { toast } from '../store/toast';

export function download(filename: string, blob: Blob, okMsg?: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (okMsg) toast(okMsg);
}

export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const groupLine = (s: Settings) => [s.groupName, s.speltak].map(x => (x || '').trim()).filter(Boolean).join(' · ');

/** Pdf maken; jsPDF en de pdf-opbouw worden pas hier geladen, zodat ze niet in de hoofdbundel zitten. */
export async function makePdf(o: Opk | undefined | null, settings: Settings, e: Plan | null, present: string[], practice = false) {
  if (!o) return;
  if (!allBlocks(o).length) { toast('Voeg eerst een onderdeel toe.'); return; }
  const A = ACCENTS[settings.accent] || ACCENTS.marine;
  const input = {
    ...o, date: e ? e.date : '', dateLabel: e ? fmtRange(e.date, e.endDate, true) : '', present: e ? present : [],
    noNames: o.state === 'bank', minNeed: minNeed(o), planners: o.state === 'bank' ? [] : plannersOf(e, o),
    catsLabel: (o.cats || []).map(c => opkCatOf(settings, c)).filter(Boolean).map(c => c!.label).join(', '),
    groupName: settings.groupName, headLabel: groupLine(settings) ? groupLine(settings).toUpperCase() : 'PROGRAMMA OPKOMST',
    logo: settings.logo, logoW: settings.logoW, logoH: settings.logoH, accentRgb: A.rgb,
    days: isKamp(o) ? o.days.map((d, i) => ({ label: dayTitle(o, i, e ? addDays(e.date, i) : null, true), short: d.label.slice(0, 2).toLowerCase(), start: d.start, end: d.end, blocks: d.blocks })) : null,
  };
  try {
    const [{ jsPDF }, { buildPdf }] = await Promise.all([import('jspdf'), import('./pdf')]);
    const doc = buildPdf(jsPDF, input, [...settings.categories, ...FIXED_CATS]);
    if (practice) watermark(doc);
    const name = (slugify((e ? fmtNL(e.date) + '-' : '') + (o.title || 'opkomst')).slice(0, 60) || 'opkomst') + '.pdf';
    download(name, doc.output('blob'), 'Pdf gedownload');
  } catch (err: any) { toast('Pdf maken mislukt: ' + err.message); }
}

/** Schuin watermerk op elke pagina (pdf uit de oefenomgeving). */
function watermark(doc: any) {
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.13 }));
    doc.setTextColor(181, 70, 47); doc.setFont('helvetica', 'bold'); doc.setFontSize(84);
    doc.text('OEFENEN', w / 2, h / 2, { align: 'center', angle: 35, baseline: 'middle' });
    doc.setFontSize(20);
    doc.text('voorbeelddata · niet echt', w / 2 + 18, h / 2 + 26, { align: 'center', angle: 35, baseline: 'middle' });
    doc.restoreGraphicsState();
  }
}
