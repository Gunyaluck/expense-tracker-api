import 'reflect-metadata';

import { appDataSource } from '../config/data-source';

async function revertMigration(): Promise<void> {
  await appDataSource.initialize();

  try {
    await appDataSource.undoLastMigration();
    console.log('Reverted the last migration.');
  } finally {
    await appDataSource.destroy();
  }
}

void revertMigration().catch((error: unknown) => {
  console.error('Failed to revert the last migration.');
  console.error(error);
  process.exit(1);
});
