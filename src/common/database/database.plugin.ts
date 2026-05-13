import type { FastifyPluginAsync } from 'fastify';

import { appDataSource } from '../../config/data-source';

export const registerDatabasePlugin: FastifyPluginAsync = async (app) => {
  if (!appDataSource.isInitialized) {
    await appDataSource.initialize();
  }

  app.addHook('onClose', async () => {
    if (appDataSource.isInitialized) {
      await appDataSource.destroy();
    }
  });
};
