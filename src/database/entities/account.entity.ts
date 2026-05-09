import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

import { AccountType } from '../enums/account-type.enum';
import { BaseEntity } from './base.entity';
import { TransactionEntity } from './transaction.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'accounts' })
@Index('idx_accounts_user_id_name', ['userId', 'name'], { unique: true })
export class AccountEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: AccountType })
  type!: AccountType;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'THB' })
  currencyCode!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.account)
  transactions!: TransactionEntity[];
}
