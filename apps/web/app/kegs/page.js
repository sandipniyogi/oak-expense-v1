'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './kegs.module.css';

const initialForm = {
  name: '',
  product_name: '',
  capacity_liters: '2',
  tare_weight_kg: '0.35',
  density_kg_per_liter: '1',
  low_stock_percent: '20'
};

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

export default function KegInventoryPage() {
  const [api, setApi] = useState('');
  const [stations, setStations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [readings, setReadings] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [manualWeight, setManualWeight] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => stations.find(s => s.id === selectedId) || stations[0] || null,
    [stations, selectedId]
  );

  useEffect(() => {
    const url = '/module-api/keg';
    setApi(url);
    loadStations(url).catch(err => setMessage(err.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setForm({
      name: selected.name,
      product_name: selected.product_name,
      capacity_liters: String(selected.capacity_liters),
      tare_weight_kg: String(selected.tare_weight_kg),
      density_kg_per_liter: String(selected.density_kg_per_liter),
      low_stock_percent: String(selected.low_stock_percent)
    });
    setManualWeight(selected.stable_weight_kg == null ? '' : String(selected.stable_weight_kg));
    if (api) loadReadings(api, selected.id).catch(() => {});
  }, [selected?.id, api]);

  async function request(url, options) {
    const r = await fetch(url, options);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  async function loadStations(base = api) {
    if (!base) return;
    const data = await request(`${base}/stations`);
    setStations(data);
    if (!selectedId && data[0]) setSelectedId(data[0].id);
  }

  async function loadReadings(base, stationId) {
    const data = await request(`${base}/stations/${stationId}/readings?limit=30`);
    setReadings(data);
  }

  async function setupDemo() {
    setBusy(true);
    setMessage('Creating prototype station…');
    try {
      const station = await request(`${api}/setup-demo`, { method: 'POST' });
      await loadStations();
      setSelectedId(station.id);
      setMessage('Prototype station ready. It starts as a simulated 2 L full container.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(e) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await request(`${api}/stations/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      await loadStations();
      setMessage('Station configuration saved.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendManualReading(e) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await request(`${api}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: selected.sensor_id, weight_kg: Number(manualWeight), source: 'manual' })
      });
      await Promise.all([loadStations(), loadReadings(api, selected.id)]);
      setMessage('Manual weight reading recorded.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function simulate(action, ml) {
    if (!selected) return;
    setBusy(true);
    try {
      await request(`${api}/stations/${selected.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ml })
      });
      await Promise.all([loadStations(), loadReadings(api, selected.id)]);
      setMessage(action === 'pour' ? `Simulated a ${ml} mL pour.` : action === 'refill_full' ? 'Simulator refilled to full.' : 'Simulator set to empty.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pct = selected ? Math.max(0, Math.min(100, Number(selected.remaining_percent) || 0)) : 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Oak Operational System · Prototype</div>
          <h1>Keg Inventory Simulator</h1>
          <p>Build and test the complete weight-to-inventory workflow before the ESP32, HX711 and load cell arrive.</p>
        </div>
        <a className={styles.backLink} href="/">← Expense system</a>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      {!selected ? (
        <section className={styles.empty}>
          <h2>No keg station yet</h2>
          <p>Create a 2 L test station. Later the ESP32 will send readings to this exact same API.</p>
          <button disabled={!api || busy} onClick={setupDemo}>Create prototype station</button>
        </section>
      ) : (
        <>
          <section className={styles.heroGrid}>
            <div className={styles.gaugeCard}>
              <div className={styles.cardLabel}>{selected.product_name}</div>
              <div className={styles.bigValue}>{fmt(selected.remaining_liters)} L</div>
              <div className={styles.muted}>of {fmt(selected.capacity_liters)} L · {fmt(selected.remaining_percent, 1)}%</div>
              <div className={styles.progress}><div style={{ width: `${pct}%` }} /></div>
              <div className={`${styles.status} ${styles[selected.status.toLowerCase()] || ''}`}>{selected.status}</div>
            </div>

            <div className={styles.metrics}>
              <div><span>Gross weight</span><strong>{fmt(selected.stable_weight_kg, 3)} kg</strong></div>
              <div><span>Tare weight</span><strong>{fmt(selected.tare_weight_kg, 3)} kg</strong></div>
              <div><span>Estimated pints</span><strong>{fmt(selected.estimated_pints, 1)}</strong></div>
              <div><span>Sensor</span><strong>{selected.sensor_id}</strong></div>
              <div><span>Last source</span><strong>{selected.source || '—'}</strong></div>
              <div><span>Last reading</span><strong>{selected.last_reading_at ? new Date(selected.last_reading_at).toLocaleTimeString() : '—'}</strong></div>
            </div>
          </section>

          <section className={styles.twoCol}>
            <div className={styles.panel}>
              <h2>Simulate the hardware</h2>
              <p className={styles.muted}>These buttons create the same database readings that the ESP32 will create later.</p>
              <div className={styles.buttonGrid}>
                <button disabled={busy} onClick={() => simulate('pour', 100)}>Pour 100 mL</button>
                <button disabled={busy} onClick={() => simulate('pour', 250)}>Pour 250 mL</button>
                <button disabled={busy} onClick={() => simulate('pour', 500)}>Pour 500 mL</button>
                <button disabled={busy} onClick={() => simulate('refill_full')}>Refill full</button>
                <button className={styles.secondary} disabled={busy} onClick={() => simulate('set_empty')}>Set empty</button>
              </div>

              <form className={styles.manual} onSubmit={sendManualReading}>
                <label>Manual platform weight (kg)
                  <input type="number" min="0" max="500" step="0.001" value={manualWeight} onChange={e => setManualWeight(e.target.value)} />
                </label>
                <button disabled={busy || manualWeight === ''}>Record reading</button>
              </form>
            </div>

            <form className={styles.panel} onSubmit={saveConfig}>
              <h2>Station calibration/configuration</h2>
              <div className={styles.formGrid}>
                <label>Station name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                <label>Product<input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} /></label>
                <label>Capacity (L)<input type="number" step="0.001" min="0.001" value={form.capacity_liters} onChange={e => setForm({ ...form, capacity_liters: e.target.value })} /></label>
                <label>Tare weight (kg)<input type="number" step="0.001" min="0" value={form.tare_weight_kg} onChange={e => setForm({ ...form, tare_weight_kg: e.target.value })} /></label>
                <label>Density (kg/L)<input type="number" step="0.00001" min="0.1" value={form.density_kg_per_liter} onChange={e => setForm({ ...form, density_kg_per_liter: e.target.value })} /></label>
                <label>Low-stock threshold (%)<input type="number" step="1" min="0" max="100" value={form.low_stock_percent} onChange={e => setForm({ ...form, low_stock_percent: e.target.value })} /></label>
              </div>
              <button disabled={busy}>Save configuration</button>
            </form>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div><h2>Recent sensor readings</h2><p className={styles.muted}>Newest first. Hardware readings will appear in the same list.</p></div>
              <button className={styles.secondary} disabled={busy} onClick={() => loadReadings(api, selected.id)}>Refresh</button>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Time</th><th>Source</th><th>Raw kg</th><th>Stable kg</th></tr></thead>
                <tbody>
                  {readings.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.source}</td>
                      <td>{fmt(r.raw_weight_kg, 4)}</td>
                      <td><strong>{fmt(r.stable_weight_kg, 4)}</strong></td>
                    </tr>
                  ))}
                  {!readings.length && <tr><td colSpan="4">No readings yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.contract}>
            <h2>Future ESP32 payload</h2>
            <p>The hardware will POST exactly this shape to the keg API:</p>
            <pre>{`POST /readings\n{\n  "sensor_id": "KEG_TEST_01",\n  "weight_kg": 1.842,\n  "source": "hardware"\n}`}</pre>
          </section>
        </>
      )}
    </main>
  );
}
