import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bwipjs from 'bwip-js';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 4200);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BUILD = 'oak-lounge-inventory-v4.1-operations';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function n(value, fallback = null) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}
function r(value, places = 3) {
  const x = n(value);
  if (x === null) return null;
  const f = 10 ** places;
  return Math.round((x + Number.EPSILON) * f) / f;
}
function clean(value) {
  return String(value ?? '').trim();
}
function slugSku(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function displayUnitFor(trackingType) {
  return trackingType === 'weight' ? 'kg' : trackingType === 'volume' ? 'L' : 'each';
}
function baseUnitFor(trackingType) {
  return trackingType === 'weight' ? 'g' : trackingType === 'volume' ? 'ml' : 'each';
}
function toBase(product, quantity, unit = null) {
  const q = n(quantity);
  if (q === null) throw Object.assign(new Error('Quantity must be numeric'), { status: 400 });
  const u = unit || product.display_unit;
  if (product.base_unit === 'g') {
    if (u === 'kg') return q * 1000;
    if (u === 'g') return q;
  }
  if (product.base_unit === 'ml') {
    if (u === 'L' || u === 'l') return q * 1000;
    if (u === 'ml') return q;
  }
  if (product.base_unit === 'each') {
    if (['each', 'piece', 'pieces', 'pcs'].includes(String(u).toLowerCase())) return q;
  }
  throw Object.assign(new Error(`Unit ${u} is not valid for ${product.name}`), { status: 400 });
}
function fromBase(product, qty) {
  const q = n(qty, 0);
  if (product.base_unit === 'g' && product.display_unit === 'kg') return q / 1000;
  if (product.base_unit === 'ml' && product.display_unit === 'L') return q / 1000;
  return q;
}
function qtyText(product, baseQty) {
  const value = fromBase(product, baseQty);
  const digits = product.base_unit === 'each' ? 0 : 2;
  return `${Number(value).toFixed(digits)} ${product.display_unit}`;
}

async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SEQUENCE IF NOT EXISTS oak_inv_barcode_seq START 100000;

    CREATE TABLE IF NOT EXISTS oak_inv_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      category_id UUID REFERENCES oak_inv_categories(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category_id UUID NOT NULL REFERENCES oak_inv_categories(id) ON DELETE RESTRICT,
      subcategory TEXT,
      tracking_type TEXT NOT NULL CHECK (tracking_type IN ('weight','volume','count')),
      base_unit TEXT NOT NULL CHECK (base_unit IN ('g','ml','each')),
      display_unit TEXT NOT NULL CHECK (display_unit IN ('kg','g','L','ml','each')),
      reorder_point_base NUMERIC(16,4) NOT NULL DEFAULT 0,
      par_level_base NUMERIC(16,4) NOT NULL DEFAULT 0,
      avg_cost_per_base NUMERIC(16,8) NOT NULL DEFAULT 0,
      internal_barcode TEXT UNIQUE,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      qty_base NUMERIC(16,4) NOT NULL CHECK (qty_base > 0),
      preferred BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(product_id, label)
    );

    CREATE TABLE IF NOT EXISTS oak_inv_barcodes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      barcode TEXT NOT NULL UNIQUE,
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE CASCADE,
      pack_id UUID REFERENCES oak_inv_packs(id) ON DELETE CASCADE,
      barcode_type TEXT NOT NULL DEFAULT 'supplier' CHECK (barcode_type IN ('internal','supplier','pack')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id UUID REFERENCES oak_inv_suppliers(id) ON DELETE SET NULL,
      location_id UUID REFERENCES oak_inv_locations(id) ON DELETE SET NULL,
      reference TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes TEXT,
      total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_receipt_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID NOT NULL REFERENCES oak_inv_receipts(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE RESTRICT,
      pack_id UUID REFERENCES oak_inv_packs(id) ON DELETE SET NULL,
      pack_count NUMERIC(12,3),
      quantity_base NUMERIC(16,4) NOT NULL CHECK (quantity_base > 0),
      cost_per_pack NUMERIC(14,2),
      total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
      unit_cost_per_base NUMERIC(16,8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_movements (
      id BIGSERIAL PRIMARY KEY,
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE RESTRICT,
      location_id UUID REFERENCES oak_inv_locations(id) ON DELETE SET NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','waste','sale','adjustment','transfer_in','transfer_out')),
      quantity_delta_base NUMERIC(16,4) NOT NULL,
      unit_cost_per_base NUMERIC(16,8) NOT NULL DEFAULT 0,
      total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_ai_audit (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      prompt TEXT,
      proposal JSONB,
      approved_by TEXT,
      product_id UUID REFERENCES oak_inv_products(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE oak_inv_movements ADD COLUMN IF NOT EXISTS actor TEXT;
    ALTER TABLE oak_inv_movements ADD COLUMN IF NOT EXISTS reason_code TEXT;
    ALTER TABLE oak_inv_movements DROP CONSTRAINT IF EXISTS oak_inv_movements_movement_type_check;
    ALTER TABLE oak_inv_movements ADD CONSTRAINT oak_inv_movements_movement_type_check
      CHECK (movement_type IN ('purchase','waste','sale','adjustment','transfer_in','transfer_out','use','breakage','staff_use','return'));

    CREATE TABLE IF NOT EXISTS oak_inv_stock_counts (
      id BIGSERIAL PRIMARY KEY,
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE RESTRICT,
      location_id UUID REFERENCES oak_inv_locations(id) ON DELETE SET NULL,
      expected_base NUMERIC(16,4) NOT NULL,
      counted_base NUMERIC(16,4) NOT NULL,
      variance_base NUMERIC(16,4) NOT NULL,
      note TEXT,
      counted_by TEXT,
      counted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES oak_inv_products(id) ON DELETE RESTRICT,
      from_location_id UUID NOT NULL REFERENCES oak_inv_locations(id) ON DELETE RESTRICT,
      to_location_id UUID NOT NULL REFERENCES oak_inv_locations(id) ON DELETE RESTRICT,
      quantity_base NUMERIC(16,4) NOT NULL CHECK (quantity_base > 0),
      note TEXT,
      moved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_inv_audit (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      actor TEXT,
      product_id UUID REFERENCES oak_inv_products(id) ON DELETE SET NULL,
      location_id UUID REFERENCES oak_inv_locations(id) ON DELETE SET NULL,
      reference_type TEXT,
      reference_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS oak_inv_movements_product_idx ON oak_inv_movements(product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_movements_location_idx ON oak_inv_movements(location_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_receipts_date_idx ON oak_inv_receipts(received_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_barcodes_product_idx ON oak_inv_barcodes(product_id);
    CREATE INDEX IF NOT EXISTS oak_inv_stock_counts_product_idx ON oak_inv_stock_counts(product_id, counted_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_stock_counts_location_idx ON oak_inv_stock_counts(location_id, counted_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_audit_date_idx ON oak_inv_audit(created_at DESC);
    CREATE INDEX IF NOT EXISTS oak_inv_transfers_date_idx ON oak_inv_transfers(created_at DESC);
  `);

  await pool.query(`
    INSERT INTO oak_inv_categories(name, code, sort_order) VALUES
      ('Kitchen','KITCHEN',10),
      ('Bar','BAR',20),
      ('Shisha','SHISHA',30),
      ('General','GENERAL',90)
    ON CONFLICT (code) DO NOTHING;
  `);
  await pool.query(`
    INSERT INTO oak_inv_locations(name, code, category_id)
    SELECT 'Kitchen Store','KITCHEN_STORE',id FROM oak_inv_categories WHERE code='KITCHEN'
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO oak_inv_locations(name, code, category_id)
    SELECT 'Kitchen Fridge','KITCHEN_FRIDGE',id FROM oak_inv_categories WHERE code='KITCHEN'
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO oak_inv_locations(name, code, category_id)
    SELECT 'Bar Store','BAR_STORE',id FROM oak_inv_categories WHERE code='BAR'
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO oak_inv_locations(name, code, category_id)
    SELECT 'Shisha Store','SHISHA_STORE',id FROM oak_inv_categories WHERE code='SHISHA'
    ON CONFLICT (code) DO NOTHING;
  `);
}

async function nextBarcode() {
  const { rows } = await pool.query(`SELECT nextval('oak_inv_barcode_seq')::bigint AS n`);
  return `OAK${String(rows[0].n).padStart(9, '0')}`;
}

async function categories() {
  const { rows } = await pool.query(`SELECT * FROM oak_inv_categories WHERE active=TRUE ORDER BY sort_order, name`);
  return rows;
}
async function locations() {
  const { rows } = await pool.query(`
    SELECT l.*, c.name AS category_name
    FROM oak_inv_locations l LEFT JOIN oak_inv_categories c ON c.id=l.category_id
    WHERE l.active=TRUE ORDER BY c.sort_order NULLS LAST, l.name
  `);
  return rows;
}
async function suppliers() {
  const { rows } = await pool.query(`SELECT * FROM oak_inv_suppliers WHERE active=TRUE ORDER BY name`);
  return rows;
}

async function stockAtLocation(client, productId, locationId) {
  const q = locationId
    ? `SELECT COALESCE(SUM(quantity_delta_base),0) AS q FROM oak_inv_movements WHERE product_id=$1 AND location_id=$2`
    : `SELECT COALESCE(SUM(quantity_delta_base),0) AS q FROM oak_inv_movements WHERE product_id=$1`;
  const args = locationId ? [productId, locationId] : [productId];
  const { rows } = await client.query(q, args);
  return n(rows[0]?.q, 0);
}

async function recordAudit(client, { action, actor='Oak Admin', productId=null, locationId=null, referenceType=null, referenceId=null, details={} }) {
  await client.query(`
    INSERT INTO oak_inv_audit(action,actor,product_id,location_id,reference_type,reference_id,details)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
  `, [action, clean(actor)||'Oak Admin', productId, locationId, referenceType, referenceId, JSON.stringify(details||{})]);
}

async function locationStockRows() {
  const { rows } = await pool.query(`
    SELECT p.id AS product_id,p.name,p.sku,p.base_unit,p.display_unit,p.avg_cost_per_base,
           p.reorder_point_base,c.name AS category_name,c.code AS category_code,
           l.id AS location_id,l.name AS location_name,l.code AS location_code,
           COALESCE(SUM(m.quantity_delta_base),0) AS stock_base
    FROM oak_inv_products p
    JOIN oak_inv_categories c ON c.id=p.category_id
    CROSS JOIN oak_inv_locations l
    LEFT JOIN oak_inv_movements m ON m.product_id=p.id AND m.location_id=l.id
    WHERE p.active=TRUE AND l.active=TRUE
    GROUP BY p.id,c.name,c.code,c.sort_order,l.id,l.name,l.code
    HAVING COALESCE(SUM(m.quantity_delta_base),0) <> 0
       OR EXISTS (SELECT 1 FROM oak_inv_stock_counts sc WHERE sc.product_id=p.id AND sc.location_id=l.id)
    ORDER BY c.sort_order,p.name,l.name
  `);
  return rows.map(x=>{
    const stockBase=n(x.stock_base,0);
    const display=x.base_unit==='g'&&x.display_unit==='kg'?stockBase/1000:x.base_unit==='ml'&&x.display_unit==='L'?stockBase/1000:stockBase;
    return {...x,stock_base:r(stockBase,3),stock_display:r(display,x.base_unit==='each'?0:3),stock_value:r(stockBase*n(x.avg_cost_per_base,0),2)};
  });
}

async function operationsPayload() {
  const [dash, locationStock] = await Promise.all([dashboard(), locationStockRows()]);
  const { rows: movements } = await pool.query(`
    SELECT m.id,m.movement_type,m.quantity_delta_base,m.total_value,m.note,m.reason_code,m.actor,m.created_at,
           p.id AS product_id,p.name AS product_name,p.sku,p.base_unit,p.display_unit,c.name AS category_name,
           l.id AS location_id,l.name AS location_name
    FROM oak_inv_movements m
    JOIN oak_inv_products p ON p.id=m.product_id
    JOIN oak_inv_categories c ON c.id=p.category_id
    LEFT JOIN oak_inv_locations l ON l.id=m.location_id
    ORDER BY m.created_at DESC LIMIT 80
  `);
  const { rows: counts } = await pool.query(`
    SELECT sc.*,p.name AS product_name,p.sku,p.base_unit,p.display_unit,c.name AS category_name,l.name AS location_name
    FROM oak_inv_stock_counts sc
    JOIN oak_inv_products p ON p.id=sc.product_id
    JOIN oak_inv_categories c ON c.id=p.category_id
    LEFT JOIN oak_inv_locations l ON l.id=sc.location_id
    ORDER BY sc.counted_at DESC LIMIT 50
  `);
  const { rows: audits } = await pool.query(`
    SELECT a.*,p.name AS product_name,p.sku,l.name AS location_name
    FROM oak_inv_audit a
    LEFT JOIN oak_inv_products p ON p.id=a.product_id
    LEFT JOIN oak_inv_locations l ON l.id=a.location_id
    ORDER BY a.created_at DESC LIMIT 80
  `);
  const { rows: sums } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN movement_type='waste' AND created_at>=now()-interval '30 days' THEN abs(total_value) ELSE 0 END),0) AS waste_value_30d,
      COALESCE(SUM(CASE WHEN movement_type='breakage' AND created_at>=now()-interval '30 days' THEN abs(total_value) ELSE 0 END),0) AS breakage_value_30d,
      COALESCE(SUM(CASE WHEN movement_type='staff_use' AND created_at>=now()-interval '30 days' THEN abs(total_value) ELSE 0 END),0) AS staff_use_value_30d,
      COALESCE(SUM(CASE WHEN movement_type='adjustment' AND created_at>=now()-interval '30 days' THEN abs(total_value) ELSE 0 END),0) AS adjustment_value_30d
    FROM oak_inv_movements
  `);
  const movementRows=movements.map(x=>{
    const base=n(x.quantity_delta_base,0);
    const display=x.base_unit==='g'&&x.display_unit==='kg'?base/1000:x.base_unit==='ml'&&x.display_unit==='L'?base/1000:base;
    return {...x,quantity_delta_base:r(base,3),quantity_display:r(display,x.base_unit==='each'?0:3),total_value:r(n(x.total_value,0),2)};
  });
  const countRows=counts.map(x=>{
    const factor=x.base_unit==='g'&&x.display_unit==='kg'?1/1000:x.base_unit==='ml'&&x.display_unit==='L'?1/1000:1;
    return {...x,expected_display:r(n(x.expected_base,0)*factor,x.base_unit==='each'?0:3),counted_display:r(n(x.counted_base,0)*factor,x.base_unit==='each'?0:3),variance_display:r(n(x.variance_base,0)*factor,x.base_unit==='each'?0:3)};
  });
  return {
    ...dash,
    operations_summary:{
      waste_value_30d:r(n(sums[0]?.waste_value_30d,0),2),
      breakage_value_30d:r(n(sums[0]?.breakage_value_30d,0),2),
      staff_use_value_30d:r(n(sums[0]?.staff_use_value_30d,0),2),
      adjustment_value_30d:r(n(sums[0]?.adjustment_value_30d,0),2)
    },
    location_stock:locationStock,
    recent_movements:movementRows,
    recent_stock_counts:countRows,
    audit_log:audits
  };
}

async function productRows(where = '', params = []) {
  const { rows } = await pool.query(`
    WITH stock AS (
      SELECT product_id, COALESCE(SUM(quantity_delta_base),0) AS stock_base
      FROM oak_inv_movements GROUP BY product_id
    ), spend30 AS (
      SELECT rl.product_id, COALESCE(SUM(rl.total_cost),0) AS spend_30d
      FROM oak_inv_receipt_lines rl JOIN oak_inv_receipts r ON r.id=rl.receipt_id
      WHERE r.received_at >= now() - interval '30 days'
      GROUP BY rl.product_id
    )
    SELECT p.*, c.name AS category_name, c.code AS category_code,
           COALESCE(s.stock_base,0) AS stock_base,
           COALESCE(sp.spend_30d,0) AS spend_30d
    FROM oak_inv_products p
    JOIN oak_inv_categories c ON c.id=p.category_id
    LEFT JOIN stock s ON s.product_id=p.id
    LEFT JOIN spend30 sp ON sp.product_id=p.id
    ${where}
    ORDER BY c.sort_order, p.name
  `, params);
  if (!rows.length) return [];
  const ids = rows.map(x => x.id);
  const { rows: packs } = await pool.query(`SELECT * FROM oak_inv_packs WHERE active=TRUE AND product_id = ANY($1::uuid[]) ORDER BY preferred DESC, qty_base`, [ids]);
  const { rows: barcodes } = await pool.query(`SELECT * FROM oak_inv_barcodes WHERE active=TRUE AND product_id = ANY($1::uuid[]) ORDER BY barcode_type, created_at`, [ids]);
  return rows.map(p => {
    const stockBase = n(p.stock_base, 0);
    const reorderBase = n(p.reorder_point_base, 0);
    return {
      ...p,
      stock_base: r(stockBase, 3),
      stock_display: r(fromBase(p, stockBase), p.base_unit === 'each' ? 0 : 3),
      reorder_display: r(fromBase(p, reorderBase), p.base_unit === 'each' ? 0 : 3),
      par_display: r(fromBase(p, n(p.par_level_base, 0)), p.base_unit === 'each' ? 0 : 3),
      avg_cost_per_base: n(p.avg_cost_per_base, 0),
      stock_value: r(stockBase * n(p.avg_cost_per_base, 0), 2),
      low_stock: stockBase <= reorderBase,
      status: stockBase <= 0 ? 'OUT' : stockBase <= reorderBase ? 'LOW' : 'OK',
      spend_30d: r(n(p.spend_30d, 0), 2),
      packs: packs.filter(x => x.product_id === p.id).map(x => ({ ...x, qty_base: n(x.qty_base, 0), qty_display: r(fromBase(p, x.qty_base), p.base_unit === 'each' ? 0 : 3) })),
      barcodes: barcodes.filter(x => x.product_id === p.id)
    };
  });
}

async function dashboard() {
  const products = await productRows(`WHERE p.active=TRUE`);
  const cats = await categories();
  const locs = await locations();
  const supps = await suppliers();
  const { rows: receiptRows } = await pool.query(`
    SELECT r.id, r.reference, r.received_at, r.total_cost, s.name AS supplier_name, l.name AS location_name,
           COUNT(rl.id)::int AS line_count
    FROM oak_inv_receipts r
    LEFT JOIN oak_inv_suppliers s ON s.id=r.supplier_id
    LEFT JOIN oak_inv_locations l ON l.id=r.location_id
    LEFT JOIN oak_inv_receipt_lines rl ON rl.receipt_id=r.id
    GROUP BY r.id, s.name, l.name
    ORDER BY r.received_at DESC LIMIT 20
  `);
  const { rows: monthRows } = await pool.query(`SELECT COALESCE(SUM(total_cost),0) AS total FROM oak_inv_receipts WHERE received_at >= date_trunc('month', now())`);
  const inventoryValue = products.reduce((a, p) => a + n(p.stock_value, 0), 0);
  const catSummary = cats.map(c => {
    const pp = products.filter(p => p.category_id === c.id);
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      product_count: pp.length,
      low_stock_count: pp.filter(p => p.low_stock).length,
      stock_value: r(pp.reduce((a, p) => a + n(p.stock_value, 0), 0), 2),
      spend_30d: r(pp.reduce((a, p) => a + n(p.spend_30d, 0), 0), 2)
    };
  });
  return {
    build: BUILD,
    summary: {
      product_count: products.length,
      low_stock_count: products.filter(p => p.low_stock).length,
      inventory_value: r(inventoryValue, 2),
      purchase_spend_month: r(n(monthRows[0].total, 0), 2),
      category_count: cats.length,
      supplier_count: supps.length
    },
    categories: cats,
    category_summary: catSummary,
    locations: locs,
    suppliers: supps,
    products,
    recent_receipts: receiptRows.map(x => ({ ...x, total_cost: n(x.total_cost, 0) }))
  };
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'oak-inventory-api', build: BUILD });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, build: BUILD });
  }
});
app.get('/dashboard', async (_req, res, next) => { try { res.json(await dashboard()); } catch (e) { next(e); } });
app.get('/operations', async (_req, res, next) => { try { res.json(await operationsPayload()); } catch (e) { next(e); } });
app.get('/categories', async (_req, res, next) => { try { res.json(await categories()); } catch (e) { next(e); } });
app.get('/locations', async (_req, res, next) => { try { res.json(await locations()); } catch (e) { next(e); } });
app.get('/suppliers', async (_req, res, next) => { try { res.json(await suppliers()); } catch (e) { next(e); } });
app.get('/products', async (req, res, next) => {
  try {
    const params = [];
    const filters = ['p.active=TRUE'];
    if (req.query.category_id) { params.push(req.query.category_id); filters.push(`p.category_id=$${params.length}`); }
    if (req.query.q) { params.push(`%${clean(req.query.q)}%`); filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.subcategory ILIKE $${params.length})`); }
    res.json(await productRows(`WHERE ${filters.join(' AND ')}`, params));
  } catch (e) { next(e); }
});
app.get('/products/:id', async (req, res, next) => {
  try {
    const rows = await productRows(`WHERE p.id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    const { rows: ledger } = await pool.query(`
      SELECT m.*, l.name AS location_name
      FROM oak_inv_movements m LEFT JOIN oak_inv_locations l ON l.id=m.location_id
      WHERE m.product_id=$1 ORDER BY m.created_at DESC LIMIT 100
    `, [req.params.id]);
    res.json({ product: rows[0], ledger: ledger.map(x => ({ ...x, quantity_delta_base: n(x.quantity_delta_base, 0), total_value: n(x.total_value, 0) })) });
  } catch (e) { next(e); }
});

app.post('/categories', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const code = slugSku(req.body.code || name);
    const { rows } = await pool.query(`INSERT INTO oak_inv_categories(name,code,sort_order) VALUES($1,$2,$3) RETURNING *`, [name, code, n(req.body.sort_order, 100)]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.post('/locations', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    if (!name) return res.status(400).json({ error: 'Location name is required' });
    const code = slugSku(req.body.code || name);
    const { rows } = await pool.query(`INSERT INTO oak_inv_locations(name,code,category_id) VALUES($1,$2,$3) RETURNING *`, [name, code, req.body.category_id || null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
app.post('/suppliers', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const { rows } = await pool.query(`INSERT INTO oak_inv_suppliers(name,contact_name,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING *`, [name, clean(req.body.contact_name) || null, clean(req.body.phone) || null, clean(req.body.email) || null, clean(req.body.notes) || null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});


app.patch('/categories/:id', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query(`SELECT * FROM oak_inv_categories WHERE id=$1`, [req.params.id]);
    const current = found[0];
    if (!current) return res.status(404).json({ error: 'Category not found' });
    const name = req.body.name == null ? current.name : clean(req.body.name);
    const code = req.body.code == null ? current.code : slugSku(req.body.code || name);
    const sortOrder = req.body.sort_order == null ? current.sort_order : n(req.body.sort_order, current.sort_order);
    if (!name || !code) return res.status(400).json({ error: 'Category name and code are required' });
    const { rows } = await pool.query(`UPDATE oak_inv_categories SET name=$1,code=$2,sort_order=$3 WHERE id=$4 RETURNING *`, [name, code, sortOrder, req.params.id]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.patch('/suppliers/:id', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query(`SELECT * FROM oak_inv_suppliers WHERE id=$1`, [req.params.id]);
    const current = found[0];
    if (!current) return res.status(404).json({ error: 'Supplier not found' });
    const name = req.body.name == null ? current.name : clean(req.body.name);
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const { rows } = await pool.query(`
      UPDATE oak_inv_suppliers SET name=$1,contact_name=$2,phone=$3,email=$4,notes=$5,updated_at=now()
      WHERE id=$6 RETURNING *
    `, [
      name,
      req.body.contact_name == null ? current.contact_name : clean(req.body.contact_name) || null,
      req.body.phone == null ? current.phone : clean(req.body.phone) || null,
      req.body.email == null ? current.email : clean(req.body.email) || null,
      req.body.notes == null ? current.notes : clean(req.body.notes) || null,
      req.params.id
    ]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.patch('/locations/:id', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query(`SELECT * FROM oak_inv_locations WHERE id=$1`, [req.params.id]);
    const current = found[0];
    if (!current) return res.status(404).json({ error: 'Location not found' });
    const name = req.body.name == null ? current.name : clean(req.body.name);
    const code = req.body.code == null ? current.code : slugSku(req.body.code || name);
    const categoryId = req.body.category_id === undefined ? current.category_id : (req.body.category_id || null);
    if (!name || !code) return res.status(400).json({ error: 'Location name and code are required' });
    const { rows } = await pool.query(`UPDATE oak_inv_locations SET name=$1,code=$2,category_id=$3 WHERE id=$4 RETURNING *`, [name, code, categoryId, req.params.id]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.post('/products', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const name = clean(req.body.name);
    const sku = slugSku(req.body.sku || name);
    const trackingType = clean(req.body.tracking_type || 'weight');
    if (!name || !sku || !req.body.category_id) throw Object.assign(new Error('Name, SKU and category are required'), { status: 400 });
    if (!['weight','volume','count'].includes(trackingType)) throw Object.assign(new Error('Invalid tracking type'), { status: 400 });
    const baseUnit = baseUnitFor(trackingType);
    const displayUnit = req.body.display_unit || displayUnitFor(trackingType);
    const pseudo = { name, base_unit: baseUnit, display_unit: displayUnit };
    const reorderBase = toBase(pseudo, n(req.body.reorder_point, 0), displayUnit);
    const parBase = toBase(pseudo, n(req.body.par_level, 0), displayUnit);
    const barcode = clean(req.body.internal_barcode) || await nextBarcode();
    const { rows } = await client.query(`
      INSERT INTO oak_inv_products(sku,name,category_id,subcategory,tracking_type,base_unit,display_unit,reorder_point_base,par_level_base,internal_barcode,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [sku, name, req.body.category_id, clean(req.body.subcategory) || null, trackingType, baseUnit, displayUnit, reorderBase, parBase, barcode, clean(req.body.notes) || null]);
    const p = rows[0];
    await client.query(`INSERT INTO oak_inv_barcodes(barcode,product_id,barcode_type) VALUES($1,$2,'internal')`, [barcode, p.id]);
    if (clean(req.body.pack_label) && n(req.body.pack_quantity) > 0) {
      const packBase = toBase(p, req.body.pack_quantity, req.body.pack_unit || displayUnit);
      await client.query(`INSERT INTO oak_inv_packs(product_id,label,qty_base,preferred) VALUES($1,$2,$3,TRUE)`, [p.id, clean(req.body.pack_label), packBase]);
    }
    await recordAudit(client,{action:'create_product',actor:clean(req.body.actor)||'Oak Admin',productId:p.id,details:{name:p.name,sku:p.sku,category_id:p.category_id}});
    await client.query('COMMIT');
    const fresh = await productRows(`WHERE p.id=$1`, [p.id]);
    res.status(201).json(fresh[0]);
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

app.patch('/products/:id', async (req, res, next) => {
  try {
    const current = (await productRows(`WHERE p.id=$1`, [req.params.id]))[0];
    if (!current) return res.status(404).json({ error: 'Product not found' });

    const name = req.body.name == null ? current.name : clean(req.body.name);
    const sku = req.body.sku == null ? current.sku : slugSku(req.body.sku);
    const categoryId = req.body.category_id || current.category_id;
    const subcategory = req.body.subcategory == null ? current.subcategory : clean(req.body.subcategory) || null;
    const displayUnit = req.body.display_unit == null ? current.display_unit : clean(req.body.display_unit);
    const allowedUnits = current.base_unit === 'g' ? ['kg','g'] : current.base_unit === 'ml' ? ['L','ml'] : ['each'];
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (!sku) return res.status(400).json({ error: 'SKU is required' });
    if (!allowedUnits.includes(displayUnit)) return res.status(400).json({ error: `Display unit ${displayUnit} is not compatible with this product` });

    // Tracking type/base unit is intentionally immutable once a product exists so
    // historical purchase and stock movement quantities keep the same meaning.
    const pseudo = { ...current, display_unit: displayUnit };
    const reorderBase = req.body.reorder_point == null ? n(current.reorder_point_base, 0) : toBase(pseudo, req.body.reorder_point, displayUnit);
    const parBase = req.body.par_level == null ? n(current.par_level_base, 0) : toBase(pseudo, req.body.par_level, displayUnit);
    const active = req.body.active == null ? current.active : Boolean(req.body.active);
    const notes = req.body.notes == null ? current.notes : clean(req.body.notes) || null;

    await pool.query(`
      UPDATE oak_inv_products
      SET sku=$1,name=$2,category_id=$3,subcategory=$4,display_unit=$5,
          reorder_point_base=$6,par_level_base=$7,active=$8,notes=$9,updated_at=now()
      WHERE id=$10
    `, [sku, name, categoryId, subcategory, displayUnit, reorderBase, parBase, active, notes, req.params.id]);
    await recordAudit(pool,{action:'edit_product',actor:clean(req.body.actor)||'Oak Admin',productId:req.params.id,details:{before:{name:current.name,sku:current.sku,category_id:current.category_id,display_unit:current.display_unit,reorder_point_base:current.reorder_point_base,par_level_base:current.par_level_base,active:current.active},after:{name,sku,category_id:categoryId,display_unit:displayUnit,reorder_point_base:reorderBase,par_level_base:parBase,active}}});
    res.json((await productRows(`WHERE p.id=$1`, [req.params.id]))[0]);
  } catch (e) { next(e); }
});

app.post('/products/:id/packs', async (req, res, next) => {
  try {
    const product = (await productRows(`WHERE p.id=$1`, [req.params.id]))[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const label = clean(req.body.label);
    if (!label) return res.status(400).json({ error: 'Pack label is required' });
    const qtyBase = toBase(product, req.body.quantity, req.body.unit || product.display_unit);
    const { rows } = await pool.query(`INSERT INTO oak_inv_packs(product_id,label,qty_base,preferred) VALUES($1,$2,$3,$4) RETURNING *`, [product.id, label, qtyBase, Boolean(req.body.preferred)]);
    if (clean(req.body.barcode)) await pool.query(`INSERT INTO oak_inv_barcodes(barcode,product_id,pack_id,barcode_type) VALUES($1,$2,$3,'pack')`, [clean(req.body.barcode), product.id, rows[0].id]);
    await recordAudit(pool,{action:'add_pack',actor:clean(req.body.actor)||'Oak Admin',productId:product.id,referenceType:'pack',referenceId:String(rows[0].id),details:{label,qty_base:qtyBase,barcode:clean(req.body.barcode)||null}});
    res.status(201).json((await productRows(`WHERE p.id=$1`, [product.id]))[0]);
  } catch (e) { next(e); }
});

app.post('/products/:id/barcodes', async (req, res, next) => {
  try {
    const barcode = clean(req.body.barcode);
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });
    const product = (await productRows(`WHERE p.id=$1`, [req.params.id]))[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const br = await pool.query(`INSERT INTO oak_inv_barcodes(barcode,product_id,pack_id,barcode_type) VALUES($1,$2,$3,$4) RETURNING id`, [barcode, product.id, req.body.pack_id || null, req.body.pack_id ? 'pack' : 'supplier']);
    await recordAudit(pool,{action:'add_barcode',actor:clean(req.body.actor)||'Oak Admin',productId:product.id,referenceType:'barcode',referenceId:String(br.rows[0].id),details:{barcode,pack_id:req.body.pack_id||null}});
    res.status(201).json((await productRows(`WHERE p.id=$1`, [product.id]))[0]);
  } catch (e) { next(e); }
});

app.patch('/products/:productId/packs/:packId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = (await productRows(`WHERE p.id=$1`, [req.params.productId]))[0];
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    const { rows: found } = await client.query(`SELECT * FROM oak_inv_packs WHERE id=$1 AND product_id=$2`, [req.params.packId, product.id]);
    const current = found[0];
    if (!current) throw Object.assign(new Error('Pack not found'), { status: 404 });
    const label = req.body.label == null ? current.label : clean(req.body.label);
    if (!label) throw Object.assign(new Error('Pack label is required'), { status: 400 });
    let qtyBase = n(current.qty_base, 0);
    if (req.body.quantity != null) qtyBase = toBase(product, req.body.quantity, req.body.unit || product.display_unit);
    const preferred = req.body.preferred == null ? current.preferred : Boolean(req.body.preferred);
    if (preferred) await client.query(`UPDATE oak_inv_packs SET preferred=FALSE WHERE product_id=$1 AND id<>$2`, [product.id, current.id]);
    await client.query(`UPDATE oak_inv_packs SET label=$1,qty_base=$2,preferred=$3 WHERE id=$4`, [label, qtyBase, preferred, current.id]);
    await recordAudit(client,{action:'edit_pack',actor:clean(req.body.actor)||'Oak Admin',productId:product.id,referenceType:'pack',referenceId:String(current.id),details:{before:{label:current.label,qty_base:n(current.qty_base,0),preferred:current.preferred},after:{label,qty_base:qtyBase,preferred}}});
    await client.query('COMMIT');
    res.json((await productRows(`WHERE p.id=$1`, [product.id]))[0]);
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

app.patch('/products/:productId/barcodes/:barcodeId', async (req, res, next) => {
  try {
    const { rows: found } = await pool.query(`SELECT * FROM oak_inv_barcodes WHERE id=$1 AND product_id=$2`, [req.params.barcodeId, req.params.productId]);
    const current = found[0];
    if (!current) return res.status(404).json({ error: 'Barcode not found' });
    if (current.barcode_type === 'internal') return res.status(400).json({ error: 'Oak internal barcode is locked. Add a supplier or pack barcode instead.' });
    const barcode = req.body.barcode == null ? current.barcode : clean(req.body.barcode);
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });
    await pool.query(`UPDATE oak_inv_barcodes SET barcode=$1 WHERE id=$2`, [barcode, current.id]);
    await recordAudit(pool,{action:'edit_barcode',actor:clean(req.body.actor)||'Oak Admin',productId:req.params.productId,referenceType:'barcode',referenceId:String(current.id),details:{before:current.barcode,after:barcode}});
    res.json((await productRows(`WHERE p.id=$1`, [req.params.productId]))[0]);
  } catch (e) { next(e); }
});

app.post('/ai/apply-product-proposal', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const proposal = req.body?.proposal || {};
    const input = proposal.product || {};
    const categoryCode = clean(input.category_code).toUpperCase();
    const name = clean(input.name);
    const sku = slugSku(input.sku || name);
    const trackingType = clean(input.tracking_type || 'weight');
    const displayUnit = clean(input.display_unit || displayUnitFor(trackingType));
    if (!name || !sku || !categoryCode) throw Object.assign(new Error('AI proposal requires product name, SKU and category'), { status: 400 });
    if (!['weight','volume','count'].includes(trackingType)) throw Object.assign(new Error('AI proposal has an invalid tracking type'), { status: 400 });

    const allowedUnits = trackingType === 'weight' ? ['kg','g'] : trackingType === 'volume' ? ['L','ml'] : ['each'];
    if (!allowedUnits.includes(displayUnit)) throw Object.assign(new Error(`Display unit ${displayUnit} is not compatible with ${trackingType}`), { status: 400 });

    await client.query('BEGIN');
    const categoryResult = await client.query(`SELECT id,name,code FROM oak_inv_categories WHERE upper(code)=upper($1) AND active=TRUE`, [categoryCode]);
    const category = categoryResult.rows[0];
    if (!category) throw Object.assign(new Error(`Category ${categoryCode} does not exist or is inactive`), { status: 400 });

    const duplicate = await client.query(`SELECT id,name,sku FROM oak_inv_products WHERE upper(sku)=upper($1) OR lower(name)=lower($2) LIMIT 1`, [sku, name]);
    if (duplicate.rows[0]) throw Object.assign(new Error(`A product already exists with this name or SKU: ${duplicate.rows[0].name} (${duplicate.rows[0].sku})`), { status: 409 });

    const baseUnit = baseUnitFor(trackingType);
    const pseudo = { name, base_unit: baseUnit, display_unit: displayUnit };
    const reorderBase = toBase(pseudo, n(input.reorder_point, 0), displayUnit);
    const parBase = toBase(pseudo, n(input.par_level, 0), displayUnit);
    const barcodeResult = await client.query(`SELECT nextval('oak_inv_barcode_seq')::bigint AS n`);
    const barcode = `OAK${String(barcodeResult.rows[0].n).padStart(9, '0')}`;

    const productInsert = await client.query(`
      INSERT INTO oak_inv_products(sku,name,category_id,subcategory,tracking_type,base_unit,display_unit,reorder_point_base,par_level_base,internal_barcode,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [sku, name, category.id, clean(input.subcategory) || null, trackingType, baseUnit, displayUnit, reorderBase, parBase, barcode, clean(input.notes) || null]);
    const product = productInsert.rows[0];
    await client.query(`INSERT INTO oak_inv_barcodes(barcode,product_id,barcode_type) VALUES($1,$2,'internal')`, [barcode, product.id]);

    const packs = Array.isArray(proposal.packs) ? proposal.packs.slice(0, 20) : [];
    let packIndex = 0;
    for (const item of packs) {
      const label = clean(item?.label);
      const qty = n(item?.quantity);
      if (!label || qty === null || qty <= 0) continue;
      const unit = clean(item?.unit || displayUnit);
      const qtyBase = toBase(product, qty, unit);
      await client.query(
        `INSERT INTO oak_inv_packs(product_id,label,qty_base,preferred) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,label) DO NOTHING`,
        [product.id, label, qtyBase, packIndex === 0]
      );
      packIndex += 1;
    }

    const approvedBy=clean(req.body?.approved_by) || 'Oak Admin';
    const audit = await client.query(`
      INSERT INTO oak_inv_ai_audit(action,prompt,proposal,approved_by,product_id)
      VALUES('create_product',$1,$2::jsonb,$3,$4) RETURNING id,created_at
    `, [clean(req.body?.prompt) || null, JSON.stringify(proposal), approvedBy, product.id]);
    await recordAudit(client,{action:'ai_create_product',actor:approvedBy,productId:product.id,referenceType:'ai_audit',referenceId:String(audit.rows[0].id),details:{name:product.name,sku:product.sku,category_code:category.code}});

    await client.query('COMMIT');
    const fresh = (await productRows(`WHERE p.id=$1`, [product.id]))[0];
    res.status(201).json({ ok: true, product: fresh, audit: audit.rows[0], build: BUILD });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

app.get('/ai/audit', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id,a.action,a.prompt,a.approved_by,a.created_at,a.product_id,p.name AS product_name,p.sku
      FROM oak_inv_ai_audit a
      LEFT JOIN oak_inv_products p ON p.id=a.product_id
      ORDER BY a.created_at DESC LIMIT 100
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/scan/:barcode', async (req, res, next) => {
  try {
    const code = clean(req.params.barcode);
    const { rows } = await pool.query(`SELECT product_id, pack_id, barcode, barcode_type FROM oak_inv_barcodes WHERE barcode=$1 AND active=TRUE`, [code]);
    if (!rows[0]) return res.status(404).json({ found: false, barcode: code });
    const product = (await productRows(`WHERE p.id=$1`, [rows[0].product_id]))[0];
    const pack = rows[0].pack_id ? product.packs.find(x => x.id === rows[0].pack_id) : null;
    res.json({ found: true, barcode: code, barcode_type: rows[0].barcode_type, product, pack });
  } catch (e) { next(e); }
});

app.get('/barcode/:code.png', async (req, res, next) => {
  try {
    const code = clean(req.params.code);
    if (!code) return res.status(400).json({ error: 'Barcode is required' });
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: true, textxalign: 'center', paddingwidth: 8, paddingheight: 8 });
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
  } catch (e) { next(e); }
});

app.post('/receipts', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw Object.assign(new Error('At least one received item is required'), { status: 400 });
    await client.query('BEGIN');
    const { rows: receiptRows } = await client.query(`INSERT INTO oak_inv_receipts(supplier_id,location_id,reference,notes,received_at) VALUES($1,$2,$3,$4,COALESCE($5::timestamptz,now())) RETURNING *`, [req.body.supplier_id || null, req.body.location_id || null, clean(req.body.reference) || null, clean(req.body.notes) || null, req.body.received_at || null]);
    const receipt = receiptRows[0];
    let receiptTotal = 0;
    for (const item of items) {
      const products = await client.query(`SELECT * FROM oak_inv_products WHERE id=$1 AND active=TRUE`, [item.product_id]);
      const product = products.rows[0];
      if (!product) throw Object.assign(new Error('Received product not found'), { status: 400 });
      let pack = null;
      let qtyBase = 0;
      let packCount = null;
      let costPerPack = null;
      let totalCost = n(item.total_cost, 0);
      if (item.pack_id) {
        const packRows = await client.query(`SELECT * FROM oak_inv_packs WHERE id=$1 AND product_id=$2 AND active=TRUE`, [item.pack_id, product.id]);
        pack = packRows.rows[0];
        if (!pack) throw Object.assign(new Error(`Pack not found for ${product.name}`), { status: 400 });
        packCount = n(item.pack_count);
        if (packCount === null || packCount <= 0) throw Object.assign(new Error('Pack count must be greater than zero'), { status: 400 });
        qtyBase = n(pack.qty_base, 0) * packCount;
        costPerPack = n(item.cost_per_pack, 0);
        totalCost = r(costPerPack * packCount, 2);
      } else {
        qtyBase = toBase(product, item.quantity, item.unit || product.display_unit);
        if (qtyBase <= 0) throw Object.assign(new Error('Received quantity must be greater than zero'), { status: 400 });
      }
      const unitCost = qtyBase > 0 ? totalCost / qtyBase : 0;
      const stockRows = await client.query(`SELECT COALESCE(SUM(quantity_delta_base),0) AS q FROM oak_inv_movements WHERE product_id=$1`, [product.id]);
      const oldStock = Math.max(0, n(stockRows.rows[0].q, 0));
      const oldCost = n(product.avg_cost_per_base, 0);
      const newAvg = oldStock + qtyBase > 0 ? ((oldStock * oldCost) + totalCost) / (oldStock + qtyBase) : unitCost;
      await client.query(`UPDATE oak_inv_products SET avg_cost_per_base=$1,updated_at=now() WHERE id=$2`, [newAvg, product.id]);
      const { rows: lineRows } = await client.query(`INSERT INTO oak_inv_receipt_lines(receipt_id,product_id,pack_id,pack_count,quantity_base,cost_per_pack,total_cost,unit_cost_per_base) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [receipt.id, product.id, pack?.id || null, packCount, qtyBase, costPerPack, totalCost, unitCost]);
      await client.query(`INSERT INTO oak_inv_movements(product_id,location_id,movement_type,quantity_delta_base,unit_cost_per_base,total_value,reference_type,reference_id,note,actor,reason_code) VALUES($1,$2,'purchase',$3,$4,$5,'receipt',$6,$7,$8,'receiving')`, [product.id, receipt.location_id, qtyBase, unitCost, totalCost, lineRows[0].id, receipt.reference, clean(req.body.actor)||'Oak Admin']);
      receiptTotal += totalCost;
    }
    await client.query(`UPDATE oak_inv_receipts SET total_cost=$1 WHERE id=$2`, [r(receiptTotal, 2), receipt.id]);
    await recordAudit(client,{action:'receive_stock',actor:clean(req.body.actor)||'Oak Admin',locationId:receipt.location_id,referenceType:'receipt',referenceId:String(receipt.id),details:{supplier_id:receipt.supplier_id,reference:receipt.reference,total_cost:r(receiptTotal,2),line_count:items.length}});
    await client.query('COMMIT');
    res.status(201).json(await dashboard());
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

app.post('/stock-counts', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = (await productRows(`WHERE p.id=$1`, [req.body.product_id]))[0];
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    const locationId = req.body.location_id || null;
    if (!locationId) throw Object.assign(new Error('Stock location is required for a physical count'), { status: 400 });
    const countedBase = toBase(product, req.body.quantity, req.body.unit || product.display_unit);
    if (countedBase < 0) throw Object.assign(new Error('Physical count cannot be negative'), { status: 400 });
    const expectedBase = await stockAtLocation(client, product.id, locationId);
    const delta = countedBase - expectedBase;
    const note = clean(req.body.note) || 'Physical stock count';
    const actor = clean(req.body.actor) || 'Oak Admin';
    const countRow = await client.query(`
      INSERT INTO oak_inv_stock_counts(product_id,location_id,expected_base,counted_base,variance_base,note,counted_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [product.id, locationId, expectedBase, countedBase, delta, note, actor]);
    if (Math.abs(delta) > 0.000001) {
      await client.query(`
        INSERT INTO oak_inv_movements(product_id,location_id,movement_type,quantity_delta_base,unit_cost_per_base,total_value,reference_type,reference_id,note,actor,reason_code)
        VALUES($1,$2,'adjustment',$3,$4,$5,'stock_count',$6,$7,$8,'physical_count')
      `, [product.id, locationId, delta, n(product.avg_cost_per_base,0), r(delta*n(product.avg_cost_per_base,0),2), String(countRow.rows[0].id), note, actor]);
    }
    await recordAudit(client,{action:'stock_count',actor,productId:product.id,locationId,referenceType:'stock_count',referenceId:String(countRow.rows[0].id),details:{expected_base:expectedBase,counted_base:countedBase,variance_base:delta,note}});
    await client.query('COMMIT');
    res.json(await operationsPayload());
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

app.post('/operations/movement', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = (await productRows(`WHERE p.id=$1`, [req.body.product_id]))[0];
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    const action = clean(req.body.action);
    const allowed = ['use','waste','breakage','staff_use','return','correction_add','correction_remove'];
    if (!allowed.includes(action)) throw Object.assign(new Error('Invalid stock operation'), { status: 400 });
    const locationId = req.body.location_id || null;
    if (!locationId) throw Object.assign(new Error('Stock location is required for this operation'), { status: 400 });
    let qtyBase = Math.abs(toBase(product, req.body.quantity, req.body.unit || product.display_unit));
    if (!(qtyBase > 0)) throw Object.assign(new Error('Quantity must be greater than zero'), { status: 400 });
    const negative = ['use','waste','breakage','staff_use','correction_remove'].includes(action);
    if (negative) {
      const current = await stockAtLocation(client, product.id, locationId);
      if (qtyBase > current + 0.000001) throw Object.assign(new Error(`Not enough stock. Available: ${qtyText(product,current)}`), { status: 409 });
      qtyBase = -qtyBase;
    }
    const movementType = action.startsWith('correction_') ? 'adjustment' : action;
    const actor = clean(req.body.actor) || 'Oak Admin';
    const note = clean(req.body.note) || null;
    const reasonCode = clean(req.body.reason_code || action) || action;
    const totalValue = r(qtyBase * n(product.avg_cost_per_base,0),2);
    const move = await client.query(`
      INSERT INTO oak_inv_movements(product_id,location_id,movement_type,quantity_delta_base,unit_cost_per_base,total_value,reference_type,note,actor,reason_code)
      VALUES($1,$2,$3,$4,$5,$6,'operation',$7,$8,$9) RETURNING id
    `, [product.id, locationId, movementType, qtyBase, n(product.avg_cost_per_base,0), totalValue, note, actor, reasonCode]);
    await recordAudit(client,{action,actor,productId:product.id,locationId,referenceType:'movement',referenceId:String(move.rows[0].id),details:{quantity_delta_base:qtyBase,note,reason_code:reasonCode}});
    await client.query('COMMIT');
    res.status(201).json(await operationsPayload());
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

app.post('/operations/transfer', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = (await productRows(`WHERE p.id=$1`, [req.body.product_id]))[0];
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
    const fromLocation = req.body.from_location_id;
    const toLocation = req.body.to_location_id;
    if (!fromLocation || !toLocation) throw Object.assign(new Error('From and to locations are required'), { status: 400 });
    if (fromLocation === toLocation) throw Object.assign(new Error('From and to locations must be different'), { status: 400 });
    const qtyBase = Math.abs(toBase(product, req.body.quantity, req.body.unit || product.display_unit));
    if (!(qtyBase > 0)) throw Object.assign(new Error('Quantity must be greater than zero'), { status: 400 });
    const current = await stockAtLocation(client, product.id, fromLocation);
    if (qtyBase > current + 0.000001) throw Object.assign(new Error(`Not enough stock at source location. Available: ${qtyText(product,current)}`), { status: 409 });
    const actor = clean(req.body.actor) || 'Oak Admin';
    const note = clean(req.body.note) || null;
    const transfer = await client.query(`
      INSERT INTO oak_inv_transfers(product_id,from_location_id,to_location_id,quantity_base,note,moved_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id
    `,[product.id,fromLocation,toLocation,qtyBase,note,actor]);
    const id=String(transfer.rows[0].id);
    const unitCost=n(product.avg_cost_per_base,0);
    await client.query(`
      INSERT INTO oak_inv_movements(product_id,location_id,movement_type,quantity_delta_base,unit_cost_per_base,total_value,reference_type,reference_id,note,actor,reason_code)
      VALUES
      ($1,$2,'transfer_out',$4,$5,$6,'transfer',$7,$8,$9,'transfer'),
      ($1,$3,'transfer_in',$10,$5,$11,'transfer',$7,$8,$9,'transfer')
    `,[product.id,fromLocation,toLocation,-qtyBase,unitCost,r(-qtyBase*unitCost,2),id,note,actor,qtyBase,r(qtyBase*unitCost,2)]);
    await recordAudit(client,{action:'transfer',actor,productId:product.id,locationId:fromLocation,referenceType:'transfer',referenceId:id,details:{from_location_id:fromLocation,to_location_id:toLocation,quantity_base:qtyBase,note}});
    await client.query('COMMIT');
    res.status(201).json(await operationsPayload());
  } catch (e) {
    await client.query('ROLLBACK'); next(e);
  } finally { client.release(); }
});

// Backward-compatible manual movement endpoint used by older pages/tools.
app.post('/movements', async (req, res, next) => {
  try {
    const product = (await productRows(`WHERE p.id=$1`, [req.body.product_id]))[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const type = clean(req.body.movement_type);
    if (!['waste','sale','adjustment','transfer_in','transfer_out','use','breakage','staff_use','return'].includes(type)) return res.status(400).json({ error: 'Invalid movement type' });
    let qtyBase = toBase(product, req.body.quantity, req.body.unit || product.display_unit);
    if (['waste','sale','transfer_out','use','breakage','staff_use'].includes(type)) qtyBase = -Math.abs(qtyBase);
    if (['transfer_in','return'].includes(type)) qtyBase = Math.abs(qtyBase);
    const totalValue = qtyBase * n(product.avg_cost_per_base, 0);
    await pool.query(`INSERT INTO oak_inv_movements(product_id,location_id,movement_type,quantity_delta_base,unit_cost_per_base,total_value,reference_type,note,actor) VALUES($1,$2,$3,$4,$5,$6,'manual',$7,$8)`, [product.id, req.body.location_id || null, type, qtyBase, n(product.avg_cost_per_base, 0), r(totalValue, 2), clean(req.body.note) || null, clean(req.body.actor)||'Oak Admin']);
    res.json(await dashboard());
  } catch (e) { next(e); }
});

app.post('/seed-samples', async (_req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cats = await client.query(`SELECT id,code FROM oak_inv_categories`);
    const cat = Object.fromEntries(cats.rows.map(x => [x.code, x.id]));
    const samples = [
      { sku:'KIT-CHICKEN', name:'Chicken Breast', category_id:cat.KITCHEN, subcategory:'Protein', tracking_type:'weight', display:'kg', reorder:2, par:10, pack:'1 kg pack', packQty:1 },
      { sku:'BAR-GIN', name:'House Gin', category_id:cat.BAR, subcategory:'Spirits', tracking_type:'volume', display:'L', reorder:1, par:6, pack:'750 ml bottle', packQty:0.75 },
      { sku:'SHI-DOUBLEAPPLE', name:'Double Apple Flavor', category_id:cat.SHISHA, subcategory:'Flavor', tracking_type:'weight', display:'kg', reorder:0.2, par:2, pack:'200 g box', packQty:0.2 }
    ];
    for (const s of samples) {
      const exists = await client.query(`SELECT id FROM oak_inv_products WHERE sku=$1`, [s.sku]);
      if (exists.rows[0]) continue;
      const barcode = await nextBarcode();
      const base = baseUnitFor(s.tracking_type);
      const pseudo = { base_unit: base, display_unit: s.display, name: s.name };
      const { rows } = await client.query(`INSERT INTO oak_inv_products(sku,name,category_id,subcategory,tracking_type,base_unit,display_unit,reorder_point_base,par_level_base,internal_barcode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [s.sku,s.name,s.category_id,s.subcategory,s.tracking_type,base,s.display,toBase(pseudo,s.reorder,s.display),toBase(pseudo,s.par,s.display),barcode]);
      await client.query(`INSERT INTO oak_inv_barcodes(barcode,product_id,barcode_type) VALUES($1,$2,'internal')`, [barcode, rows[0].id]);
      await client.query(`INSERT INTO oak_inv_packs(product_id,label,qty_base,preferred) VALUES($1,$2,$3,TRUE)`, [rows[0].id, s.pack, toBase(pseudo,s.packQty,s.display)]);
      if (s.sku === 'SHI-DOUBLEAPPLE') {
        for (const [label, qty] of [['100 g box',0.1],['120 g box',0.12],['1 kg box',1]]) await client.query(`INSERT INTO oak_inv_packs(product_id,label,qty_base) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [rows[0].id,label,toBase(pseudo,qty,s.display)]);
      }
    }
    await client.query('COMMIT');
    res.json(await dashboard());
  } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.code === '23505' ? 409 : 500);
  let message = err.message || 'Unexpected error';
  if (err.code === '23505') message = 'That SKU, barcode, name, or code already exists.';
  res.status(status).json({ error: message, build: BUILD });
});

ensureSchema().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`Oak Inventory API ${BUILD} listening on ${port}`));
}).catch(err => {
  console.error('Inventory schema initialization failed', err);
  process.exit(1);
});
