import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 4200);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json({ limit: '256kb' }));

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function snapshot(station, reading = null) {
  const capacity = asNumber(station.capacity_liters, 0);
  const tare = asNumber(station.tare_weight_kg, 0);
  const density = asNumber(station.density_kg_per_liter, 1) || 1;
  const low = asNumber(station.low_stock_percent, 20);
  const gross = reading ? asNumber(reading.stable_weight_kg ?? reading.raw_weight_kg, 0) : 0;
  const liquidKg = Math.max(0, gross - tare);
  const litersUnclamped = liquidKg / density;
  const liters = capacity > 0 ? Math.min(capacity, litersUnclamped) : litersUnclamped;
  const percent = capacity > 0 ? Math.max(0, Math.min(100, (liters / capacity) * 100)) : 0;
  const pints = liters / 0.473176;
  let status = 'OK';
  if (percent <= 2) status = 'EMPTY';
  else if (percent <= low) status = 'REORDER';

  return {
    id: station.id,
    sensor_id: station.sensor_id,
    name: station.name,
    product_name: station.product_name,
    capacity_liters: capacity,
    tare_weight_kg: tare,
    density_kg_per_liter: density,
    low_stock_percent: low,
    active: station.active,
    raw_weight_kg: reading ? asNumber(reading.raw_weight_kg, null) : null,
    stable_weight_kg: reading ? asNumber(reading.stable_weight_kg, null) : null,
    remaining_liters: round(liters, 3),
    remaining_percent: round(percent, 1),
    estimated_pints: round(pints, 1),
    status,
    source: reading?.source ?? null,
    last_reading_at: reading?.created_at ?? null
  };
}

async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS keg_stations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sensor_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      product_name TEXT NOT NULL DEFAULT 'Prototype Liquid',
      capacity_liters NUMERIC(10,3) NOT NULL DEFAULT 2.000 CHECK (capacity_liters > 0),
      tare_weight_kg NUMERIC(10,3) NOT NULL DEFAULT 0.350 CHECK (tare_weight_kg >= 0),
      density_kg_per_liter NUMERIC(8,5) NOT NULL DEFAULT 1.00000 CHECK (density_kg_per_liter > 0),
      low_stock_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (low_stock_percent >= 0 AND low_stock_percent <= 100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS keg_readings (
      id BIGSERIAL PRIMARY KEY,
      station_id UUID NOT NULL REFERENCES keg_stations(id) ON DELETE CASCADE,
      raw_weight_kg NUMERIC(12,4) NOT NULL CHECK (raw_weight_kg >= 0),
      stable_weight_kg NUMERIC(12,4) NOT NULL CHECK (stable_weight_kg >= 0),
      source TEXT NOT NULL DEFAULT 'hardware' CHECK (source IN ('hardware','simulator','manual')),
      device_time TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_keg_readings_station_created
      ON keg_readings(station_id, created_at DESC);
  `);
}

async function latestReading(stationId) {
  const r = await pool.query(
    `SELECT id, raw_weight_kg, stable_weight_kg, source, device_time, created_at
       FROM keg_readings
      WHERE station_id=$1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [stationId]
  );
  return r.rows[0] || null;
}

async function insertReading(station, rawWeightKg, source = 'hardware', deviceTime = null) {
  const weight = asNumber(rawWeightKg);
  if (weight === null || weight < 0 || weight > 500) {
    const err = new Error('weight_kg must be a number between 0 and 500');
    err.status = 400;
    throw err;
  }

  let stable = weight;
  if (source === 'hardware') {
    const recent = await pool.query(
      `SELECT raw_weight_kg
         FROM keg_readings
        WHERE station_id=$1
          AND created_at > now() - interval '90 seconds'
        ORDER BY created_at DESC
        LIMIT 4`,
      [station.id]
    );
    const values = recent.rows.map(r => Number(r.raw_weight_kg)).filter(Number.isFinite);
    values.unshift(weight);
    stable = median(values) ?? weight;
  }

  const inserted = await pool.query(
    `INSERT INTO keg_readings(station_id, raw_weight_kg, stable_weight_kg, source, device_time)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, raw_weight_kg, stable_weight_kg, source, device_time, created_at`,
    [station.id, weight, stable, source, deviceTime || null]
  );
  return inserted.rows[0];
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'oak-keg-api', build: 'keg-simulator-v1' });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.post('/setup-demo', async (_req, res) => {
  try {
    const q = await pool.query(
      `INSERT INTO keg_stations(sensor_id, name, product_name, capacity_liters, tare_weight_kg, density_kg_per_liter, low_stock_percent)
       VALUES ('KEG_TEST_01','Prototype Scale','Test Water',2.000,0.350,1.00000,20.00)
       ON CONFLICT (sensor_id) DO UPDATE SET updated_at=now()
       RETURNING *`
    );
    const station = q.rows[0];
    let reading = await latestReading(station.id);
    if (!reading) {
      reading = await insertReading(station, 2.350, 'simulator');
    }
    res.json(snapshot(station, reading));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/stations', async (_req, res) => {
  try {
    const q = await pool.query(`SELECT * FROM keg_stations WHERE active=true ORDER BY created_at`);
    const items = [];
    for (const station of q.rows) {
      items.push(snapshot(station, await latestReading(station.id)));
    }
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/stations/:id', async (req, res) => {
  try {
    const fields = {
      name: String(req.body.name ?? '').trim(),
      product_name: String(req.body.product_name ?? '').trim(),
      capacity_liters: asNumber(req.body.capacity_liters),
      tare_weight_kg: asNumber(req.body.tare_weight_kg),
      density_kg_per_liter: asNumber(req.body.density_kg_per_liter),
      low_stock_percent: asNumber(req.body.low_stock_percent)
    };
    if (!fields.name || !fields.product_name || !fields.capacity_liters || fields.tare_weight_kg === null || !fields.density_kg_per_liter || fields.low_stock_percent === null) {
      return res.status(400).json({ error: 'All station fields are required.' });
    }
    const q = await pool.query(
      `UPDATE keg_stations
          SET name=$2, product_name=$3, capacity_liters=$4, tare_weight_kg=$5,
              density_kg_per_liter=$6, low_stock_percent=$7, updated_at=now()
        WHERE id=$1
        RETURNING *`,
      [req.params.id, fields.name, fields.product_name, fields.capacity_liters, fields.tare_weight_kg, fields.density_kg_per_liter, fields.low_stock_percent]
    );
    if (!q.rows[0]) return res.status(404).json({ error: 'Station not found' });
    res.json(snapshot(q.rows[0], await latestReading(q.rows[0].id)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/readings', async (req, res) => {
  try {
    const sensorId = String(req.body.sensor_id ?? '').trim();
    if (!sensorId) return res.status(400).json({ error: 'sensor_id is required' });
    const s = await pool.query(`SELECT * FROM keg_stations WHERE sensor_id=$1 AND active=true LIMIT 1`, [sensorId]);
    const station = s.rows[0];
    if (!station) return res.status(404).json({ error: 'Unknown sensor_id' });
    const source = ['hardware', 'simulator', 'manual'].includes(req.body.source) ? req.body.source : 'hardware';
    const reading = await insertReading(station, req.body.weight_kg, source, req.body.device_time || null);
    res.status(201).json(snapshot(station, reading));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/stations/:id/readings', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const q = await pool.query(
      `SELECT id, raw_weight_kg, stable_weight_kg, source, device_time, created_at
         FROM keg_readings
        WHERE station_id=$1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [req.params.id, limit]
    );
    res.json(q.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/stations/:id/simulate', async (req, res) => {
  try {
    const s = await pool.query(`SELECT * FROM keg_stations WHERE id=$1 LIMIT 1`, [req.params.id]);
    const station = s.rows[0];
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const current = snapshot(station, await latestReading(station.id));
    const density = Number(station.density_kg_per_liter);
    const tare = Number(station.tare_weight_kg);
    const capacity = Number(station.capacity_liters);
    let liters = current.remaining_liters;
    const action = req.body.action;

    if (action === 'pour') {
      const ml = Math.min(Math.max(asNumber(req.body.ml, 100), 1), 5000);
      liters = Math.max(0, liters - ml / 1000);
    } else if (action === 'refill_full') {
      liters = capacity;
    } else if (action === 'set_empty') {
      liters = 0;
    } else {
      return res.status(400).json({ error: 'action must be pour, refill_full, or set_empty' });
    }

    const gross = tare + liters * density;
    const reading = await insertReading(station, round(gross, 4), 'simulator');
    res.json(snapshot(station, reading));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

await ensureSchema();
app.listen(port, '0.0.0.0', () => {
  console.log(`Oak keg API listening on ${port}`);
});
