// ============================================================================
// Storage Adapter Interface
// ============================================================================

import { IStorageAdapter, Entry, MidnightErrorCode, MidnightError } from '../types';
import { createLogger } from '../utils/Logger';

const logger = createLogger('StorageAdapter');

/**
 * Abstract base class for storage adapters
 * Provides LevelDB-like interface with async/await
 */
export abstract class StorageAdapter implements IStorageAdapter {
  protected readonly dbName: string;
  protected initialized: boolean = false;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  /**
   * Initialize the storage
   */
  abstract initialize(): Promise<void>;

  /**
   * Get a value by key
   */
  abstract get(key: string): Promise<Uint8Array | undefined>;

  /**
   * Put a value
   */
  abstract put(key: string, value: Uint8Array): Promise<void>;

  /**
   * Delete a value
   */
  abstract del(key: string): Promise<void>;

  /**
   * Get multiple values
   */
  async getBatch(keys: string[]): Promise<(Uint8Array | undefined)[]> {
    const results = await Promise.all(keys.map((key) => this.get(key)));
    return results;
  }

  /**
   * Put multiple values
   */
  async putBatch(entries: Array<{ key: string; value: Uint8Array }>): Promise<void> {
    await Promise.all(entries.map((entry) => this.put(entry.key, entry.value)));
  }

  /**
   * Delete multiple keys
   */
  async delBatch(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.del(key)));
  }

  /**
   * Create an async iterator for range queries
   */
  abstract iterator(
    opts?: { gte?: string; lte?: string; limit?: number; reverse?: boolean }
  ): AsyncIterator<Entry>;

  /**
   * Get all values in a range
   */
  async getAll(opts?: { gte?: string; lte?: string; limit?: number }): Promise<Entry[]> {
    const entries: Entry[] = [];
    const iter = this.iterator(opts);

    try {
      let result = await iter.next();
      while (!result.done) {
        entries.push(result.value);
        if (opts?.limit && entries.length >= opts.limit) {
          break;
        }
        result = await iter.next();
      }
    } finally {
      await iter.return?.();
    }

    return entries;
  }

  /**
   * Clear all data
   */
  abstract clear(): Promise<void>;

  /**
   * Close the storage
   */
  abstract close(): Promise<void>;

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Convert string key to buffer
   */
  protected keyToBuffer(key: string): Uint8Array {
    return new TextEncoder().encode(key);
  }

  /**
   * Convert buffer to string key
   */
  protected bufferToKey(buffer: Uint8Array): string {
    return new TextDecoder().decode(buffer);
  }

  /**
   * Convert value to buffer
   */
  protected valueToBuffer(value: string | Uint8Array): Uint8Array {
    if (typeof value === 'string') {
      return new TextEncoder().encode(value);
    }
    return value;
  }

  /**
   * Convert buffer to value
   */
  protected bufferToValue(buffer: Uint8Array): Uint8Array {
    return buffer;
  }

  /**
   * Ensure storage is initialized
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      throw new MidnightError(
        MidnightErrorCode.STORAGE_ERROR,
        'Storage adapter not initialized'
      );
    }
  }
}

/**
 * In-memory storage adapter for testing/fallback
 */
export class MemoryStorageAdapter extends StorageAdapter {
  private store: Map<string, Uint8Array> = new Map();

  constructor(dbName: string = ':memory:') {
    super(dbName);
    this.initialized = true;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.debug('Memory storage initialized');
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    await this.ensureInitialized();
    return this.store.get(key);
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    await this.ensureInitialized();
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.ensureInitialized();
    this.store.delete(key);
  }

  async *iterator(opts: {
    gte?: string;
    lte?: string;
    limit?: number;
    reverse?: boolean;
  } = {}): AsyncIterator<Entry> {
    await this.ensureInitialized();

    let keys = Array.from(this.store.keys());

    // Filter by range
    if (opts.gte) {
      keys = keys.filter((k) => k >= opts.gte!);
    }
    if (opts.lte) {
      keys = keys.filter((k) => k <= opts.lte!);
    }

    // Sort
    keys.sort();
    if (opts.reverse) {
      keys.reverse();
    }

    // Apply limit
    if (opts.limit) {
      keys = keys.slice(0, opts.limit);
    }

    for (const key of keys) {
      const value = this.store.get(key);
      if (value) {
        yield { key, value };
      }
    }
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.store.clear();
  }

  async close(): Promise<void> {
    this.store.clear();
    this.initialized = false;
  }

  /**
   * Get approximate size in bytes
   */
  getSize(): number {
    let size = 0;
    for (const [key, value] of this.store.entries()) {
      size += key.length + value.length;
    }
    return size;
  }
}
