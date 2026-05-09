import { SESSION_PAGE_SIZES } from '../auth/session.constants';

export type AllowedPageSize = (typeof SESSION_PAGE_SIZES)[number];

export interface PaginationQuery {
  page?: number;
  pageSize?: AllowedPageSize;
}

export interface PaginationMeta {
  page: number;
  pageSize: AllowedPageSize;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export function normalizePagination(query: PaginationQuery): Required<PaginationQuery> {
  const page = Math.max(query.page ?? 1, 1);
  const pageSize = SESSION_PAGE_SIZES.includes(query.pageSize ?? 20)
    ? (query.pageSize ?? 20)
    : 20;

  return { page, pageSize };
}

export function buildPaginationMeta(
  totalItems: number,
  query: PaginationQuery,
): PaginationMeta {
  const { page, pageSize } = normalizePagination(query);
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
