-- Custom SQL migration file, put your code below! --

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Persist search_path for future sessions (app runtime, later migrations, drizzle-studio, ...)
DO $$
BEGIN
	EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, extensions', current_database());
END
$$;

-- Apply it for the rest of this migration session so the geometry type below resolves.
SET search_path TO "$user", public, extensions;
