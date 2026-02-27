export interface PaginatedList<T> {
  data: T[];
  pagination: {
    total: number | null;
    page: number | null;
    per_page: number;
    cursor: string | null;
    has_more: boolean;
  };
}

export function parsePaginationParams(query: Record<string, string | undefined>): {
  limit: number;
  page: number;
  cursor: string | undefined;
} {
  const rawLimit = Number(query.limit ?? query.per_page ?? 20);
  const limit = Math.max(1, Math.min(100, Number.isNaN(rawLimit) ? 20 : rawLimit));
  const rawPage = Number(query.page ?? 1);
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
  const cursor = query.cursor ?? query.after;
  return { limit, page, cursor };
}
