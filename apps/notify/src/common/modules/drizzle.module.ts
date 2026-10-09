import { Global, Module } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@libs/db/schemas';
import { EnvService, ENV_SERVICE } from '@libs/env';

export const DRIZZLE_SERVICE = Symbol('DRIZZLE_SERVICE');

export type DrizzleService = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_SERVICE,
      inject: [ENV_SERVICE],
      useFactory: async (env: EnvService) => {
        const pool = new Pool({
          connectionString: env.DATABASE_URL,
          ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE_SERVICE],
})
export class DrizzleModule {}
