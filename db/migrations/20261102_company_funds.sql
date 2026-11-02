BEGIN;
CREATE TABLE IF NOT EXISTS oak_company_fund_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id text NOT NULL UNIQUE CHECK(length(request_id) BETWEEN 1 AND 100),
 partner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('advance','return','reimbursement','capital','personal_withdrawal','opening_due_partner','opening_due_company')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=999999999999),occurred_on date NOT NULL,
 purpose text NOT NULL CHECK(length(trim(purpose)) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),voided_at timestamptz,void_reason text,
 CHECK((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND length(trim(void_reason)) BETWEEN 1 AND 1000))
);
CREATE INDEX IF NOT EXISTS oak_company_funds_partner_date ON oak_company_fund_entries(partner_id,occurred_on);
CREATE TABLE IF NOT EXISTS oak_company_expense_funding (
 expense_id uuid PRIMARY KEY REFERENCES expenses(id) ON DELETE RESTRICT,
 funding_source text NOT NULL CHECK(funding_source IN ('personal','advance','company')),
 expense_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,amount_cents bigint NOT NULL CHECK(amount_cents>0),note text NOT NULL DEFAULT '',reviewed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
