import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const config = defineConfig({
  out: './libs/db/drizzle',
  schema: [
    './libs/db/src/lib/schemas/auth.ts',
    './libs/db/src/lib/schemas/device.ts',
    './libs/db/src/lib/schemas/i18n.ts',
    './libs/db/src/lib/schemas/protestSession.ts',
    './libs/db/src/lib/schemas/recoveryRequest.ts',
    './libs/db/src/lib/schemas/report.ts',
    './libs/db/src/lib/schemas/system.ts',
    './libs/db/src/lib/schemas/trustedContact.ts',
    './libs/db/src/lib/schemas/user.ts',
  ],
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
  schemaFilter: ['public', 'extensions', 'i18n', 'system', 'auth'],
});

export default config;
