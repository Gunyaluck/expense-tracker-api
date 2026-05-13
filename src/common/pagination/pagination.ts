import { PAGE_SIZES } from '../validation/joi';

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
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
  const requestedPageSize = query.pageSize ?? 20;
  const pageSize = PAGE_SIZES.includes(requestedPageSize as (typeof PAGE_SIZES)[number])
    ? requestedPageSize
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
