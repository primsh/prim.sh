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
