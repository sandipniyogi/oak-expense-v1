# Oak Keg Inventory Simulator v1

This module lets you finish the keg-inventory software before the ESP32/HX711/load cell arrives.

## What it adds

- A separate `keg-api` service using the same PostgreSQL database as the selected environment.
- A new Next.js page at `/kegs`.
- A 2 L prototype station suitable for a future 5 kg load cell.
- Manual weight entry.
- Buttons to simulate 100/250/500 mL pours, refill, and empty.
- Remaining liters, percentage, pints, status, and low-stock threshold.
- Reading history.
- The exact HTTP contract the ESP32 will use later.

## Why it is isolated

The patch does not replace your expense API or the existing root page. It adds a Docker Compose override file and new source folders/routes. This is safer with your heavily modified current expense codebase.

## Install

Copy these paths into the project root, preserving folders:

- `docker-compose.keg.yml`
- `services/keg-api/`
- `apps/web/app/kegs/`
- `scripts/start-keg-staging.sh`
- `scripts/start-keg-production.sh`
- `scripts/test-keg-staging.sh`

Do not replace the whole `apps/web` or `services` directory.

## Start in Staging

```bash
./scripts/start-keg-staging.sh
```

Open:

- Keg UI: `http://localhost:3100/kegs`
- Keg API health: `http://localhost:4300/health`

On the first page load click **Create prototype station**.

## Test from Terminal

```bash
./scripts/test-keg-staging.sh
```

Or manually send a future hardware-style reading:

```bash
curl -X POST http://localhost:4300/readings \
  -H 'Content-Type: application/json' \
  -d '{"sensor_id":"KEG_TEST_01","weight_kg":1.842,"source":"hardware"}'
```

## Calculation

The API uses:

```text
liquid weight kg = stable gross weight kg - tare weight kg
remaining liters = liquid weight kg / density kg per liter
remaining % = remaining liters / capacity liters * 100
```

The default prototype is:

```text
Capacity:     2.000 L
Tare:         0.350 kg
Density:      1.000 kg/L (water-like test liquid)
Full gross:   2.350 kg
Low stock:    20%
```

This fits the planned 1–2 kg bench test. When the real 5 kg load cell arrives, measure the empty platform/container and update **Tare weight** in the UI.

## What changes when hardware arrives

Almost nothing in Oak. The ESP32 sends:

```json
{
  "sensor_id": "KEG_TEST_01",
  "weight_kg": 1.842,
  "source": "hardware"
}
```

to:

```text
POST /readings
```

The simulator and the ESP32 therefore share the same database/API path.

## Production

Do not use Production until the simulator behavior is accepted in Staging.

Later:

```bash
./scripts/start-keg-production.sh
```

Production UI: `http://localhost:3000/kegs`
Production keg API: `http://localhost:4200/health`

Staging and Production remain separate because they connect to the PostgreSQL database belonging to their own Compose project/environment.
