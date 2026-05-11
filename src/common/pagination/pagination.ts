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
  const pageSize = Math.min(Math.max(requestedPageSize, 1), 100);

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
