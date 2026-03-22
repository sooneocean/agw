export function parsePagination(query: { limit?: string; offset?: string }): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 200),
    offset: Math.max(parseInt(query.offset ?? '0', 10) || 0, 0),
  };
}
