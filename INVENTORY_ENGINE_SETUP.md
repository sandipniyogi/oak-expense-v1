# Oak Lounge Inventory v3 — Setup and Test

## 1. What changed

The old prototype focused too much on kegs/shisha. V3 is department-first:

Oak Lounge Inventory
- Kitchen
- Bar
- Shisha
- additional categories from Admin

Every category can contain unlimited products. Products can be tracked by:
- weight (`g` internally, usually shown as `kg`)
- volume (`ml` internally, usually shown as `L`)
- count (`each`)

A product can have unlimited purchasing pack sizes. Examples:
- Shisha: 100 g box, 120 g box, 200 g box, 1 kg box
- Gin: 750 ml bottle, 1 L bottle
- Chicken: 1 kg pack, 5 kg pack
- Coke: single can, 24-can case

## 2. Install

From the project root, merge the patch files into the existing Oak project. Replace the old Inventory module files only.

Make scripts executable:

```bash
chmod +x scripts/start-inventory-staging.sh
chmod +x scripts/start-inventory-production.sh
chmod +x scripts/test-inventory-staging.sh
```

Start Staging:

```bash
./scripts/start-inventory-staging.sh
```

Do not run `docker compose down -v`.

## 3. Verify API

```bash
curl http://localhost:4300/health
```

Expected build marker:

```json
{
  "ok": true,
  "service": "oak-inventory-api",
  "build": "oak-lounge-inventory-v3-admin-barcode"
}
```

## 4. Open the pages

Dashboard:

```text
http://localhost:3100/inventory
```

Admin:

```text
http://localhost:3100/inventory/admin
```

Receiving:

```text
http://localhost:3100/inventory/receive
```

Scanner:

```text
http://localhost:3100/inventory/scan
```

## 5. Recommended first test

In Admin, create one real or test product in each category.

Kitchen example:
- Product: Chicken Breast
- SKU: KIT-CHICKEN
- Tracking: Weight
- Display: kg
- Reorder: 2 kg
- Target: 10 kg
- Pack: 1 kg pack
- Pack quantity: 1 kg

Bar example:
- Product: House Gin
- SKU: BAR-GIN
- Tracking: Volume
- Display: L
- Pack: 750 ml bottle
- Pack quantity: 750 ml

Shisha example:
- Product: Double Apple Flavor
- SKU: SHI-DOUBLEAPPLE
- Tracking: Weight
- Display: kg
- Pack: 200 g box
- Pack quantity: 200 g

After creating Double Apple, select it in Admin > Barcodes and add the other packs:
- 100 g box
- 120 g box
- 1 kg box

Each new product automatically receives an Oak internal Code128 barcode.

## 6. Receiving example

Open `/inventory/receive`.

For Double Apple:
- Supplier: choose/create supplier
- Location: Shisha Store
- Pack: 200 g box
- Number of packs: 5
- Cost per pack: 68

The receipt adds 1,000 g to stock and records ¥340 purchase spend.

## 7. Barcode behavior

Every product gets an internal Oak barcode such as:

```text
OAK000100123
```

Print it from the product list/Admin panel.

You can also register the barcode already printed by a supplier. This means Oak can recognize both:
- Oak's own label
- supplier UPC/EAN/Code128 label

### Scanner page

A USB/Bluetooth barcode scanner usually behaves like a keyboard and works immediately with the scanner input.

The camera button uses the browser's native `BarcodeDetector` API when the browser supports it. If the browser does not support that API, use a handheld USB/Bluetooth scanner or type the barcode. We can add a bundled cross-browser camera decoding library later if Safari compatibility requires it.

Unknown barcodes can be assigned to an existing product directly from the Scan page.

## 8. Database model

V3 uses its own clean inventory tables:

- `oak_inv_categories`
- `oak_inv_locations`
- `oak_inv_suppliers`
- `oak_inv_products`
- `oak_inv_packs`
- `oak_inv_barcodes`
- `oak_inv_receipts`
- `oak_inv_receipt_lines`
- `oak_inv_movements`

Older prototype inventory tables can remain in the database; V3 does not depend on them.

## 9. What comes next

After this core workflow is stable, the next layers should be added in this order:
1. staff/admin roles and permissions
2. stock transfers between locations
3. waste/spoilage screen
4. POS/online-order recipe deductions
5. ESP32/load-cell physical stock observations
6. variance alerts (expected vs physically measured)
7. supplier purchase analytics and reorder suggestions
