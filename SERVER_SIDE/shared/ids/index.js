/**
 * Human-readable number generators.
 * All use Postgres sequences for global uniqueness — no race conditions.
 *
 * Formats:
 *   Order         ORD-YYMMDD-NNNNN
 *   Purchase Order PO-YYMM-NNNNN
 *   GRN           GRN-YYMM-NNNNN
 *   Logistics Job  JOB-YYMMDD-NNNN
 *   Part Request   PR-YYMM-NNNNN
 *   RMA            RMA-YYMM-NNNNN
 *   Supplier       SUP-NNNN
 *   Rider          RDR-NNNN
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.PG_URI,
});

function yymmdd() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function yymm() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

async function nextSeq(sequenceName) {
  const res = await pool.query(`SELECT nextval($1)::int AS n`, [sequenceName]);
  return res.rows[0].n;
}

export async function generateOrderNumber() {
  const n = await nextSeq('order_number_seq');
  return `ORD-${yymmdd()}-${String(n).padStart(5, '0')}`;
}

export async function generatePoNumber() {
  const n = await nextSeq('po_number_seq');
  return `PO-${yymm()}-${String(n).padStart(5, '0')}`;
}

export async function generateGrnNumber() {
  const n = await nextSeq('grn_number_seq');
  return `GRN-${yymm()}-${String(n).padStart(5, '0')}`;
}

export async function generateJobNumber() {
  const n = await nextSeq('job_number_seq');
  return `JOB-${yymmdd()}-${String(n).padStart(4, '0')}`;
}

export async function generatePrNumber() {
  const n = await nextSeq('pr_number_seq');
  return `PR-${yymm()}-${String(n).padStart(5, '0')}`;
}

export async function generateRmaNumber() {
  const n = await nextSeq('rma_number_seq');
  return `RMA-${yymm()}-${String(n).padStart(5, '0')}`;
}

export async function generateSupplierCode() {
  const n = await nextSeq('supplier_code_seq');
  return `SUP-${String(n).padStart(4, '0')}`;
}

export async function generateRiderCode() {
  const n = await nextSeq('rider_code_seq');
  return `RDR-${String(n).padStart(4, '0')}`;
}
