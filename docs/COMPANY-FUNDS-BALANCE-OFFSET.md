# Company/individual payment offsets

Staging update based on main `26c959182764d5cb9d4a3dfcb0d47410fa203388`.

The settlement formula already reduces net owed for company advances and reimbursements and increases it for returns. The former entry screen made the separate personal-drawing category easy to confuse with a settlement payment. This change makes ordinary transfers explicit without reclassifying historical capital/drawing entries.

## Entry flow

- **Company → individual:** selects the existing reimbursement kind. It reduces what the company owes the selected person. If the transfer exceeds that balance, the remainder appears as company money the person holds/owes.
- **Individual → company:** selects the existing return kind. It offsets company money held by that person. Excess repayment crosses zero in the opposite direction.
- **Company advance:** retains the existing advance kind for future business spending.
- **Capital contribution / capital drawing:** clearly marked as separate from expense settlement. Their stored interpretation remains unchanged.

The default movement is now a company payment rather than an advance. Two nonnegative columns show exactly who owes whom. A preview uses the API's authoritative movement direction map and loaded selected-month balance. It displays before/after amounts, alerts for later-dated payments outside the selected month, marks earlier-period opening changes and carries the provisional-review warning. It is an estimate; the server reload after save is authoritative.

Example: reviewed personal business expense CNY 3,000; company payment CNY 2,000 leaves CNY 1,000 owed to the person; another CNY 1,500 leaves CNY 500 owed/held by the person; a reviewed business expense of CNY 500 brings the net to zero. A repayment moves the balance in the opposite direction. Advance-only cash tracking is displayed separately and is not the net settlement balance.

Unreviewed expenses remain excluded. Confirm the funding source for each existing expense before expecting it in the balance. Changing its amount or payer still invalidates its review. Transfers are not counted again as business expenses. No new tables, stored kinds, sync scopes, triggers or migrations are added.

## Staging acceptance

After installing the source patch, on the configured Mac:

```bash
cd "$HOME/Desktop/oak-expense-v1"
python3 scripts/start-company-funds-staging.py
```

This runs model/SQL/HTTP tests in a disposable database, then builds and updates the existing staging API/web. Mac live/VPS are not deployed by this command. Open http://localhost:3100/company-funds.

Use staging test entries to verify company payment, reverse repayment, zero crossing, exact cents, two separate individuals, prior/future months, voids and invalidated expense reviews. Confirm that capital/drawing remains separate and provisional warnings remain visible.

The patch's optional `test-on-mac.py` also copies the preview helper and both pure test files into a unique disposable staging-container directory and runs them there with Node. It does not open a database or change application configuration.

The new API preview test is included by the existing GitHub `apps/api/test/*.test.mjs` glob. The actual SQL/HTTP integration test has extra transfer/return/spending assertions, which require the Mac's staging PostgreSQL.

Do not manually edit production rows or reinterpret existing capital drawings to make balances match. If an earlier movement was entered under the wrong category, review its evidence, void with a reason and enter the correct movement through the normal live UI after release. Follow the existing pre-push/live-verification process before publishing. No production release is performed by installing or testing this source patch.
