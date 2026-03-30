// ============================================================================
// Transaction Cache - Offline Transaction Queue
// ============================================================================

import { createLogger } from '../utils/Logger';
import { CachedTransaction, NetworkType, MidnightErrorCode, MidnightError } from '../types';
import { StorageAdapter } from './StorageAdapter';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('TransactionCache');
const CACHE_PREFIX = 'tx_cache_';

/**
 * Transaction cache for offline queue
 * Stores transactions that failed to send and can be retried
 */
export class TransactionCache {
  private storage: StorageAdapter;
  private cacheTtl: number; // Time to live in ms
  private maxCacheSize: number;

  constructor(
    storage: StorageAdapter,
    options: {
      ttl?: number; // Default: 24 hours
      maxCacheSize?: number; // Default: 100 transactions
    } = {}
  ) {
    this.storage = storage;
    this.cacheTtl = options.ttl ?? 24 * 60 * 60 * 1000;
    this.maxCacheSize = options.maxCacheSize ?? 100;
  }

  /**
   * Add a transaction to the cache
   */
  async add(transaction: Uint8Array, network: NetworkType, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<string> {
    const id = uuidv4();
    const cached: CachedTransaction = {
      id,
      transaction,
      createdAt: Date.now(),
      retryCount: 0,
      network,
      priority,
    };

    const key = this.getCacheKey(id);
    await this.storage.put(key, this.serialize(cached));

    // Clean up old transactions if cache is full
    await this.cleanupIfNeeded();

    logger.debug(`Transaction cached: ${id}`);
    return id;
  }

  /**
   * Get a cached transaction by ID
   */
  async get(id: string): Promise<CachedTransaction | null> {
    const key = this.getCacheKey(id);
    const value = await this.storage.get(key);

    if (!value) {
      return null;
    }

    const cached = this.deserialize(value);

    // Check if expired
    if (Date.now() - cached.createdAt > this.cacheTtl) {
      await this.remove(id);
      return null;
    }

    return cached;
  }

  /**
   * Remove a transaction from cache
   */
  async remove(id: string): Promise<void> {
    const key = this.getCacheKey(id);
    await this.storage.del(key);
    logger.debug(`Transaction removed from cache: ${id}`);
  }

  /**
   * Get all cached transactions for a network
   */
  async getAll(network: NetworkType): Promise<CachedTransaction[]> {
    const all = await this.getAllCached();
    return all.filter((tx) => tx.network === network);
  }

  /**
   * Get pending transactions ordered by priority
   */
  async getPending(network: NetworkType): Promise<CachedTransaction[]> {
    const all = await this.getAll(network);

    // Filter by TTL
    const now = Date.now();
    const valid = all.filter((tx) => now - tx.createdAt < this.cacheTtl);

    // Sort by priority (high first) and creation time
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    valid.sort((a, b) => {
      const pa = priorityOrder[a.priority];
      const pb = priorityOrder[b.priority];
      if (pa !== pb) {
        return pa - pb;
      }
      return a.createdAt - b.createdAt;
    });

    return valid;
  }

  /**
   * Increment retry count for a transaction
   */
  async incrementRetry(id: string): Promise<void> {
    const cached = await this.get(id);
    if (!cached) {
      return;
    }

    cached.retryCount++;
    const key = this.getCacheKey(id);
    await this.storage.put(key, this.serialize(cached));
  }

  /**
   * Clear all cached transactions for a network
   */
  async clear(network?: NetworkType): Promise<void> {
    const all = await this.getAllCached();

    for (const tx of all) {
      if (!network || tx.network === network) {
        await this.remove(tx.id);
      }
    }

    logger.info(`Cleared ${network ?? 'all'} transaction cache`);
  }

  /**
   * Clean up expired transactions
   */
  async cleanup(): Promise<number> {
    const all = await this.getAllCached();
    const now = Date.now();
    let removed = 0;

    for (const tx of all) {
      if (now - tx.createdAt > this.cacheTtl) {
        await this.remove(tx.id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} expired transactions`);
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  async getStats(network?: NetworkType): Promise<{
    count: number;
    highPriority: number;
    normalPriority: number;
    lowPriority: number;
    totalRetries: number;
  }> {
    const all = network ? await this.getAll(network) : await this.getAllCached();

    const stats = {
      count: all.length,
      highPriority: 0,
      normalPriority: 0,
      lowPriority: 0,
      totalRetries: 0,
    };

    for (const tx of all) {
      stats[`${tx.priority}Priority` as keyof typeof stats]++;
      stats.totalRetries += tx.retryCount;
    }

    return stats;
  }

  /**
   * Re-send cached transactions
   * Returns a function to cancel the retry process
   */
  async retryPending(
    network: NetworkType,
    sender: (tx: CachedTransaction) => Promise<boolean>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<void> {
    const { maxRetries = 3, retryDelay = 1000, onProgress } = options;
    const pending = await this.getPending(network);

    if (pending.length === 0) {
      logger.debug('No pending transactions to retry');
      return;
    }

    logger.info(`Retrying ${pending.length} pending transactions`);

    let completed = 0;
    const total = pending.length;

    for (const tx of pending) {
      // Check retry limit
      if (tx.retryCount >= maxRetries) {
        logger.warn(`Transaction ${tx.id} exceeded max retries, removing`);
        await this.remove(tx.id);
        completed++;
        onProgress?.(completed, total);
        continue;
      }

      try {
        const success = await sender(tx);

        if (success) {
          logger.info(`Transaction ${tx.id} sent successfully, removing from cache`);
          await this.remove(tx.id);
        } else {
          await this.incrementRetry(tx.id);
          logger.debug(`Transaction ${tx.id} failed to send (attempt ${tx.retryCount})`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        logger.error(`Error retrying transaction ${tx.id}`, error);
        await this.incrementRetry(tx.id);
      }

      completed++;
      onProgress?.(completed, total);
    }
  }

  /**
   * Clean up if cache is full
   */
  private async cleanupIfNeeded(): Promise<void> {
    const all = await this.getAllCached();

    if (all.length <= this.maxCacheSize) {
      return;
    }

    // Remove oldest low priority transactions first
    const sorted = [...all].sort((a, b) => {
      // First by priority
      const priorityOrder = { low: 0, normal: 1, high: 2 };
      const pa = priorityOrder[a.priority];
      const pb = priorityOrder[b.priority];
      if (pa !== pb) {
        return pa - pb;
      }
      // Then by age (oldest first)
      return a.createdAt - b.createdAt;
    });

    const toRemove = all.length - this.maxCacheSize;
    for (let i = 0; i < toRemove; i++) {
      await this.remove(sorted[i].id);
    }

    logger.debug(`Removed ${toRemove} old transactions from cache`);
  }

  /**
   * Get all cached transactions
   */
  private async getAllCached(): Promise<CachedTransaction[]> {
    const entries: CachedTransaction[] = [];
    const iter = this.storage.iterator({ gte: CACHE_PREFIX, lte: CACHE_PREFIX + '\uffff' });

    try {
      let result = await iter.next();
      while (!result.done) {
        try {
          const cached = this.deserialize(result.value.value);
          entries.push(cached);
        } catch (error) {
          logger.warn('Failed to deserialize cached transaction', error);
        }
        result = await iter.next();
      }
    } finally {
      await iter.return?.();
    }

    return entries;
  }

  /**
   * Get cache key for transaction ID
   */
  private getCacheKey(id: string): string {
    return `${CACHE_PREFIX}${id}`;
  }

  /**
   * Serialize cached transaction
   */
  private serialize(cached: CachedTransaction): Uint8Array {
    const json = JSON.stringify({
      ...cached,
      transaction: Array.from(cached.transaction),
    });
    return new TextEncoder().encode(json);
  }

  /**
   * Deserialize cached transaction
   */
  private deserialize(data: Uint8Array): CachedTransaction {
    const parsed = JSON.parse(new TextDecoder().decode(data));
    return {
      ...parsed,
      transaction: new Uint8Array(parsed.transaction),
    };
  }
}

/**
 * Create a transaction cache instance
 */
export async function createTransactionCache(
  storage: StorageAdapter,
  options?: {
    ttl?: number;
    maxCacheSize?: number;
  }
): Promise<TransactionCache> {
  const cache = new TransactionCache(storage, options);
  await cache.cleanup(); // Clean up expired on init
  return cache;
}
