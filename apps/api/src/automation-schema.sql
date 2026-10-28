CREATE TABLE IF NOT EXISTS oak_phone_saves (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  expense_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oak_sync_tombstones (
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name,row_id)
);
CREATE OR REPLACE FUNCTION oak_sync_note_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO oak_sync_tombstones(table_name,row_id) VALUES(TG_TABLE_NAME,OLD.id::text)
    ON CONFLICT(table_name,row_id) DO UPDATE SET deleted_at=now();
    RETURN OLD;
  ELSE
    DELETE FROM oak_sync_tombstones WHERE table_name=TG_TABLE_NAME AND row_id=NEW.id::text;
    RETURN NEW;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION oak_sync_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TRUNCATE is disabled on synchronized tables; use tracked DELETE operations'; END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','categories','merchants','expenses','oak_phone_saves'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS oak_sync_change ON %I',t);
    EXECUTE format('DROP TRIGGER IF EXISTS oak_sync_truncate ON %I',t);
    EXECUTE format('CREATE TRIGGER oak_sync_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION oak_sync_no_truncate()',t);
    EXECUTE format('CREATE TRIGGER oak_sync_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION oak_sync_note_change()',t);
  END LOOP;
END $$;
