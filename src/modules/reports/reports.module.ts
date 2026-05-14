import type { FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';

import { requireSession } from '../../common/auth/session.guard';
import { validateRequestPart } from '../../common/validation/joi';
import { appDataSource } from '../../config/data-source';
import { MonthlyBudgetEntity } from '../../database/entities/monthly-budget.entity';
import { TransactionType } from '../../database/enums/transaction-type.enum';
import {
  dailyAllowanceQuerySchema,
  monthlyBudgetBodySchema,
  summaryExportQuerySchema,
  summaryQuerySchema,
} from './reports.schemas';

type SummaryGroupBy = 'day' | 'month' | 'year';
type ExportFormat = 'json' | 'csv' | 'excel' | 'googleSheet';
type SummaryQuery = {
  groupBy: SummaryGroupBy;
  month?: number;
  year?: number;
  categoryId?: string;
  accountId?: string;
  type?: TransactionType;
  fromDate?: string;
  toDate?: string;
};

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

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end };
}

function getDaysRemainingInMonth(year: number, month: number, asOfDate: Date): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const asOfDay =
    asOfDate.getUTCFullYear() === year && asOfDate.getUTCMonth() === month - 1
      ? asOfDate.getUTCDate()
      : 1;

  return Math.max(lastDay - asOfDay + 1, 0);
}

async function buildSummary(userId: string, query: SummaryQuery) {
  const transactionRepository = appDataSource.getRepository('transactions');
  const baseQuery = transactionRepository
    .createQueryBuilder('transaction')
    .where('transaction.user_id = :userId', { userId });

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
}

export const registerReportsModule: FastifyPluginAsync = async (app) => {
  app.get(
    '/summary',
    {
      preValidation: [requireSession, validateRequestPart(summaryQuerySchema, 'query')],
    },
    async (request) => buildSummary(request.session!.userId, request.query as SummaryQuery),
  );

  app.get(
    '/summary/export',
    {
      preValidation: [requireSession, validateRequestPart(summaryExportQuerySchema, 'query')],
    },
    async (request, reply) => {
      const query = request.query as SummaryQuery & { format: ExportFormat };
      const summary = await buildSummary(request.session!.userId, query);

      if (query.format === 'json') {
        return summary;
      }

      const rows = summary.items.map((item) => ({
        period: item.period,
        incomeTotal: item.incomeTotal,
        expenseTotal: item.expenseTotal,
        netTotal: item.netTotal,
        transactionCount: item.transactionCount,
      }));

      if (query.format === 'csv' || query.format === 'googleSheet') {
        const csv = stringify(rows, { header: true });

        return reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', 'attachment; filename="summary.csv"')
          .send(csv);
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Summary');
      worksheet.columns = [
        { header: 'Period', key: 'period', width: 16 },
        { header: 'Income Total', key: 'incomeTotal', width: 16 },
        { header: 'Expense Total', key: 'expenseTotal', width: 16 },
        { header: 'Net Total', key: 'netTotal', width: 16 },
        { header: 'Transaction Count', key: 'transactionCount', width: 20 },
      ];
      worksheet.addRows(rows);

      const buffer = await workbook.xlsx.writeBuffer();

      return reply
        .header(
          'content-type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('content-disposition', 'attachment; filename="summary.xlsx"')
        .send(Buffer.from(buffer));
    },
  );

  app.put(
    '/monthly-budget',
    {
      preValidation: [requireSession, validateRequestPart(monthlyBudgetBodySchema, 'body')],
    },
    async (request) => {
      const payload = request.body as {
        year: number;
        month: number;
        plannedExpenseLimit: number;
      };
      const budgetRepository = appDataSource.getRepository(MonthlyBudgetEntity);
      const existing = await budgetRepository.findOne({
        where: {
          userId: request.session!.userId,
          year: payload.year,
          month: payload.month,
        },
      });
      const budget =
        existing ??
        budgetRepository.create({
          userId: request.session!.userId,
          year: payload.year,
          month: payload.month,
        });

      budget.plannedExpenseLimit = toMoneyString(payload.plannedExpenseLimit);
      await budgetRepository.save(budget);

      return {
        item: {
          id: budget.id,
          year: budget.year,
          month: budget.month,
          plannedExpenseLimit: budget.plannedExpenseLimit,
        },
      };
    },
  );

  app.get(
    '/daily-allowance',
    {
      preValidation: [requireSession, validateRequestPart(dailyAllowanceQuerySchema, 'query')],
    },
    async (request) => {
      const query = request.query as {
        year: number;
        month: number;
        asOfDate?: string;
        basis: 'remaining' | 'budget';
      };
      const { start, end } = getMonthRange(query.year, query.month);
      const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
      const transactionRepository = appDataSource.getRepository('transactions');
      const totalRow = await transactionRepository
        .createQueryBuilder('transaction')
        .select([
          `COALESCE(SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END), 0) AS "incomeTotal"`,
          `COALESCE(SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END), 0) AS "expenseTotal"`,
        ])
        .where('transaction.user_id = :userId', { userId: request.session!.userId })
        .andWhere('transaction.occurred_at >= :start', { start: start.toISOString() })
        .andWhere('transaction.occurred_at < :end', { end: end.toISOString() })
        .getRawOne<{ incomeTotal: string; expenseTotal: string }>();
      const budget = await appDataSource.getRepository(MonthlyBudgetEntity).findOne({
        where: {
          userId: request.session!.userId,
          year: query.year,
          month: query.month,
        },
      });
      const incomeTotal = Number(totalRow?.incomeTotal ?? 0);
      const expenseTotal = Number(totalRow?.expenseTotal ?? 0);
      const remainingTotal = incomeTotal - expenseTotal;
      const plannedExpenseLimit = Number(budget?.plannedExpenseLimit ?? 0);
      const budgetRemaining = Math.max(plannedExpenseLimit - expenseTotal, 0);
      const daysRemaining = getDaysRemainingInMonth(query.year, query.month, asOfDate);
      const allowanceBase = query.basis === 'budget' ? budgetRemaining : remainingTotal;
      const dailyAllowance = daysRemaining > 0 ? allowanceBase / daysRemaining : 0;

      return {
        year: query.year,
        month: query.month,
        basis: query.basis,
        asOfDate: asOfDate.toISOString(),
        daysRemaining,
        incomeTotal: toMoneyString(incomeTotal),
        expenseTotal: toMoneyString(expenseTotal),
        remainingTotal: toMoneyString(remainingTotal),
        plannedExpenseLimit: budget ? toMoneyString(plannedExpenseLimit) : null,
        budgetRemaining: budget ? toMoneyString(budgetRemaining) : null,
        dailyAllowance: toMoneyString(dailyAllowance),
      };
    },
  );
};
