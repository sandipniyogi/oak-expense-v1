# Expense AI suggestions and human purpose — staging pilot

## What changes

In Manual / Other app mode ONLY, the single-expense Verify expense panel now asks “What was this expense for?” and requires a human review checkbox before saving. Editing any entered field clears the effective confirmation. The purpose uses the existing description column, so reports, editing and search continue to show it without a schema migration.

Alipay / WeChat OCR mode keeps its original optional description, save flow and OCR evidence; it has no AI panel or additional confirmation requirement.

In manual mode the optional assistant first reads the screenshot through the existing OCR endpoint, then passes the extracted text and human explanation to local AI. Screenshot amount/vendor/date/payment readings have explicit Use buttons. The AI suggests an existing expense category and flags inconsistencies. Nothing is applied automatically. If OCR cannot read the image, the UI clearly says that AI advice uses only entered details/purpose. It does not overwrite amount/date/vendor, approve an expense, alter the database or save anything. A separate “Use suggested category” button is required. If other evidence fields change, earlier suggestions are marked stale; a response to obsolete fields is discarded.

A human can ignore the suggestion, select another category, rewrite the purpose and confirm the final values. Saving without AI is supported when the service/model is offline. A payment screenshot alone often cannot prove what was purchased.

## Existing AI service

The repository already has services/oak-ai, using Ollama and a default model setting of qwen3:8b. Its existing /product-proposal route already prepares inventory categories/subcategories/units for human review. That route is not changed by this patch. The owner's actual model availability still needs a health check; no model is pulled automatically.

This pilot adds /expense-review on that service and an opt-in /expenses/review proxy on the expense API. The browser does not call Ollama directly. Only selected entered fields, trimmed OCR text and server-supplied categories are sent to the configured AI service; screenshot images and transaction identifiers are excluded. It uses the existing configured Ollama endpoint, not a new external provider. Keep that endpoint configured to the intended local installation.

## Mac staging installation

Apply on the staging branch, then run:

```bash
cd "$HOME/Desktop/oak-expense-v1"
python3 scripts/start-expense-ai-staging.py
curl http://localhost:4400/health
```

The helper checks for Docker project oak-expense-staging before starting. It includes the existing docker-compose.ai.yml and a new staging-only API opt-in overlay. If AI_API_HOST_PORT is customized, use that port for the health check. Confirm build is oak-local-ai-v3-expense-review and model_available is true. If Ollama/model is unavailable, fix the existing local AI installation rather than exposing its port publicly or choosing an arbitrary large model.

Use this helper when testing AI review. Starting the API with only the base Compose files can remove its AI opt-in environment; the review button will then report it is unavailable and manual saving remains possible.

The live expense API defaults to AI disabled until OAK_EXPENSE_AI_ENABLED=1 is explicitly configured and its own reachable AI service is reviewed. This patch does not install Ollama on VPS, connect the VPS back to Mac, or automatically deploy the oak-ai service. Existing release automation does not promote extra AI services/configuration automatically.

## Saving and evidence

For new SINGLE and BATCH Manual / Other app captures:

- Entered purpose is stored in the normal description field.
- For manual screenshots read by the assistant, original OCR output is stored as ocr_raw.receipt_ocr. Alipay/WeChat OCR output stays unchanged.
- ocr_raw.human_review stores purpose, final entered fields, confirmation timestamp and the optional AI review input/result.
- The AI review snapshot is retained even when the human chooses different final values.
- Manual mode keeps its existing capture-source marker with the new human-review metadata.

This is creation-time client-submitted evidence, not an authenticated reviewer identity, tamper-proof audit trail or proof of expense legitimacy. Later edits continue using the existing edit route; the original creation review remains a snapshot. Corrections are not automatically used to retrain the model. No existing expense records are retroactively changed. Combined-payment capture is outside this AI pilot. Batch manual entries use the same review rules individually.

## Acceptance on http://localhost:3100

1. Select Manual / Other app, choose a fresh screenshot and enter a purpose such as “Lemons and mint for cocktails.”
2. Click Read screenshot and suggest details. Verify it reads the screenshot, offers explicit Use buttons and limits category choices to known categories. Apply multiple screenshot suggestions one at a time; it must not force a rerun for each accepted reading.
3. Confirm the category does not change until Use suggested category is clicked.
4. Override the category/purpose if needed. Review date, amount, vendor and payer, then tick confirmation and save.
5. Verify purpose in saved expenses/report and the screenshot link. Inspect stored JSON privately if checking review evidence; do not paste receipts/transaction data into public logs.
6. Change an amount after ticking confirmation: saving must require confirmation again.
7. Change fields while AI is running: stale results must not overwrite current fields.
8. Change receipt/mode: prior review must reset. Switch to Alipay/WeChat and verify AI/purpose/confirmation additions disappear and its original save flow works.
9. Stop only the staging oak-ai service in a controlled test; verify AI unavailability leaves manual purpose/review/save working.
10. Test manually entered expenses and the ordinary edit/export/report flow.

Real Ollama model quality, Mac Docker integration, actual database persistence and browser/mobile acceptance must be verified on the owner's staging installation. Do not merge to main before acceptance.

## Tests and promotion

```bash
node --test services/oak-ai/test/*.test.mjs apps/api/test/*.test.mjs apps/web/test/expenseReviewEvidence.test.mjs apps/web/test/manualScreenshotReview.test.mjs apps/web/test/batchReview.test.mjs apps/api/test/payer-category-report.test.cjs
python3 -m unittest discover -s automation/tests
node apps/api/src/automation-tests.cjs
```

Tests cover constrained categories, input bounds, OCR mismatch flags, invalid/unavailable model responses, proxy opt-in/read-only behavior, safe fallback and preservation of OCR/AI/human values. Development HTTP integration uses a stub Ollama response, not a real model. The web production build is checked separately.

After staging acceptance, stage only this patch's paths, push staging, create a PR to main and pass Source checks. Main merge promotes expense API/web changes through the existing Mac-live-first runner. AI service opt-in/configuration remains a separate rollout requirement on live; do not assume a successful expense release means AI is live on VPS.

## Batch upload payment screenshots

Choose a mode for new screenshots before adding them; each item also has a mode selector. Alipay/WeChat items retain the existing OCR workflow. Manual/Other app items show the optional screenshot/AI assistant, required purpose and individual human confirmation. Read selected screenshots reads the OCR-mode items; use the assistant or Attach and enter details manually for manual items. AI reading attaches the image automatically. Save all skips manual items whose purpose/confirmation is missing; saving a particular item enforces the same rule. Every item has its own payer/category, purpose and AI-review evidence. AI never assigns the payer.

Test a mixed batch with two manual items paid by different people. Use different categories and purposes, confirm each item, change one category after confirmation and verify only that item needs reconfirming. Save individually or Save all and inspect the saved purposes and reports.

## Expense summary: Who paid for what

Paid by and Expense category filters can be combined with the existing date, exact amount and payment filters. The Who paid for what table groups all matching saved expenses by payer ID, category ID and currency; same-name people remain distinct, missing categories are Uncategorized and missing payer is Unassigned. AI suggestions do not change historical categories or payers. A person chooses final values before saving.

Reports show purpose in the existing Description/Purpose column. The Excel export adds Paid by Category with payer/category/currency/count/total. Its group totals use all matching records, independently of the existing 5,000-detail limit. When limited, the UI and new sheet say so; detailed screenshots and pre-existing detail-derived sheets remain limited. The existing grand-total report assumes the application's established currency behavior; new payer/category totals keep currencies separate.

Staging acceptance: save expenses for two different payers in two categories, verify totals, filter one payer plus one category and check the detail list and Excel Paid by Category sheet match. Test Uncategorized, no matching expenses and print view. The CSV remains the transaction detail export with payer/category/purpose columns; it does not gain a separate group-summary section.

Development validation included PGlite's PostgreSQL-compatible engine for filter/group queries, exact decimal sums, same-name payer IDs, currency separation, null categories and 6,001 matching rows. ExcelJS generated and reopened a real workbook to verify complete grouped totals despite the detail limit. Actual production PostgreSQL and Mac browser/model acceptance still need staging verification.
