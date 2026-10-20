import PDFDocument from 'pdfkit';
import { formatKes } from '../../shared/money';
import type { PoWithDetails } from './purchase-orders.service';

/** Purchase order PDF sent to the supplier (email / WhatsApp). Prices are OUR cost — staff & supplier only. */
export function renderPurchaseOrder(po: PoWithDetails): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(22).text('MySpares');
  doc.font('Helvetica').fontSize(9).text('Purchase Order').moveDown();
  doc.font('Helvetica-Bold').fontSize(14).text(po.number);
  doc.font('Helvetica').fontSize(10)
    .text(`Date: ${po.createdAt.toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}`)
    .text(`Supplier: ${po.supplier.name} (${po.supplier.code})`)
    .text(`Address: ${po.supplier.addressLine}, ${po.supplier.area}`)
    .text(`Phone: ${po.supplier.phone}`)
    .moveDown();

  const col = { part: 40, desc: 150, qty: 380, price: 420, total: 490 };
  const row = (c: [string, string, string, string, string], bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const y = doc.y;
    doc.text(c[0], col.part, y, { width: 105 });
    const end1 = doc.y;
    doc.text(c[1], col.desc, y, { width: 225 });
    const end2 = doc.y;
    doc.text(c[2], col.qty, y, { width: 35, align: 'right' });
    doc.text(c[3], col.price, y, { width: 65, align: 'right' });
    doc.text(c[4], col.total, y, { width: 65, align: 'right' });
    doc.y = Math.max(end1, end2, doc.y) + 6;
  };
  row(['Part number', 'Description', 'Qty', 'Unit', 'Total'], true);
  for (const i of po.items) row([i.partNumber, i.description, String(i.quantity), formatKes(i.unitCostCents), formatKes(i.unitCostCents * i.quantity)]);
  doc.moveDown(0.5).font('Helvetica-Bold').text(`PO total: ${formatKes(po.totalCostCents)}`, col.price - 60, doc.y, { width: 175, align: 'right' });

  doc.x = 40;
  doc.moveDown(2).font('Helvetica').fontSize(9)
    .text('Please confirm availability and the ready time by replying to this PO.')
    .text('A MySpares rider will collect. Hand over ONLY to a rider who quotes the collection code we give you on confirmation.')
    .text(`Always quote ${po.number} on your invoice.`);
  doc.end();
  return done;
}
