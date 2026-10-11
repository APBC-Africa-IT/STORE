/**
 * Search service — Postgres FTS provider (tsvector + pg_trgm).
 * Interface is provider-agnostic: swap to OpenSearch in M7 without changing callers.
 *
 * Requires DB setup (raw migration):
 *   CREATE EXTENSION IF NOT EXISTS pg_trgm;
 *   CREATE EXTENSION IF NOT EXISTS unaccent;
 *   ALTER TABLE products ADD COLUMN search_vector tsvector;
 *   CREATE INDEX products_search_idx ON products USING GIN (search_vector);
 *   CREATE INDEX products_name_trgm  ON products USING GIN (name gin_trgm_ops);
 *   CREATE INDEX part_numbers_trgm   ON part_numbers USING GIN (normalized gin_trgm_ops);
 */
import { prisma } from '../../shared/db/prisma.js';

// ── Natural-language query parser ────────────────────────────────────────────
// Extracts year (4-digit), position words, and remaining query text

const POSITION_WORDS = ['front', 'rear', 'left', 'right', 'upper', 'lower'];
const YEAR_RE = /\b(19[89]\d|20[012]\d)\b/g;

export function parseNaturalQuery(raw) {
  let text = raw.trim();
  const years = [];

  // Extract year tokens
  for (const m of text.matchAll(YEAR_RE)) years.push(Number(m[1]));
  text = text.replace(YEAR_RE, '').trim();

  // Extract position words
  const positions = [];
  for (const p of POSITION_WORDS) {
    const re = new RegExp(`\\b${p}\\b`, 'gi');
    if (re.test(text)) {
      positions.push(p);
      text = text.replace(re, '').trim();
    }
  }

  // Clean up extra spaces
  text = text.replace(/\s+/g, ' ').trim();

  return { query: text, years, positions };
}

// ── Detect part-number pattern ────────────────────────────────────────────────
// Part numbers typically contain alphanumeric + dashes, no spaces

const PART_NUMBER_RE = /^[A-Z0-9][A-Z0-9\-\.]{3,}$/i;

function looksLikePartNumber(q) {
  return PART_NUMBER_RE.test(q.replace(/\s/g, ''));
}

function normalizePartNumber(q) {
  return q.replace(/[\s\-\.]/g, '').toUpperCase();
}

// ── Main search ───────────────────────────────────────────────────────────────

/**
 * Search products via Postgres FTS + trigram similarity.
 * @param {{ q:string, category?:string, brand?:string, vehicleId?:string,
 *           origin?:string, grade?:string, priceMin?:number, priceMax?:number,
 *           availability?:string, sort?:string, cursor?:string, limit?:number,
 *           audience?:string }} opts
 */
export async function searchProducts(opts) {
  const {
    q = '',
    category, brand, vehicleId,
    origin, grade,
    priceMin, priceMax,
    availability,
    sort = 'relevance',
    cursor,
    limit = 25,
  } = opts;

  const parsed = parseNaturalQuery(q);
  const cleanQuery = parsed.query;
  const isPartNum  = looksLikePartNumber(cleanQuery);

  // Build WHERE conditions
  const conditions = [`p.status = 'ACTIVE'`];
  const bindings = [];
  let bindIdx = 1;

  if (category) {
    conditions.push(`p.category_id = $${bindIdx++}`);
    bindings.push(category);
  }
  if (brand) {
    conditions.push(`p.brand_id = $${bindIdx++}`);
    bindings.push(brand);
  }
  if (origin) {
    conditions.push(`p.origin = $${bindIdx++}`);
    bindings.push(origin);
  }
  if (grade) {
    conditions.push(`p.quality_grade = $${bindIdx++}`);
    bindings.push(grade);
  }
  if (priceMin !== undefined) {
    conditions.push(`p.retail_price_cents >= $${bindIdx++}`);
    bindings.push(priceMin);
  }
  if (priceMax !== undefined) {
    conditions.push(`p.retail_price_cents <= $${bindIdx++}`);
    bindings.push(priceMax);
  }
  if (vehicleId) {
    conditions.push(`EXISTS (SELECT 1 FROM product_fitments pf WHERE pf.product_id = p.id AND pf.vehicle_id = $${bindIdx++})`);
    bindings.push(vehicleId);
  }
  if (cursor) {
    conditions.push(`p.created_at < $${bindIdx++}`);
    bindings.push(new Date(Buffer.from(cursor, 'base64').toString()));
  }

  // Text search conditions
  let relevanceExpr = '1';
  if (cleanQuery) {
    if (isPartNum) {
      const norm = normalizePartNumber(cleanQuery);
      conditions.push(`EXISTS (
        SELECT 1 FROM part_numbers pn
        WHERE pn.product_id = p.id
        AND (pn.normalized = $${bindIdx} OR pn.normalized LIKE $${bindIdx + 1})
      )`);
      bindings.push(norm, `${norm}%`);
      bindIdx += 2;
    } else {
      // Trigram similarity on name
      conditions.push(`(
        p.search_vector @@ plainto_tsquery('english', $${bindIdx})
        OR p.name % $${bindIdx + 1}
        OR p.name ILIKE $${bindIdx + 2}
      )`);
      bindings.push(cleanQuery, cleanQuery, `%${cleanQuery}%`);
      relevanceExpr = `ts_rank(p.search_vector, plainto_tsquery('english', '${cleanQuery.replace(/'/g, "''")}'))`;
      bindIdx += 3;
    }
  }

  // Order by
  const orderMap = {
    relevance: `${relevanceExpr} DESC, p.created_at DESC`,
    price_asc:  'p.retail_price_cents ASC',
    price_desc: 'p.retail_price_cents DESC',
    name_asc:   'p.name ASC',
    newest:     'p.created_at DESC',
  };
  const orderBy = orderMap[sort] || orderMap.relevance;

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT p.*,
           b.id AS brand_id_rel, b.name AS brand_name, b.slug AS brand_slug,
           c.id AS cat_id_rel,   c.name AS cat_name,   c.slug AS cat_slug
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    ${where}
    ORDER BY ${orderBy}
    LIMIT $${bindIdx}
  `;
  bindings.push(limit + 1); // fetch one extra to detect next page

  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(sql, ...bindings);
  } catch (e) {
    // Graceful fallback if tsvector/pg_trgm not installed yet
    console.warn('[search] FTS unavailable, falling back to ILIKE:', e.message);
    rows = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(cleanQuery ? { name: { contains: cleanQuery, mode: 'insensitive' } } : {}),
        ...(category ? { categoryId: category } : {}),
        ...(brand ? { brandId: brand } : {}),
      },
      include: { brand: true, category: true, partNumbers: true, media: true, fitments: true },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    });
  }

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  // Enrich rows with relations if coming from raw query
  const products = await Promise.all(rows.map(async r => {
    if (r.partNumbers) return r; // already enriched (Prisma fallback)
    return prisma.product.findUnique({
      where: { id: r.id },
      include: { brand: true, category: true, partNumbers: true, media: true, fitments: true },
    });
  }));

  const nextCursor = hasMore && products.length > 0
    ? Buffer.from(products[products.length - 1].createdAt.toISOString()).toString('base64')
    : null;

  return { products: products.filter(Boolean), nextCursor, limit };
}

// ── Autocomplete suggestions ───────────────────────────────────────────────────

/**
 * Returns up to 10 autocomplete suggestions for the given prefix.
 * Searches product names + part numbers.
 */
export async function suggest(prefix) {
  if (!prefix || prefix.length < 2) return [];

  const [names, partNums] = await Promise.all([
    prisma.$queryRaw`
      SELECT DISTINCT name AS suggestion, 'product' AS type
      FROM products
      WHERE status = 'ACTIVE'
        AND name ILIKE ${prefix + '%'}
      LIMIT 6
    `.catch(() => []),
    prisma.$queryRaw`
      SELECT DISTINCT number AS suggestion, 'part_number' AS type
      FROM part_numbers
      WHERE normalized ILIKE ${normalizePartNumber(prefix) + '%'}
      LIMIT 4
    `.catch(() => []),
  ]);

  return [...names, ...partNums].slice(0, 10);
}

// ── Search indexer (called by outbox consumer) ────────────────────────────────

/**
 * Update the search_vector for changed products.
 * Called by the search-index BullMQ worker.
 */
export async function reindexProducts(productIds) {
  for (const id of productIds) {
    try {
      await prisma.$executeRaw`
        UPDATE products p
        SET search_vector =
          setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(p.sku, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(
            (SELECT string_agg(pn.number, ' ') FROM part_numbers pn WHERE pn.product_id = p.id), ''
          )), 'A') ||
          setweight(to_tsvector('english', coalesce(
            (SELECT b.name FROM brands b WHERE b.id = p.brand_id), ''
          )), 'B') ||
          setweight(to_tsvector('english', coalesce(
            (SELECT c.name FROM categories c WHERE c.id = p.category_id), ''
          )), 'B') ||
          setweight(to_tsvector('english', coalesce(p.description, '')), 'C')
        WHERE p.id = ${id}::uuid
      `;
    } catch (e) {
      console.error(`[search] Failed to reindex product ${id}:`, e.message);
    }
  }
}
