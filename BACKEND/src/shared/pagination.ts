import { z } from 'zod';

export const cursorQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.uuid().optional(),
};

/** Fetch `limit + 1` rows, then call this to split off the "has more" row. */
export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, page: { nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null, limit } };
}
