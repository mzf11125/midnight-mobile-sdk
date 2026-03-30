// ============================================================================
// Logger Utility
// ============================================================================

import { LogLevel, ILogger } from '../types';

/** Default log level */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** Log level priorities for filtering */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

/** Console styling */
const CONSOLE_STYLES = {
  debug: 'color: #888; font-style: italic',
  info: 'color: #007ACC; font-weight: normal',
  warn: 'color: #FFA500; font-weight: bold',
  error: 'color: #FF0000; font-weight: bold',
} as const;

/**
 * Console-based logger implementation
 */
export class Logger implements ILogger {
  private level: LogLevel;
  private tag: string;
  private enabled: boolean;

  constructor(tag: string = 'MidnightSDK', level: LogLevel = DEFAULT_LOG_LEVEL) {
    this.tag = tag;
    this.level = level;
    this.enabled = true;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return this.enabled && LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Format log message with tag
   */
  private format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.tag}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Log at debug level
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      if (typeof console !== 'undefined' && console.debug) {
        const formatted = this.format('debug', message);
        console.debug(`%c${formatted}`, CONSOLE_STYLES.debug, ...args);
      }
    }
  }

  /**
   * Log at info level
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      if (typeof console !== 'undefined' && console.info) {
        const formatted = this.format('info', message);
        console.info(`%c${formatted}`, CONSOLE_STYLES.info, ...args);
      }
    }
  }

  /**
   * Log at warn level
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      if (typeof console !== 'undefined' && console.warn) {
        const formatted = this.format('warn', message);
        console.warn(`%c${formatted}`, CONSOLE_STYLES.warn, ...args);
      }
    }
  }

  /**
   * Log at error level
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      if (typeof console !== 'undefined' && console.error) {
        const formatted = this.format('error', message);
        console.error(`%c${formatted}`, CONSOLE_STYLES.error, ...args);
      }
    }
  }

  /**
   * Create a child logger with a different tag
   */
  withTag(tag: string): Logger {
    const child = new Logger(`${this.tag}:${tag}`, this.level);
    child.enabled = this.enabled;
    return child;
  }

  /**
   * Create a child logger for a specific module
   */
  forModule(module: string): Logger {
    return this.withTag(module);
  }
}

/**
 * Default global logger instance
 */
const defaultLogger = new Logger();

/**
 * Get the default logger
 */
export function getDefaultLogger(): Logger {
  return defaultLogger;
}

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  defaultLogger.setLevel(level);
}

/**
 * Create a logger for a specific component
 */
export function createLogger(tag: string, level?: LogLevel): Logger {
  return new Logger(tag, level ?? defaultLogger['level']);
}

/**
 * Development helper: enable verbose logging
 */
export function enableDebugMode(): void {
  setLogLevel('debug');
  defaultLogger.info('Debug mode enabled');
}
