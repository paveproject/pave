import { DbClient } from '../client';
import { systemConfig } from '../schemas/system';

export const seedSystemConfig = async (db: DbClient) => {
  console.log('Seeding system config...');

  await db
    .insert(systemConfig)
    .values([
      {
        key: 'is_maintenance',
        value: false,
      },
      {
        key: 'min_mobile_version',
        value: '1.0.0',
      },
    ])
    .onConflictDoNothing({ target: systemConfig.key });

  console.log('System config seeded successfully.');
};
