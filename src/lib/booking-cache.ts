import { LRUCache } from "lru-cache";

export const completedBookingCache = new LRUCache<string, true>({
  max: 10000,
  ttl: 24 * 60 * 60 * 1000,
});
