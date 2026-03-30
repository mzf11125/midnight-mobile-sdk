// ============================================================================
// SQLite Private State Storage (LevelDB-compatible)
// ============================================================================

import { StorageAdapter, MemoryStorageAdapter } from './StorageAdapter';
import { createLogger } from '../utils/Logger';
import { MidnightError, MidnightErrorCode } from '../types';

const logger = createLogger('SQLitePrivateState');

/**
 * SQLite-based storage adapter
 * Provides LevelDB-compatible API using react-native-quick-sqlite
 *
 * Note: This is a wrapper interface. The actual SQLite implementation
 * requires native modules. Falls back to memory storage if unavailable.
 */
export class SQLitePrivateState extends StorageAdapter {
  private db: any = null;
  private tableName: string;
  private useMemory: boolean = false;
  private memoryFallback: MemoryStorageAdapter | null = null;

  constructor(dbName: string, tableName: string = 'private_state') {
    super(dbName);
    this.tableName = tableName;
  }

  /**
   * Initialize SQLite database
   */
  async initialize(): Promise<void> {
    try {
      // Try to import and use react-native-quick-sqlite
      const SQLite = await this.importSQLite();

      if (!SQLite) {
        logger.warn('SQLite not available, falling back to memory storage');
        this.useMemory = true;
        this.memoryFallback = new MemoryStorageAdapter(this.dbName);
        await this.memoryFallback.initialize();
        this.initialized = true;
        return;
      }

      // Open database connection
      this.db = SQLite.open(this.dbName);

      // Create table if not exists
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key TEXT PRIMARY KEY NOT NULL,
          value BLOB NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `;

      SQLite.execute(this.db, createTableSql, []);

      // Create indexes for common queries
      const indexSql = `
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_key
        ON ${this.tableName} (key)
      `;
      SQLite.execute(this.db, indexSql, []);

      this.initialized = true;
      logger.debug(`SQLite storage initialized: ${this.dbName}/${this.tableName}`);
    } catch (error) {
      logger.error('SQLite initialization failed, using memory storage', error);
      this.useMemory = true;
      this.memoryFallback = new MemoryStorageAdapter(this.dbName);
      await this.memoryFallback.initialize();
      this.initialized = true;
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<Uint8Array | undefined> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.get(key);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      const sql = `SELECT value FROM ${this.tableName} WHERE key = ? LIMIT 1`;
      const result = SQLite.execute(this.db, sql, [key]);

      if (result && result.rows && result.rows.length > 0) {
        const value = result.rows[0].value;
        // Convert base64 string back to Uint8Array
        return this.base64ToUint8Array(value);
      }

      return undefined;
    } catch (error) {
      logger.error(`Failed to get key: ${key}`, error);
      return undefined;
    }
  }

  /**
   * Put a value
   */
  async put(key: string, value: Uint8Array): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.put(key, value);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      // Convert Uint8Array to base64 for SQLite storage
      const base64Value = this.uint8ArrayToBase64(value);

      const sql = `
        INSERT OR REPLACE INTO ${this.tableName} (key, value, updated_at)
        VALUES (?, ?, ?)
      `;

      SQLite.execute(this.db, sql, [key, base64Value, Date.now()]);
    } catch (error) {
      logger.error(`Failed to put key: ${key}`, error);
      throw new MidnightError(
        MidnightErrorCode.STORAGE_ERROR,
        `Failed to store value: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Delete a value
   */
  async del(key: string): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.del(key);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      const sql = `DELETE FROM ${this.tableName} WHERE key = ?`;
      SQLite.execute(this.db, sql, [key]);
    } catch (error) {
      logger.error(`Failed to delete key: ${key}`, error);
    }
  }

  /**
   * Batch get operation
   */
  async getBatch(keys: string[]): Promise<(Uint8Array | undefined)[]> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.getBatch(keys);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      // Build placeholders for IN clause
      const placeholders = keys.map(() => '?').join(',');
      const sql = `SELECT key, value FROM ${this.tableName} WHERE key IN (${placeholders})`;

      const result = SQLite.execute(this.db, sql, keys);
      const map = new Map<string, Uint8Array>();

      if (result && result.rows) {
        for (const row of result.rows) {
          map.set(row.key, this.base64ToUint8Array(row.value));
        }
      }

      // Return in same order as input keys
      return keys.map((key) => map.get(key));
    } catch (error) {
      logger.error('Failed to get batch', error);
      return keys.map(() => undefined);
    }
  }

  /**
   * Batch put operation
   */
  async putBatch(entries: Array<{ key: string; value: Uint8Array }>): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.putBatch(entries);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      // Use transaction for batch operations
      SQLite.execute(this.db, 'BEGIN TRANSACTION', []);

      for (const entry of entries) {
        const base64Value = this.uint8ArrayToBase64(entry.value);
        const sql = `
          INSERT OR REPLACE INTO ${this.tableName} (key, value, updated_at)
          VALUES (?, ?, ?)
        `;
        SQLite.execute(this.db, sql, [entry.key, base64Value, Date.now()]);
      }

      SQLite.execute(this.db, 'COMMIT', []);
    } catch (error) {
      logger.error('Failed to put batch', error);
      throw new MidnightError(
        MidnightErrorCode.STORAGE_ERROR,
        `Batch put failed: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Batch delete operation
   */
  async delBatch(keys: string[]): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.delBatch(keys);
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      const placeholders = keys.map(() => '?').join(',');
      const sql = `DELETE FROM ${this.tableName} WHERE key IN (${placeholders})`;
      SQLite.execute(this.db, sql, keys);
    } catch (error) {
      logger.error('Failed to delete batch', error);
    }
  }

  /**
   * Create iterator for range queries
   */
  async *iterator(opts: {
    gte?: string;
    lte?: string;
    limit?: number;
    reverse?: boolean;
  } = {}): AsyncIterator<{ key: string; value: Uint8Array }> {
    if (this.useMemory && this.memoryFallback) {
      yield* this.memoryFallback.iterator(opts);
      return;
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      let sql = `SELECT key, value FROM ${this.tableName}`;
      const params: string[] = [];

      // Build WHERE clause for range query
      const conditions: string[] = [];
      if (opts.gte) {
        conditions.push('key >= ?');
        params.push(opts.gte);
      }
      if (opts.lte) {
        conditions.push('key <= ?');
        params.push(opts.lte);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      // Ordering
      sql += opts.reverse ? ' ORDER BY key DESC' : ' ORDER BY key ASC';

      // Limit
      if (opts.limit) {
        sql += ' LIMIT ?';
        params.push(String(opts.limit));
      }

      const result = SQLite.execute(this.db, sql, params);

      if (result && result.rows) {
        for (const row of result.rows) {
          yield {
            key: row.key,
            value: this.base64ToUint8Array(row.value),
          };
        }
      }
    } catch (error) {
      logger.error('Iterator failed', error);
    }
  }

  /**
   * Get all keys
   */
  async getKeys(opts?: { gte?: string; lte?: string; limit?: number }): Promise<string[]> {
    const keys: string[] = [];
    const iter = this.iterator(opts);

    try {
      let result = await iter.next();
      while (!result.done) {
        keys.push(result.value.key);
        if (opts?.limit && keys.length >= opts.limit) {
          break;
        }
        result = await iter.next();
      }
    } finally {
      await iter.return?.();
    }

    return keys;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      return this.memoryFallback.clear();
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      const sql = `DELETE FROM ${this.tableName}`;
      SQLite.execute(this.db, sql, []);
    } catch (error) {
      logger.error('Failed to clear storage', error);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.useMemory && this.memoryFallback) {
      await this.memoryFallback.close();
      this.memoryFallback = null;
      this.initialized = false;
      return;
    }

    try {
      const SQLite = await this.importSQLite();
      if (SQLite && this.db) {
        SQLite.close(this.db);
        this.db = null;
      }
      this.initialized = false;
      logger.debug('SQLite storage closed');
    } catch (error) {
      logger.error('Failed to close storage', error);
    }
  }

  /**
   * Get approximate count of keys
   */
  async count(): Promise<number> {
    if (this.useMemory && this.memoryFallback) {
      // MemoryStorageAdapter doesn't have count, approximate with getAll
      const entries = await this.memoryFallback.getAll();
      return entries.length;
    }

    try {
      const SQLite = await this.importSQLite();
      if (!SQLite) {
        throw new Error('SQLite not available');
      }

      const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const result = SQLite.execute(this.db, sql, []);

      if (result && result.rows && result.rows.length > 0) {
        return result.rows[0].count;
      }

      return 0;
    } catch (error) {
      logger.error('Failed to count keys', error);
      return 0;
    }
  }

  /**
   * Import SQLite module (lazy load)
   */
  private async importSQLite(): Promise<any> {
    try {
      // Try to import react-native-quick-sqlite
      // Using dynamic import to avoid hard dependency
      const sqlite = (await import('react-native-quick-sqlite')).default;
      return sqlite;
    } catch {
      return null;
    }
  }

  /**
   * Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Factory function to create SQLite storage
 */
export async function createSQLiteStorage(
  dbName: string,
  tableName?: string
): Promise<SQLitePrivateState> {
  const storage = new SQLitePrivateState(dbName, tableName);
  await storage.initialize();
  return storage;
}
