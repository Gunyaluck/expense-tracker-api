import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from './base.entity';
import { TransactionEntity } from './transaction.entity';

@Entity({ name: 'transaction_attachments' })
@Index('idx_transaction_attachments_transaction_id', ['transactionId'])
export class TransactionAttachmentEntity extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => TransactionEntity, (transaction) => transaction.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: TransactionEntity;

  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey!: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;
}
