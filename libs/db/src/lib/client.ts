import { drizzle, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schemas';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { ExtractTablesWithRelations } from 'drizzle-orm';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
});

export const db = drizzle(pool, {
  schema,
});

export type DbClient = typeof db;

export type DbTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
