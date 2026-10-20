import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js/node';
import { formatKes } from '../../shared/money';
import type { StaffOrder } from './fulfilment.service';

// MySpares-branded paperwork. RULE (BR-007): never print supplier names, costs or PO numbers.

const BUSINESS = {
  name: 'MySpares',
  tagline: 'Genuine parts. Fast sourcing. Delivered.',
  phone: '+254 700 000 000', // TODO: real contact details
  email: 'support@myspares.co.ke',
};

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const barcode = (text: string) => bwipjs.toBuffer({ bcid: 'code128', text, scale: 2, height: 12, includetext: true, textxalign: 'center' });

function addressLines(o: StaffOrder): string[] {
  if (o.deliveryMethod === 'CLICK_AND_COLLECT') return ['CLICK & COLLECT — MySpares shop'];
  const a = (o.deliveryAddress ?? {}) as Record<string, string | undefined>;
  return [a.line1, a.line2, a.area, a.landmark ? `Landmark: ${a.landmark}` : undefined].filter((x): x is string => Boolean(x));
}

/** A6 parcel label: big order number + barcode, recipient, delivery area. */
export async function renderLabel(o: StaffOrder): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A6', margin: 18 });
  doc.font('Helvetica-Bold').fontSize(18).text(BUSINESS.name, { align: 'center' });
  doc.font('Helvetica').fontSize(8).text(BUSINESS.tagline, { align: 'center' }).moveDown(0.6);
  doc.image(await barcode(o.number), { fit: [260, 60], align: 'center' });
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).text('DELIVER TO');
  doc.font('Helvetica').fontSize(11).text(o.contactName).text(o.contactPhone);
  for (const line of addressLines(o)) doc.text(line);
  doc.moveDown(0.5);

  const units = o.items.reduce((n, i) => n + i.quantity, 0);
  doc.fontSize(9).text(`${units} item(s) · ${o.deliveryMethod.replace(/_/g, ' ')}`);
  if (o.amountPaidCents < o.totalCents) {
    doc.font('Helvetica-Bold').fontSize(12).text(`COLLECT: ${formatKes(o.totalCents - o.amountPaidCents)}`);
  } else {
    doc.font('Helvetica-Bold').fontSize(10).text('PAID');
  }
  return toBuffer(doc);
}

/** A4/A5 packing slip that goes INSIDE the parcel. */
export async function renderPackingSlip(o: StaffOrder): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', margin: 30 });
  doc.font('Helvetica-Bold').fontSize(20).text(BUSINESS.name);
  doc.font('Helvetica').fontSize(9).text(BUSINESS.tagline).text(`${BUSINESS.phone} · ${BUSINESS.email}`).moveDown();

  doc.font('Helvetica-Bold').fontSize(12).text(`Packing slip — ${o.number}`);
  doc.font('Helvetica').fontSize(9)
    .text(`Date: ${new Date(o.createdAt).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}`)
    .text(`Customer: ${o.contactName} (${o.contactPhone})`)
    .moveDown();

  // Items table (A5 = 420pt wide; 30pt margins → content from x=30 to x=390)
  const col = { item: 30, qty: 228, price: 252, total: 322 };
  const W = { item: 190, qty: 22, price: 66, total: 68 };
  const row = (cells: [string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const y = doc.y;
    doc.text(cells[0], col.item, y, { width: W.item });
    const end = doc.y;
    doc.text(cells[1], col.qty, y, { width: W.qty, align: 'right' });
    doc.text(cells[2], col.price, y, { width: W.price, align: 'right' });
    doc.text(cells[3], col.total, y, { width: W.total, align: 'right' });
    doc.y = Math.max(end, doc.y) + 5;
  };
  row(['Item', 'Qty', 'Price', 'Total'], true);
  doc.moveTo(30, doc.y - 2).lineTo(390, doc.y - 2).strokeColor('#999999').stroke();
  for (const i of o.items) row([`${i.name}\n${i.sku}`, String(i.quantity), formatKes(i.unitPriceCents), formatKes(i.lineTotalCents)]);
  doc.moveTo(30, doc.y).lineTo(390, doc.y).stroke().moveDown(0.5);

  const totals: Array<[string, number, boolean]> = [
    ['Subtotal', o.subtotalCents, false],
    ['Delivery', o.deliveryFeeCents, false],
    ['Total (incl. VAT)', o.totalCents, true],
    ['VAT included', o.vatCents, false],
    ['Paid', o.amountPaidCents, false],
    ['Balance due', Math.max(o.totalCents - o.amountPaidCents, 0), true],
  ];
  for (const [label, cents, bold] of totals) {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    doc.text(label, 200, y, { width: 110, align: 'right' });
    doc.text(formatKes(cents), col.total - 10, y, { width: W.total + 10, align: 'right' });
    doc.moveDown(0.2);
  }
  doc.x = 30;
  doc.moveDown().font('Helvetica').fontSize(8)
    .text('Warranty: parts are covered against manufacturing defects as stated on the product page. Keep this slip as proof of purchase.')
    .moveDown(0.5)
    .text(`Questions? Call ${BUSINESS.phone} or email ${BUSINESS.email} and quote ${o.number}.`);
  return toBuffer(doc);
}
