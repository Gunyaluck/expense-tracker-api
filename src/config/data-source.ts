import { DataSource } from 'typeorm';

import { env } from './env';
import { AccountEntity } from '../database/entities/account.entity';
import { CategoryEntity } from '../database/entities/category.entity';
import { MonthlyBudgetEntity } from '../database/entities/monthly-budget.entity';
import { SessionEntity } from '../database/entities/session.entity';
import { TransactionAttachmentEntity } from '../database/entities/transaction-attachment.entity';
import { TransactionEntity } from '../database/entities/transaction.entity';
import { UserEntity } from '../database/entities/user.entity';

export const appDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [
    UserEntity,
    AccountEntity,
    CategoryEntity,
    MonthlyBudgetEntity,
    TransactionEntity,
    TransactionAttachmentEntity,
    SessionEntity,
  ],
  migrations: ['src/database/migrations/*.{ts,js}'],
});
