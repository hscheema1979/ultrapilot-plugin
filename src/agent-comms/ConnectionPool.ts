import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * ConnectionPool - SQLite connection pool singleton
 *
 * Provides shared database connections across AgentMessageBus, SessionStore, and other components.
 * Uses WAL mode for optimal concurrency (single writer, multiple readers).
 */
export class ConnectionPool {
  private static instance: ConnectionPool;
  private writerDb: Database.Database;
  private readerDb: Database.Database;
  private dbPath: string;

  private constructor() {
    // Ensure .ultra/state directory exists
    const stateDir = path.join(process.cwd(), '.ultra', 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    }

    this.dbPath = path.join(stateDir, 'messages.db');

    // Create database instance
    this.writerDb = new Database(this.dbPath);

    // Configure WAL mode for optimal concurrency
    // WAL = Write-Ahead Logging, allows concurrent reads during writes
    this.writerDb.pragma('journal_mode = WAL');
    this.writerDb.pragma('synchronous = NORMAL');
    this.writerDb.pragma('cache_size = -64000'); // 64MB cache
    this.writerDb.pragma('foreign_keys = ON');
    this.writerDb.pragma('temp_store = MEMORY');

    // In WAL mode, same connection supports concurrent reads
    // Writer connection is also used for reads
    this.readerDb = this.writerDb;

    // Performance optimizations
    this.writerDb.pragma('mmap_size = 30000000000'); // 30GB mmap
    this.writerDb.pragma('page_size = 4096');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool();
    }
    return ConnectionPool.instance;
  }

  /**
   * Get writer connection (for INSERT, UPDATE, DELETE)
   *
   * Note: In WAL mode, there can only be ONE writer at a time.
   * Multiple writers will cause SQLITE_BUSY errors.
   */
  getWriter(): Database.Database {
    return this.writerDb;
  }

  /**
   * Get reader connection (for SELECT)
   *
   * In WAL mode, this is the same as writer connection.
   * WAL allows concurrent reads during writes.
   */
  getReader(): Database.Database {
    return this.readerDb;
  }

  /**
   * Get database file path
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Execute a function in a transaction
   *
   * @param fn Function to execute within transaction
   * @returns Transaction result
   */
  transaction<T>(fn: () => T): T {
    const transactionFn = this.writerDb.transaction(fn);
    return transactionFn();
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.writerDb.open;
  }

  /**
   * Close database connection
   *
   * Should only be called on application shutdown.
   */
  close(): void {
    if (this.isOpen()) {
      this.writerDb.close();
      ConnectionPool.instance = null as unknown as ConnectionPool;
    }
  }

  /**
   * Execute PRAGMA command and return result
   *
   * @param pragma PRAGMA command (without 'PRAGMA' prefix)
   * @returns PRAGMA result
   */
  pragma(pragma: string): unknown {
    return this.writerDb.pragma(pragma);
  }

  /**
   * Get database statistics for monitoring
   */
  getStats(): {
    path: string;
    walMode: string;
    cacheSize: number;
    pageSize: number;
    isOpen: boolean;
    sizeInBytes: number;
  } {
    const stats = fs.statSync(this.dbPath);
    return {
      path: this.dbPath,
      walMode: this.pragma('journal_mode') as string,
      cacheSize: this.pragma('cache_size') as number,
      pageSize: this.pragma('page_size') as number,
      isOpen: this.isOpen(),
      sizeInBytes: stats.size,
    };
  }
}

/**
 * Export singleton getter for convenience
 */
export function getConnectionPool(): ConnectionPool {
  return ConnectionPool.getInstance();
}

/**
 * Export database connections for direct access
 */
export function getWriterDb(): Database.Database {
  return ConnectionPool.getInstance().getWriter();
}

export function getReaderDb(): Database.Database {
  return ConnectionPool.getInstance().getReader();
}
