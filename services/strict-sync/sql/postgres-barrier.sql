-- INSTALL ONLY in the disposable test database via test-postgres-barrier.py.
-- Do not install this on a live/shared application database yet.
BEGIN;
CREATE SCHEMA oak_guard;
REVOKE ALL ON SCHEMA oak_guard FROM PUBLIC;
CREATE TABLE oak_guard.state (
 id integer PRIMARY KEY CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 frozen boolean NOT NULL DEFAULT true,
 generation bigint NOT NULL DEFAULT 0,
 application_operation uuid,
 synchronization_operation uuid
);
REVOKE ALL ON oak_guard.state FROM PUBLIC;
INSERT INTO oak_guard.state(id) VALUES (1);

CREATE FUNCTION oak_guard.enforce_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,oak_guard AS $$
DECLARE s oak_guard.state%ROWTYPE; op text; epoch text; mode text;
BEGIN
 -- Always take the same advisory lock BEFORE the state row lock. The freeze
 -- operation takes its exclusive counterpart and waits for writers to commit.
 PERFORM pg_advisory_xact_lock_shared(7314825018467801::bigint);
 SELECT * INTO s FROM oak_guard.state WHERE id=1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STRICT_SYNC_STATE_MISSING' USING ERRCODE='55000'; END IF;
 IF NOT s.enabled THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 op:=current_setting('oak_guard.operation',true);
 epoch:=current_setting('oak_guard.generation',true);
 mode:=current_setting('oak_guard.mode',true);
 IF op IS NULL OR epoch IS NULL OR epoch<>s.generation::text THEN
  RAISE EXCEPTION 'STRICT_SYNC_WRITE_LOCKED' USING ERRCODE='55000';
 END IF;
 IF mode='application' THEN
  IF s.frozen OR s.application_operation IS NULL OR op<>s.application_operation::text THEN
   RAISE EXCEPTION 'STRICT_SYNC_WRITE_LOCKED' USING ERRCODE='55000';
  END IF;
 ELSIF mode='synchronization' THEN
  IF NOT s.frozen OR s.synchronization_operation IS NULL OR op<>s.synchronization_operation::text THEN
   RAISE EXCEPTION 'STRICT_SYNC_WRITE_LOCKED' USING ERRCODE='55000';
  END IF;
 ELSE RAISE EXCEPTION 'STRICT_SYNC_WRITE_LOCKED' USING ERRCODE='55000';
 END IF;
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION oak_guard.enforce_write() FROM PUBLIC;

CREATE FUNCTION oak_guard.begin_application(operation uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,oak_guard AS $$
DECLARE s oak_guard.state%ROWTYPE;
BEGIN
 IF operation IS NULL THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 PERFORM pg_advisory_xact_lock(7314825018467801::bigint);
 SELECT * INTO STRICT s FROM oak_guard.state WHERE id=1 FOR UPDATE;
 IF NOT s.enabled OR NOT s.frozen OR s.application_operation IS NOT NULL OR s.synchronization_operation IS NOT NULL THEN
  RAISE EXCEPTION 'STRICT_SYNC_OPERATION_BUSY';
 END IF;
 UPDATE oak_guard.state SET generation=generation+1,frozen=false,application_operation=operation WHERE id=1 RETURNING generation INTO s.generation;
 RETURN s.generation;
END $$;
REVOKE ALL ON FUNCTION oak_guard.begin_application(uuid) FROM PUBLIC;

CREATE FUNCTION oak_guard.freeze() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,oak_guard AS $$
DECLARE result bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(7314825018467801::bigint);
 UPDATE oak_guard.state SET frozen=true,application_operation=NULL,synchronization_operation=NULL,generation=generation+1 WHERE id=1 RETURNING generation INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'STRICT_SYNC_STATE_MISSING'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION oak_guard.freeze() FROM PUBLIC;

CREATE FUNCTION oak_guard.begin_synchronization(operation uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,oak_guard AS $$
DECLARE s oak_guard.state%ROWTYPE;
BEGIN
 IF operation IS NULL THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 PERFORM pg_advisory_xact_lock(7314825018467801::bigint);
 SELECT * INTO STRICT s FROM oak_guard.state WHERE id=1 FOR UPDATE;
 IF NOT s.enabled OR NOT s.frozen OR s.application_operation IS NOT NULL OR s.synchronization_operation IS NOT NULL THEN
  RAISE EXCEPTION 'STRICT_SYNC_OPERATION_BUSY';
 END IF;
 UPDATE oak_guard.state SET generation=generation+1,synchronization_operation=operation WHERE id=1 RETURNING generation INTO s.generation;
 RETURN s.generation;
END $$;
REVOKE ALL ON FUNCTION oak_guard.begin_synchronization(uuid) FROM PUBLIC;

-- Protect all existing public application tables, including direct COPY writes
-- (row triggers) and TRUNCATE (statement trigger). New DDL is blocked below.
DO $$
DECLARE t record;
BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname LOOP
  EXECUTE format('CREATE TRIGGER oak_strict_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION oak_guard.enforce_write()',t.relname);
  EXECUTE format('CREATE TRIGGER oak_strict_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION oak_guard.enforce_write()',t.relname);
 END LOOP;
END $$;
CREATE FUNCTION oak_guard.deny_ddl() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,oak_guard AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM oak_guard.state WHERE id=1 AND NOT enabled) THEN
  RAISE EXCEPTION 'STRICT_SYNC_DDL_LOCKED: run migrations only under explicit maintenance' USING ERRCODE='55000';
 END IF;
END $$;
REVOKE ALL ON FUNCTION oak_guard.deny_ddl() FROM PUBLIC;
CREATE EVENT TRIGGER oak_strict_ddl ON ddl_command_start EXECUTE FUNCTION oak_guard.deny_ddl();
UPDATE oak_guard.state SET enabled=true WHERE id=1;
COMMIT;
