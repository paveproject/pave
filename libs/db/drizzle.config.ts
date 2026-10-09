import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const config = defineConfig({
  out: './libs/db/drizzle',
  // Excludes schemas/auth.ts on purpose: it's a read-only mirror of the
  // `auth` Postgres schema owned by better-auth-rs (see libs/auth), and
  // generate/migrate/push must never try to create, alter, or drop it.
  schema: [
    './libs/db/src/lib/schemas/i18n.ts',
    './libs/db/src/lib/schemas/system.ts',
    './libs/db/src/lib/schemas/user.ts',
  ],
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
  schemaFilter: ['public', 'extensions', 'i18n', 'system'],
});

export default config;
