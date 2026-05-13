import { TransactionAttachmentEntity } from '../../database/entities/transaction-attachment.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';

export function serializeAttachment(attachment: TransactionAttachmentEntity) {
  return {
    id: attachment.id,
    transactionId: attachment.transactionId,
    storageKey: attachment.storageKey,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    url: `/uploads/${attachment.storageKey}`,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

export function serializeTransaction(transaction: TransactionEntity) {
  return {
    id: transaction.id,
    userId: transaction.userId,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    type: transaction.type,
    amount: transaction.amount,
    occurredAt: transaction.occurredAt,
    note: transaction.noteSanitized,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    attachments: transaction.attachments?.map(serializeAttachment) ?? [],
    account: transaction.account
      ? {
          id: transaction.account.id,
          name: transaction.account.name,
          type: transaction.account.type,
          currencyCode: transaction.account.currencyCode,
          isActive: transaction.account.isActive,
        }
      : undefined,
    category: transaction.category
      ? {
          id: transaction.category.id,
          name: transaction.category.name,
          kind: transaction.category.kind,
          isActive: transaction.category.isActive,
        }
      : undefined,
  };
}
