# Classify observed differences without changing records

Run `python3 scripts/strict-sync-differences.py` on the Mac with both live stacks and SSH available. The script executes read-only PostgreSQL and SQLite queries. It transfers per-field hashes and comparison-key hashes, not plaintext settings or business rows. Final output contains only field names, counts and comparisons. Screenshot verification uses the existing expense bridge's referenced-file manifest and checks top-level regular upload files for unreferenced names; it does not delete anything.

Inventory categories/locations are paired by name; restaurant menu by category/name, events by title, migrations by ID; social singleton settings are paired as singletons; deletion tombstones by table_name/row_id. Duplicate pairing keys stop classification for that table. Renamed or genuinely different entities appear as unmatched records. Do not merge by these provisional keys automatically.

ID and timestamp differences are reported separately from other fields. This does not prove that such fields are safe to ignore: IDs can have references, and timestamps can affect behavior. Cross-record constraints, semantic JSON equality and all mutation paths still need explicit policies. Restaurant audit/sessions/cache are not queried. The previous all-module preflight remains the broader inventory step.

This is not an atomic snapshot across both systems, a reconciliation tool, or the strict write lock. Live execution remains pending your run. Six new classification tests, eight existing preflight tests, and embedded Node syntax checks passed locally. No production deployment, scheduler change, data mutation or unlock is performed.
