# Oak Lounge Inventory v3.1 — Admin Edit Patch

This patch adds Edit controls to the existing v3 Admin Panel.

Replace/merge only the files included in this patch. Do not replace your complete `apps`, `services`, or project folders.

Editable items:
- Products: name, SKU, category, subcategory, display unit, reorder level, target/par level, notes
- Categories: name, code, display order
- Suppliers: name, contact, phone, email, notes
- Locations: name, category, code
- Pack sizes: label, quantity/unit, preferred flag
- Supplier/pack barcodes: barcode value

Locked intentionally:
- Product tracking type (weight/volume/count)
- Oak internal barcode

No database reset or migration is required.

After copying the files, rebuild Staging:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.inventory.yml \
  --env-file .env.staging \
  up -d --build inventory-api web
```

Verify:

```bash
curl http://localhost:4300/health
```

Expected build:

`oak-lounge-inventory-v3.1-admin-edit`

Then open:

`http://localhost:3100/inventory/admin`
# oak-expense-v1
