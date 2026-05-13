import { appDataSource } from '../../config/data-source';
import { AccountEntity } from '../../database/entities/account.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionAttachmentEntity } from '../../database/entities/transaction-attachment.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { TransactionType } from '../../database/enums/transaction-type.enum';

export function toMoneyString(amount: number): string {
  return amount.toFixed(2);
}

export async function findOwnedTransaction(transactionId: string, userId: string) {
  return appDataSource.getRepository(TransactionEntity).findOne({
    where: {
      id: transactionId,
      userId,
    },
    relations: {
      account: true,
      category: true,
      attachments: true,
    },
  });
}

export async function findOwnedAttachment(params: {
  transactionId: string;
  attachmentId: string;
  userId: string;
}) {
  return appDataSource
    .getRepository(TransactionAttachmentEntity)
    .createQueryBuilder('attachment')
    .innerJoinAndSelect('attachment.transaction', 'transaction')
    .where('attachment.id = :attachmentId', { attachmentId: params.attachmentId })
    .andWhere('attachment.transaction_id = :transactionId', { transactionId: params.transactionId })
    .andWhere('transaction.user_id = :userId', { userId: params.userId })
    .getOne();
}

export async function resolveTransactionDependencies(params: {
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
}) {
  const accountRepository = appDataSource.getRepository(AccountEntity);
  const categoryRepository = appDataSource.getRepository(CategoryEntity);

  const [account, category] = await Promise.all([
    accountRepository.findOne({
      where: {
        id: params.accountId,
        userId: params.userId,
        isActive: true,
      },
    }),
    categoryRepository.findOne({
      where: {
        id: params.categoryId,
        userId: params.userId,
        isActive: true,
      },
    }),
  ]);

  if (!account) {
    return {
      error: {
        code: 400,
        message: 'Account not found or inactive.',
      },
    };
  }

  if (!category) {
    return {
      error: {
        code: 400,
        message: 'Category not found or inactive.',
      },
    };
  }

  if (String(category.kind) !== String(params.type)) {
    return {
      error: {
        code: 400,
        message: 'Category kind must match transaction type.',
      },
    };
  }

  return {
    account,
    category,
  };
}

export async function createTransactionRecord(params: {
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  note: string | null;
  noteSanitized: string | null;
}) {
  const transactionRepository = appDataSource.getRepository(TransactionEntity);
  const transaction = transactionRepository.create({
    userId: params.userId,
    accountId: params.accountId,
    categoryId: params.categoryId,
    type: params.type,
    amount: toMoneyString(params.amount),
    occurredAt: new Date(params.occurredAt),
    note: params.note,
    noteSanitized: params.noteSanitized,
  });

  await transactionRepository.save(transaction);

  return findOwnedTransaction(transaction.id, params.userId);
}

export async function listTransactions(params: {
  userId: string;
  page: number;
  pageSize: number;
  month: number | undefined;
  year: number | undefined;
  categoryId: string | undefined;
  accountId: string | undefined;
  type: TransactionType | undefined;
  fromDate: string | undefined;
  toDate: string | undefined;
}) {
  const transactionRepository = appDataSource.getRepository(TransactionEntity);
  const queryBuilder = transactionRepository
    .createQueryBuilder('transaction')
    .leftJoinAndSelect('transaction.account', 'account')
    .leftJoinAndSelect('transaction.category', 'category')
    .leftJoinAndSelect('transaction.attachments', 'attachments')
    .where('transaction.user_id = :userId', { userId: params.userId });

  if (params.accountId) {
    queryBuilder.andWhere('transaction.account_id = :accountId', {
      accountId: params.accountId,
    });
  }

  if (params.categoryId) {
    queryBuilder.andWhere('transaction.category_id = :categoryId', {
      categoryId: params.categoryId,
    });
  }

  if (params.type) {
    queryBuilder.andWhere('transaction.type = :type', {
      type: params.type,
    });
  }

  if (params.year) {
    queryBuilder.andWhere('EXTRACT(YEAR FROM transaction.occurred_at) = :year', {
      year: params.year,
    });
  }

  if (params.month) {
    queryBuilder.andWhere('EXTRACT(MONTH FROM transaction.occurred_at) = :month', {
      month: params.month,
    });
  }

  if (params.fromDate) {
    queryBuilder.andWhere('transaction.occurred_at >= :fromDate', {
      fromDate: new Date(params.fromDate).toISOString(),
    });
  }

  if (params.toDate) {
    queryBuilder.andWhere('transaction.occurred_at <= :toDate', {
      toDate: new Date(params.toDate).toISOString(),
    });
  }

  return queryBuilder
    .orderBy('transaction.occurredAt', 'DESC')
    .addOrderBy('transaction.createdAt', 'DESC')
    .skip((params.page - 1) * params.pageSize)
    .take(params.pageSize)
    .getManyAndCount();
}

export async function updateTransactionRecord(params: {
  transactionId: string;
  userId: string;
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number | undefined;
  occurredAt: string | undefined;
  noteIncluded: boolean;
  note: string | null;
  noteSanitized: string | null;
}) {
  const transactionRepository = appDataSource.getRepository(TransactionEntity);
  const transaction = await transactionRepository.findOne({
    where: {
      id: params.transactionId,
      userId: params.userId,
    },
  });

  if (!transaction) {
    return null;
  }

  transaction.accountId = params.accountId;
  transaction.categoryId = params.categoryId;
  transaction.type = params.type;

  if (typeof params.amount === 'number') {
    transaction.amount = toMoneyString(params.amount);
  }

  if (params.occurredAt) {
    transaction.occurredAt = new Date(params.occurredAt);
  }

  if (params.noteIncluded) {
    transaction.note = params.note;
    transaction.noteSanitized = params.noteSanitized;
  }

  await transactionRepository.save(transaction);

  return findOwnedTransaction(transaction.id, params.userId);
}

export async function createAttachmentRecord(params: {
  transactionId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}) {
  const attachmentRepository = appDataSource.getRepository(TransactionAttachmentEntity);
  const attachment = attachmentRepository.create({
    transactionId: params.transactionId,
    storageKey: params.storageKey,
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
  });

  await attachmentRepository.save(attachment);

  return attachment;
}

export async function removeAttachmentRecord(attachment: TransactionAttachmentEntity) {
  await appDataSource.getRepository(TransactionAttachmentEntity).remove(attachment);
}

export async function removeTransactionRecord(params: {
  transactionId: string;
  userId: string;
}) {
  const transactionRepository = appDataSource.getRepository(TransactionEntity);
  const transaction = await transactionRepository.findOne({
    where: {
      id: params.transactionId,
      userId: params.userId,
    },
  });

  if (!transaction) {
    return false;
  }

  await transactionRepository.remove(transaction);

  return true;
}
