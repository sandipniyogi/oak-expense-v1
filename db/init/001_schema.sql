CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'partner',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  default_category_id UUID REFERENCES categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  merchant_id UUID REFERENCES merchants(id),
  category_id UUID REFERENCES categories(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  payment_method TEXT,
  expense_date DATE,
  transaction_id TEXT,
  description TEXT,
  reimbursement_required BOOLEAN NOT NULL DEFAULT FALSE,
  reimbursement_status TEXT NOT NULL DEFAULT 'not_required',
  image_path TEXT,
  image_sha256 TEXT,
  ocr_raw JSONB,
  ocr_confidence NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO users(name, role) VALUES
  ('Tree', 'owner'),
  ('Partner A', 'partner'),
  ('Partner B', 'partner'),
  ('Company', 'company')
ON CONFLICT DO NOTHING;

INSERT INTO categories(name) VALUES
  ('Wine & Spirits'),
  ('Beer'),
  ('Food & Garnish'),
  ('Bar Supplies'),
  ('Cleaning'),
  ('Glassware'),
  ('Maintenance'),
  ('Entertainment'),
  ('Staff Meals'),
  ('Transport & Delivery'),
  ('Utilities'),
  ('Marketing'),
  ('Other')
ON CONFLICT (name) DO NOTHING;
