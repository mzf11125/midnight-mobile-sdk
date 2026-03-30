// ============================================================================
// Validation Utilities
// ============================================================================

import { NetworkType } from '../types';
import { DEFAULT_DERIVATION_PATH, MIDNIGHT_COIN_TYPE } from '../core/constants';
import { createLogger } from './Logger';
import * as bip39 from 'bip39';

const logger = createLogger('Validation');

/**
 * Validate a BIP-39 mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): { valid: boolean; error?: string } {
  if (!mnemonic || typeof mnemonic !== 'string') {
    return { valid: false, error: 'Mnemonic must be a non-empty string' };
  }

  const trimmed = mnemonic.trim();

  if (trimmed.split(/\s+/).length < 12) {
    return { valid: false, error: 'Mnemonic must have at least 12 words' };
  }

  if (trimmed.split(/\s+/).length > 24) {
    return { valid: false, error: 'Mnemonic cannot have more than 24 words' };
  }

  if (!bip39.validateMnemonic(trimmed)) {
    return { valid: false, error: 'Invalid mnemonic checksum' };
  }

  return { valid: true };
}

/**
 * Validate a bech32-encoded Midnight address
 */
export function validateAddress(address: string, network?: NetworkType): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address must be a non-empty string' };
  }

  const trimmed = address.trim().toLowerCase();

  // Bech32 validation basics
  const bech32Regex = /^([a-z]+)1[ac-hj-np-z02-9]{38,63}$/;
  if (!bech32Regex.test(trimmed)) {
    return { valid: false, error: 'Invalid bech32 address format' };
  }

  // Check prefix
  const parts = trimmed.split('1');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid bech32 address format' };
  }

  const prefix = parts[0];
  const validPrefixes = ['tmid', 'ppmid', 'mid'];

  if (!validPrefixes.includes(prefix)) {
    return { valid: false, error: `Invalid address prefix: ${prefix}` };
  }

  // Network-specific prefix check
  if (network) {
    const expectedPrefix: Record<NetworkType, string> = {
      testnet: 'tmid',
      preprod: 'ppmid',
      mainnet: 'mid',
    };

    if (prefix !== expectedPrefix[network]) {
      return {
        valid: false,
        error: `Address prefix ${prefix} doesn't match network ${network}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate a hex string
 */
export function validateHex(hex: string, options: { length?: number; prefix?: boolean } = {}): {
  valid: boolean;
  error?: string;
} {
  const { length, prefix = true } = options;

  if (!hex || typeof hex !== 'string') {
    return { valid: false, error: 'Hex must be a non-empty string' };
  }

  let value = hex.trim();

  if (prefix) {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      value = value.slice(2);
    }
  }

  const hexRegex = /^[0-9a-fA-F]*$/;
  if (!hexRegex.test(value)) {
    return { valid: false, error: 'Invalid hex characters' };
  }

  if (length !== undefined && value.length !== length) {
    return { valid: false, error: `Hex length must be ${length}, got ${value.length}` };
  }

  return { valid: true };
}

/**
 * Validate public key (hex-encoded 32 bytes)
 */
export function validatePublicKey(publicKey: string): { valid: boolean; error?: string } {
  return validateHex(publicKey, { length: 64, prefix: false });
}

/**
 * Validate transaction hash (hex-encoded 32 bytes)
 */
export function validateTxHash(hash: string): { valid: boolean; error?: string } {
  return validateHex(hash, { length: 64, prefix: false });
}

/**
 * Validate network type
 */
export function validateNetwork(network: string): network is NetworkType {
  return ['testnet', 'preprod', 'mainnet'].includes(network);
}

/**
 * Validate derivation path
 */
export function validateDerivationPath(path: {
  purpose?: number;
  coinType?: number;
  account?: number;
  change?: number;
  index?: number;
}): { valid: boolean; error?: string } {
  const {
    purpose = DEFAULT_DERIVATION_PATH.purpose,
    coinType = MIDNIGHT_COIN_TYPE,
    account = DEFAULT_DERIVATION_PATH.account,
    change = DEFAULT_DERIVATION_PATH.change,
    index = DEFAULT_DERIVATION_PATH.index,
  } = path;

  if (typeof purpose !== 'number' || purpose < 0 || purpose > 2 ** 31 - 1) {
    return { valid: false, error: 'Invalid purpose value' };
  }

  if (typeof coinType !== 'number' || coinType < 0 || coinType > 2 ** 31 - 1) {
    return { valid: false, error: 'Invalid coin type value' };
  }

  if (typeof account !== 'number' || account < 0 || account > 2 ** 31 - 1) {
    return { valid: false, error: 'Invalid account value' };
  }

  if (change !== 0 && change !== 1) {
    return { valid: false, error: 'Change must be 0 (external) or 1 (internal)' };
  }

  if (typeof index !== 'number' || index < 0 || index > 2 ** 31 - 1) {
    return { valid: false, error: 'Invalid index value' };
  }

  return { valid: true };
}

/**
 * Validate amount (bigint positive value)
 */
export function validateAmount(amount: unknown): { valid: boolean; error?: string } {
  if (typeof amount !== 'bigint' && typeof amount !== 'number' && typeof amount !== 'string') {
    return { valid: false, error: 'Amount must be a number, bigint, or string' };
  }

  try {
    const value = BigInt(amount as bigint | number | string);
    if (value < 0n) {
      return { valid: false, error: 'Amount must be non-negative' };
    }
  } catch {
    return { valid: false, error: 'Invalid amount format' };
  }

  return { valid: true };
}

/**
 * Validate URL format
 */
export function validateUrl(url: string, options: { protocols?: string[] } = {}): {
  valid: boolean;
  error?: string;
} {
  const { protocols = ['http:', 'https:', 'ws:', 'wss:'] } = options;

  try {
    const parsed = new URL(url);

    if (protocols.length > 0 && !protocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `URL must use one of: ${protocols.join(', ')}`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate QR code data format
 */
export function validateQRCode(data: string): { valid: boolean; error?: string; parsed?: unknown } {
  if (!data || typeof data !== 'string') {
    return { valid: false, error: 'QR data must be a non-empty string' };
  }

  // Try JSON parse
  try {
    const parsed = JSON.parse(data);
    return { valid: true, parsed };
  } catch {
    // Not JSON, could be raw data
    return { valid: true, parsed: data };
  }
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate contract source code
 */
export function validateContractSource(source: string): { valid: boolean; error?: string } {
  if (!source || typeof source !== 'string') {
    return { valid: false, error: 'Contract source must be a non-empty string' };
  }

  const trimmed = source.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Contract source cannot be empty' };
  }

  if (trimmed.length > 1_000_000) {
    return { valid: false, error: 'Contract source too large (>1MB)' };
  }

  // Basic Compact syntax checks could go here
  // For now, just check it's not obviously malformed
  if (!trimmed.includes('contract') && !trimmed.includes('Contract')) {
    logger.warn('Contract source may be invalid: missing contract keyword');
  }

  return { valid: true };
}

/**
 * Validate biometric availability result
 */
export function validateBiometricAvailability(
  available: boolean,
  enrolled: boolean
): { valid: boolean; error?: string } {
  if (!available) {
    return {
      valid: false,
      error: 'Biometric authentication is not available on this device',
    };
  }

  if (!enrolled) {
    return {
      valid: false,
      error: 'No biometric data enrolled. Please set up FaceID, TouchID, or fingerprint.',
    };
  }

  return { valid: true };
}
