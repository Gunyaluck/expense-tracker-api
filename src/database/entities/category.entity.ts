import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { CategoryKind } from '../enums/category-kind.enum';
import { BaseEntity } from './base.entity';
import { TransactionEntity } from './transaction.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'categories' })
@Index('idx_categories_user_id_name_kind', ['userId', 'name', 'kind'], { unique: true })
export class CategoryEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.categories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: CategoryKind })
  kind!: CategoryKind;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.category)
  transactions!: TransactionEntity[];
}
