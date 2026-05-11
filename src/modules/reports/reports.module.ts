import type { FastifyPluginAsync } from 'fastify';

import { requireSession } from '../../common/auth/session.guard';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { TransactionType } from '../../database/enums/transaction-type.enum';
import { summaryQuerySchema } from './reports.schemas';

type SummaryGroupBy = 'day' | 'month' | 'year';

function getPeriodExpression(groupBy: SummaryGroupBy): string {
  switch (groupBy) {
    case 'day':
      return `TO_CHAR(transaction.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    case 'month':
      return `TO_CHAR(transaction.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM')`;
    case 'year':
      return `TO_CHAR(transaction.occurred_at AT TIME ZONE 'UTC', 'YYYY')`;
  }
}

function toMoneyString(value: string | number | null | undefined): string {
  const normalized = Number(value ?? 0);

  return normalized.toFixed(2);
}

export const registerReportsModule: FastifyPluginAsync = async (app) => {
  app.get(
    '/summary',
    {
      preValidation: [requireSession, validateRequestPart(summaryQuerySchema, 'query')],
    },
    async (request) => {
      const query = request.query as {
        groupBy: SummaryGroupBy;
        month?: number;
        year?: number;
        categoryId?: string;
        accountId?: string;
        type?: TransactionType;
        fromDate?: string;
        toDate?: string;
      };
      const transactionRepository = appDataSource.getRepository('transactions');
      const baseQuery = transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.user_id = :userId', { userId: request.session!.userId });

      if (query.accountId) {
        baseQuery.andWhere('transaction.account_id = :accountId', {
          accountId: query.accountId,
        });
      }

      if (query.categoryId) {
        baseQuery.andWhere('transaction.category_id = :categoryId', {
          categoryId: query.categoryId,
        });
      }

      if (query.type) {
        baseQuery.andWhere('transaction.type = :type', {
          type: query.type,
        });
      }

      if (query.year) {
        baseQuery.andWhere('EXTRACT(YEAR FROM transaction.occurred_at) = :year', {
          year: query.year,
        });
      }

      if (query.month) {
        baseQuery.andWhere('EXTRACT(MONTH FROM transaction.occurred_at) = :month', {
          month: query.month,
        });
      }

      if (query.fromDate) {
        baseQuery.andWhere('transaction.occurred_at >= :fromDate', {
          fromDate: new Date(query.fromDate).toISOString(),
        });
      }

      if (query.toDate) {
        baseQuery.andWhere('transaction.occurred_at <= :toDate', {
          toDate: new Date(query.toDate).toISOString(),
        });
      }

      const totalRow = await baseQuery
        .clone()
        .select([
          `COALESCE(SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END), 0) AS "incomeTotal"`,
          `COALESCE(SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END), 0) AS "expenseTotal"`,
          `COALESCE(SUM(CASE
            WHEN transaction.type = 'income' THEN transaction.amount
            WHEN transaction.type = 'expense' THEN -transaction.amount
            ELSE 0
          END), 0) AS "netTotal"`,
          `COUNT(*)::int AS "transactionCount"`,
        ])
        .getRawOne<{
          incomeTotal: string;
          expenseTotal: string;
          netTotal: string;
          transactionCount: number;
        }>();

      const periodExpression = getPeriodExpression(query.groupBy);
      const seriesRows = await baseQuery
        .clone()
        .select(`${periodExpression}`, 'period')
        .addSelect(
          `COALESCE(SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END), 0)`,
          'incomeTotal',
        )
        .addSelect(
          `COALESCE(SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END), 0)`,
          'expenseTotal',
        )
        .addSelect(
          `COALESCE(SUM(CASE
            WHEN transaction.type = 'income' THEN transaction.amount
            WHEN transaction.type = 'expense' THEN -transaction.amount
            ELSE 0
          END), 0)`,
          'netTotal',
        )
        .addSelect('COUNT(*)::int', 'transactionCount')
        .groupBy(periodExpression)
        .orderBy('period', 'ASC')
        .getRawMany<{
          period: string;
          incomeTotal: string;
          expenseTotal: string;
          netTotal: string;
          transactionCount: number;
        }>();

      return {
        groupBy: query.groupBy,
        filters: {
          month: query.month ?? null,
          year: query.year ?? null,
          categoryId: query.categoryId ?? null,
          accountId: query.accountId ?? null,
          type: query.type ?? null,
          fromDate: query.fromDate ?? null,
          toDate: query.toDate ?? null,
        },
        totals: {
          incomeTotal: toMoneyString(totalRow?.incomeTotal),
          expenseTotal: toMoneyString(totalRow?.expenseTotal),
          netTotal: toMoneyString(totalRow?.netTotal),
          transactionCount: Number(totalRow?.transactionCount ?? 0),
        },
        items: seriesRows.map((row) => ({
          period: row.period,
          incomeTotal: toMoneyString(row.incomeTotal),
          expenseTotal: toMoneyString(row.expenseTotal),
          netTotal: toMoneyString(row.netTotal),
          transactionCount: Number(row.transactionCount),
        })),
      };
    },
  );
};
