# 07 — Company funds and monthly balances

[Handbook index](README.md)

## What this feature solves

A person can take money from the company, spend part of it on the business, return the rest, or spend personal money and be reimbursed later. An expense and a transfer of money are different records. Counting an advance as a business expense and then counting the receipt again would double the expense total.

Use the VPS expense website's `/company-funds` page for real entries. Local staging is http://localhost:3100/company-funds; Mac live is http://localhost:3000/company-funds. The API routes require the existing `OAK_COMPANY_FUNDS=1` feature setting in the running API. Do not change live environment flags manually to troubleshoot a staging 404.

## Record two things separately

**Money movement:** who received/returned money, date, amount, purpose and reference. Supported movement kinds are advance, return, reimbursement, capital, personal withdrawal, opening amount due to partner and opening amount due to company.

**Expense funding review:** classify the already saved expense as personal money, company-advance spending or direct company payment. This links evidence to the money source without creating another expense. An individual must be the expense payer for personal/advance funding. Direct-company funding requires the Company payer.

| Movement | Effect on reimbursement net | Other meaning |
| --- | --- | --- |
| Company advance to person | Decreases amount company owes person | Increases advance cash held |
| Person returns company money | Increases net toward zero | Decreases advance cash held |
| Company reimburses person | Decreases amount company owes | Settles prior personal spending |
| Capital contribution | Separate from reimbursement net | Company cash inflow |
| Personal withdrawal/drawing | Separate from reimbursement net | Company cash outflow; not an expense by itself |
| Opening due to partner | Increases amount company owes | Used only for deliberate opening adjustment |
| Opening due to company | Decreases net | Used only for deliberate opening adjustment |

Amounts are stored/calculated as exact integer **cents**, with positive CNY input up to two decimal places. Dates must be real calendar dates. Do not enter a negative movement amount to reverse something; use the appropriate kind or void-and-correct workflow.

## The monthly formula

For each individual, through the selected month:

```text
closing net = prior opening balance
            + reviewed personal-funded business expenses
            + reviewed advance-funded business expenses
            + money returned to company
            - company advances received
            - reimbursements received
            + signed opening adjustments
```

A **positive** net means the company owes that individual. A **negative** net means the individual holds/owes company money according to these records. Prior-period movements/expenses carry into opening balance; future records are excluded. Capital and drawings do not enter this reimbursement net. Direct-company expenses contribute to company business expenditure, not personal reimbursement.

The model's advance-cash-held calculation is cumulative through the month end:

```text
advances received - advance-funded expenses - money returned
```

Personal-funded expenses affect reimbursement net but do not reduce advance cash held. That distinction matters when a person spends both personal money and company cash. Classify according to what actually funded the payment.

## Example A — Money taken is reduced by business spending

A partner receives CNY 5,000 from company, spends CNY 3,200 using that advance and returns CNY 1,000:

| Record | Entry/classification | Result |
| --- | --- | --- |
| CNY 5,000 transfer | Advance | Company cash held starts at 5,000 |
| CNY 3,200 receipt | Existing expense reviewed as advance | Cash held becomes 1,800 |
| CNY 1,000 transfer back | Return | Remaining cash held is 800 |

Closing reimbursement net is `3,200 + 1,000 - 5,000 = -800`. Do not record the CNY 5,000 advance again as a supplier expense.

## Example B — Company still owes the partner

Reviewed business costs are CNY 8,000, advances are CNY 5,000 and reimbursements are CNY 1,000. With zero opening balance and no returns/adjustments, the company owes CNY 2,000. Keep funding classifications faithful to which portion used personal money versus company cash; net alone is not a bank reconciliation.

## Example C — Direct company payment

The company pays a supplier CNY 600 directly. Record the expense with Paid by Company and review funding as company. It adds CNY 600 to company business spending. It does not create a CNY 600 reimbursement owed to an individual.

## Corrections and review rules

An entry request ID protects against an identical duplicate submission. Reusing the same ID with different details is rejected. Refreshing/retrying a form is not permission to enter the same bank transfer twice under a new request ID.

Void a wrong movement with a reason, then enter its correction. Voids preserve history and are excluded from active calculations. Do not delete ledger history with direct SQL.

Funding review captures the expense's payer and amount. If either changes, the old review no longer qualifies and must be done again. Unreviewed, invalid or unsupported-currency expenses make the report provisional. Old `reimbursement_status` flags are not automatically equivalent to ledger payments; plan historical opening/reimbursement entry carefully to avoid double counting. Linked expenses have deletion protections that require handling their funding linkage explicitly.

## Suggested month-end procedure

1. Finish entering real receipts and transfers on VPS.
2. Review each expense's payer, amount, currency and funding source.
3. Resolve every provisional/unreviewed warning or record why the report remains provisional.
4. Compare advances, returns and reimbursements with bank/cash evidence; do not infer transfers from receipt totals.
5. Inspect each person's opening, month movements, spending and closing net.
6. Record actual reimbursements/returns only when they happen.
7. Complete supported expense sync and reverify before relying on Mac's mirror.
8. Keep a dated private monthly review record with the reviewer and evidence references.

## Current limitations

The report recalculates; it does not implement an immutable signed monthly close, automatic monthly notification or complete accounting/bank reconciliation. FX/refunds, splitting one expense across individuals and a dedicated new-report export are not implemented in this feature. Movement receipt upload is not implemented; existing expense receipt links remain available. Existing app access protection is used; this feature does not by itself add per-operator identity audit or a new login system.

Both funds tables now participate in the completed seven-table expense sync. They do not replicate instantly after every save. Use the existing sync process, not a second manual copy of each movement on Mac.
