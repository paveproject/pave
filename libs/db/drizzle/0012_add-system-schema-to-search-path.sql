-- Custom SQL migration file, put your code below! --

-- Needed from here on: the Rust API queries `system.version_policy` and its
-- `system.platform`/`system.version_release_state` enum types unqualified
-- (see apps/api/src/app/system) - without `system` in search_path, sqlx can't
-- resolve those custom enum types server-side. Same pattern as 0003's
-- `extensions` addition.
DO $$
BEGIN
	EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, system, extensions', current_database());
END
$$;

SET search_path TO "$user", public, system, extensions;
