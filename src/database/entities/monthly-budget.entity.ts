import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from './base.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'monthly_budgets' })
@Index('idx_monthly_budgets_user_month', ['userId', 'year', 'month'], { unique: true })
export class MonthlyBudgetEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.budgets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'planned_expense_limit', type: 'numeric', precision: 14, scale: 2 })
  plannedExpenseLimit!: string;
}
