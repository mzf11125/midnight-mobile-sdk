// ============================================================================
// Error Utilities
// ============================================================================

import { MidnightError, MidnightErrorCode } from '../types';
import { createLogger } from './Logger';

const logger = createLogger('Errors');

/**
 * Create a Midnight SDK error
 */
export function createMidnightError(
  code: MidnightErrorCode,
  message: string,
  cause?: Error
): MidnightError {
  const error = new MidnightError(code, message, cause);
  logger.debug(`Error created: ${code} - ${message}`, cause);
  return error;
}

/**
 * Check if an error is a MidnightError
 */
export function isMidnightError(error: unknown): error is MidnightError {
  return error instanceof MidnightError;
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (isMidnightError(error)) {
    return getUserMessageForCode(error.code);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}

/**
 * Get localized error message for error code
 */
export function getUserMessageForCode(code: MidnightErrorCode): string {
  const messages: Record<MidnightErrorCode, string> = {
    [MidnightErrorCode.UNKNOWN]: 'An unknown error occurred',
    [MidnightErrorCode.NETWORK_ERROR]: 'Network connection failed. Please check your internet connection.',
    [MidnightErrorCode.TIMEOUT]: 'Request timed out. Please try again.',
    [MidnightErrorCode.INVALID_RESPONSE]: 'Received invalid response from server.',
    [MidnightErrorCode.WALLET_NOT_FOUND]: 'No wallet found. Please create or import a wallet.',
    [MidnightErrorCode.WALLET_LOCKED]: 'Wallet is locked. Please authenticate to continue.',
    [MidnightErrorCode.WALLET_ALREADY_EXISTS]: 'A wallet already exists. Please wipe it first.',
    [MidnightErrorCode.INVALID_MNEMONIC]: 'Invalid recovery phrase. Please check and try again.',
    [MidnightErrorCode.KEY_DERivation_FAILED]: 'Failed to derive wallet keys.',
    [MidnightErrorCode.BIOMETRIC_NOT_AVAILABLE]: 'Biometric authentication is not available on this device.',
    [MidnightErrorCode.BIOMETRIC_FAILED]: 'Biometric authentication failed.',
    [MidnightErrorCode.BIOMETRIC_DISMISSED]: 'Authentication was cancelled.',
    [MidnightErrorCode.TRANSACTION_FAILED]: 'Transaction failed.',
    [MidnightErrorCode.INSUFFICIENT_BALANCE]: 'Insufficient balance to complete this transaction.',
    [MidnightErrorCode.INVALID_TRANSACTION]: 'Invalid transaction data.',
    [MidnightErrorCode.TRANSACTION_REJECTED]: 'Transaction was rejected.',
    [MidnightErrorCode.TRANSACTION_TIMEOUT]: 'Transaction timed out. Please check the status later.',
    [MidnightErrorCode.CONTRACT_DEPLOY_FAILED]: 'Contract deployment failed.',
    [MidnightErrorCode.CONTRACT_CALL_FAILED]: 'Contract call failed.',
    [MidnightErrorCode.CONTRACT_QUERY_FAILED]: 'Contract query failed.',
    [MidnightErrorCode.PROOF_GENERATION_FAILED]: 'Zero-knowledge proof generation failed.',
    [MidnightErrorCode.INVALID_CONTRACT_SOURCE]: 'Invalid contract source code.',
    [MidnightErrorCode.STORAGE_ERROR]: 'Storage error occurred.',
    [MidnightErrorCode.DATABASE_CORRUPTED]: 'Database is corrupted. Please reinstall the app.',
    [MidnightErrorCode.MIGRATION_FAILED]: 'Database migration failed.',
    [MidnightErrorCode.INVALID_DAPP_REQUEST]: 'Invalid DApp request.',
    [MidnightErrorCode.DAPP_NOT_APPROVED]: 'DApp request was not approved.',
    [MidnightErrorCode.DAPP_CONNECTION_FAILED]: 'Failed to connect to DApp.',
    [MidnightErrorCode.INVALID_QR_CODE]: 'Invalid QR code format.',
  };

  return messages[code] || messages[MidnightErrorCode.UNKNOWN];
}

/**
 * Wrap an error in a MidnightError
 */
export function wrapError(
  error: unknown,
  defaultCode: MidnightErrorCode,
  defaultMessage: string
): MidnightError {
  if (isMidnightError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new MidnightError(defaultCode, defaultMessage, error);
  }

  return new MidnightError(defaultCode, defaultMessage);
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (isMidnightError(error)) {
    const retryableCodes = [
      MidnightErrorCode.NETWORK_ERROR,
      MidnightErrorCode.TIMEOUT,
      MidnightErrorCode.TRANSACTION_TIMEOUT,
    ];
    return retryableCodes.includes(error.code);
  }

  if (error instanceof Error) {
    const retryableMessages = [
      'network',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];
    const message = error.message.toLowerCase();
    return retryableMessages.some((m) => message.includes(m));
  }

  return false;
}

/**
 * Async sleep with timeout
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      onRetry?.(attempt, error);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeout<T = never>(
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new MidnightError(MidnightErrorCode.TIMEOUT, message)), ms);
  });
}

/**
 * Run a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout<T>(timeoutMs, message),
  ]);
}
