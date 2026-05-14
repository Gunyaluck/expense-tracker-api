import { Column, Entity, OneToMany } from 'typeorm';

import { Locale } from '../enums/locale.enum';
import { AccountEntity } from './account.entity';
import { BaseEntity } from './base.entity';
import { CategoryEntity } from './category.entity';
import { MonthlyBudgetEntity } from './monthly-budget.entity';
import { SessionEntity } from './session.entity';
import { TransactionEntity } from './transaction.entity';

@Entity({ name: 'users' })
export class UserEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'enum', enum: Locale, default: Locale.EN })
  locale!: Locale;

  @OneToMany(() => AccountEntity, (account) => account.user)
  accounts!: AccountEntity[];

  @OneToMany(() => CategoryEntity, (category) => category.user)
  categories!: CategoryEntity[];

  @OneToMany(() => MonthlyBudgetEntity, (budget) => budget.user)
  budgets!: MonthlyBudgetEntity[];

  @OneToMany(() => TransactionEntity, (transaction) => transaction.user)
  transactions!: TransactionEntity[];

  @OneToMany(() => SessionEntity, (session) => session.user)
  sessions!: SessionEntity[];
}
