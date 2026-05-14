import type { FastifyInstance } from 'fastify';

import { registerAccountsModule } from './accounts/accounts.module';
import { registerAuthModule } from './auth/auth.module';
import { registerCategoriesModule } from './categories/categories.module';
import { registerReportsModule } from './reports/reports.module';
import { registerSessionsModule } from './sessions/sessions.module';
import { registerTransactionsModule } from './transactions/transactions.module';

export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(registerAuthModule, { prefix: '/auth' });
  await app.register(registerSessionsModule, { prefix: '/sessions' });
  await app.register(registerAccountsModule, { prefix: '/accounts' });
  await app.register(registerCategoriesModule, { prefix: '/categories' });
  await app.register(registerTransactionsModule, { prefix: '/transactions' });
  await app.register(registerReportsModule, { prefix: '/reports' });
}
