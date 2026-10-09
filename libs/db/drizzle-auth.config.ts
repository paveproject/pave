import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// One-off introspection config: pulls a read-only TS mirror of the `auth`
// Postgres schema (owned and migrated by better-auth-rs, see libs/auth) into
// libs/db/src/lib/schemas/auth.ts, for other Drizzle-based services (e.g.
// notify) to query it. Never run `generate`/`migrate`/`push` with this
// config - only `pull`. Re-run `pull` whenever the Rust side's schema changes.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const config = defineConfig({
  out: './libs/db/drizzle-auth',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
  schemaFilter: ['auth'],
});

export default config;
