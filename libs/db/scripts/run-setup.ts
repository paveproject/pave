import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../src/lib/client';
import { seedI18n, seedReportTaxonomy, seedSystemConfig } from '../src/lib/seed';

async function main() {
  console.log('⏳ Starting database setup...');

  try {
    console.log('📦 Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed.');

    console.log('🌱 Starting reference data seeding...');
    await seedI18n(db);
    await seedSystemConfig(db);
    // Migration 0035 inserts the taxonomy itself (its FK needs the rows in the
    // same transaction); this converges it afterwards on every deploy.
    await seedReportTaxonomy(db);
    console.log('✅ Seeding completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database setup:', error);
    process.exit(1);
  }
}

main();
