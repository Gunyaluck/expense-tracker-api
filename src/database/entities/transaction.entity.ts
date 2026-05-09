import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { TransactionType } from '../enums/transaction-type.enum';
import { AccountEntity } from './account.entity';
import { BaseEntity } from './base.entity';
import { CategoryEntity } from './category.entity';
import { TransactionAttachmentEntity } from './transaction-attachment.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'transactions' })
@Index('idx_transactions_user_occurred_at', ['userId', 'occurredAt'])
@Index('idx_transactions_account_occurred_at', ['accountId', 'occurredAt'])
@Index('idx_transactions_category_occurred_at', ['categoryId', 'occurredAt'])
export class TransactionEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => AccountEntity, (account) => account.transactions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => CategoryEntity, (category) => category.transactions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'note_sanitized', type: 'text', nullable: true })
  noteSanitized!: string | null;

  @OneToMany(() => TransactionAttachmentEntity, (attachment) => attachment.transaction)
  attachments!: TransactionAttachmentEntity[];
}
