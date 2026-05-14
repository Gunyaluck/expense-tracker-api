import 'reflect-metadata';

import { appDataSource } from '../config/data-source';

async function runMigrations(): Promise<void> {
  await appDataSource.initialize();

  try {
    const migrations = await appDataSource.runMigrations();

    if (migrations.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applied ${migrations.length} migration(s):`);

    for (const migration of migrations) {
      console.log(`- ${migration.name}`);
    }
  } finally {
    await appDataSource.destroy();
  }
}

void runMigrations().catch((error: unknown) => {
  console.error('Failed to run migrations.');
  console.error(error);
  process.exit(1);
});
