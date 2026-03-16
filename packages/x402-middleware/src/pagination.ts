// SPDX-License-Identifier: Apache-2.0
export interface PaginatedList<T> {
  data: T[];
  pagination: {
    total: number | null;
    per_page: number;
    next_cursor: string | null;
    has_more: boolean;
  };
}

export function parsePaginationParams(query: Record<string, string | undefined>): {
  limit: number;
  after: string | undefined;
} {
  const rawLimit = Number(query.limit ?? query.per_page ?? 20);
  const limit = Math.max(1, Math.min(100, Number.isNaN(rawLimit) ? 20 : rawLimit));
  const after = query.after ?? query.cursor;
  return { limit, after };
}

/**
 * Build a PaginatedList response from a page of rows.
 * Cursor is derived from the last row's ID when the page is full.
 */
export function paginate<T>(
  rows: T[],
  limit: number,
  getId: (row: T) => string,
  total?: number | null,
): PaginatedList<T> {
  const hasMore = rows.length === limit;
  const nextCursor = hasMore && rows.length > 0 ? getId(rows[rows.length - 1]) : null;
  return {
    data: rows,
    pagination: {
      total: total ?? null,
      per_page: limit,
      next_cursor: nextCursor,
      has_more: hasMore,
    },
  };
}
