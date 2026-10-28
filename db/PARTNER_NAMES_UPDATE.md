# Partner Names Update

This migration updates the existing payer/user names:

- Tree -> Sandip
- Partner A -> Vicky
- Partner B -> Yolanda
- Company is left unchanged

## Apply to the current running database

From the `oak-expense-v1` project folder:

```bash
docker compose exec -T db psql -U oak -d oak_expenses < db/migrations/002_update_partner_names.sql
```

Then refresh the browser. The `Paid by` dropdown reads users from the database via `/meta`, so no frontend rebuild is required.

## Verify

```bash
docker compose exec db psql -U oak -d oak_expenses -c "SELECT id, name, role, active FROM users ORDER BY created_at;"
```

Existing expenses keep their `user_id`, so their displayed payer name will automatically change to the new name as well.
