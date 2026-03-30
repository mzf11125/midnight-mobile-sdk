// ============================================================================
// Secure Storage - Keychain/Keystore Wrapper
// ============================================================================

import { SecureKeyType, MidnightErrorCode, MidnightError } from '../types';
import { createLogger } from '../utils/Logger';
import { SECURE_KEYS } from '../core/constants';

const logger = createLogger('SecureStorage');

/**
 * Secure storage options
 */
export interface SecureStorageOptions {
  /** Keychain access group (iOS) */
  accessGroup?: string;
  /** Require authentication on first access (Android) */
  requireAuthentication?: boolean;
  /** Authentication prompt message */
  authenticationPrompt?: string;
}

/**
 * Wrapper for expo-secure-store
 * Provides secure storage using iOS Keychain or Android Keystore
 */
export class SecureStorage {
  private options: SecureStorageOptions;
  private secureStore: any = null;
  private available: boolean = false;

  constructor(options: SecureStorageOptions = {}) {
    this.options = {
      authenticationPrompt: 'Authenticate to access your wallet',
      ...options,
    };
  }

  /**
   * Initialize secure storage
   */
  async initialize(): Promise<void> {
    try {
      this.secureStore = await this.importSecureStore();

      if (!this.secureStore) {
        logger.warn('expo-secure-store not available, using memory fallback');
        this.available = false;
        return;
      }

      this.available = true;
      logger.debug('Secure storage initialized');
    } catch (error) {
      logger.warn('Secure storage initialization failed', error);
      this.available = false;
    }
  }

  /**
   * Check if secure storage is available
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Get a value from secure storage
   */
  async get(key: SecureKeyType | string): Promise<string | null> {
    if (!this.available) {
      logger.warn(`Secure storage not available, cannot get key: ${key}`);
      return null;
    }

    try {
      const value = await this.secureStore.getItemAsync(key, this.getOptions());
      return value;
    } catch (error) {
      logger.error(`Failed to get secure key: ${key}`, error);
      return null;
    }
  }

  /**
   * Set a value in secure storage
   */
  async set(key: SecureKeyType | string, value: string): Promise<boolean> {
    if (!this.available) {
      logger.warn(`Secure storage not available, cannot set key: ${key}`);
      return false;
    }

    try {
      await this.secureStore.setItemAsync(key, value, this.getOptions());
      logger.debug(`Secure key stored: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set secure key: ${key}`, error);
      throw new MidnightError(
        MidnightErrorCode.STORAGE_ERROR,
        `Failed to store secure data: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Delete a value from secure storage
   */
  async delete(key: SecureKeyType | string): Promise<boolean> {
    if (!this.available) {
      logger.warn(`Secure storage not available, cannot delete key: ${key}`);
      return false;
    }

    try {
      await this.secureStore.deleteItemAsync(key, this.getOptions());
      logger.debug(`Secure key deleted: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete secure key: ${key}`, error);
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: SecureKeyType | string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Get all wallet keys
   */
  async getWalletKeys(): Promise<{
    mnemonic?: string;
    privateKey?: string;
    publicKey?: string;
    address?: string;
  }> {
    const [mnemonic, privateKey, publicKey, address] = await Promise.all([
      this.get(SECURE_KEYS.MNEMONIC),
      this.get(SECURE_KEYS.PRIVATE_KEY),
      this.get(SECURE_KEYS.PUBLIC_KEY),
      this.get(SECURE_KEYS.ADDRESS),
    ]);

    return {
      mnemonic: mnemonic ?? undefined,
      privateKey: privateKey ?? undefined,
      publicKey: publicKey ?? undefined,
      address: address ?? undefined,
    };
  }

  /**
   * Clear all wallet keys
   */
  async clearWallet(): Promise<void> {
    const keys = [
      SECURE_KEYS.MNEMONIC,
      SECURE_KEYS.PRIVATE_KEY,
      SECURE_KEYS.PUBLIC_KEY,
      SECURE_KEYS.ADDRESS,
      SECURE_KEYS.BIOMETRIC_ENABLED,
      SECURE_KEYS.WALLET_CONFIG,
      SECURE_KEYS.NETWORK,
    ];

    await Promise.all(keys.map((key) => this.delete(key)));
    logger.info('All wallet keys cleared');
  }

  /**
   * Store mnemonic phrase
   */
  async setMnemonic(mnemonic: string): Promise<boolean> {
    return this.set(SECURE_KEYS.MNEMONIC, mnemonic);
  }

  /**
   * Get mnemonic phrase
   */
  async getMnemonic(): Promise<string | null> {
    return this.get(SECURE_KEYS.MNEMONIC);
  }

  /**
   * Store private key
   */
  async setPrivateKey(privateKey: string): Promise<boolean> {
    return this.set(SECURE_KEYS.PRIVATE_KEY, privateKey);
  }

  /**
   * Get private key
   */
  async getPrivateKey(): Promise<string | null> {
    return this.get(SECURE_KEYS.PRIVATE_KEY);
  }

  /**
   * Store public key
   */
  async setPublicKey(publicKey: string): Promise<boolean> {
    return this.set(SECURE_KEYS.PUBLIC_KEY, publicKey);
  }

  /**
   * Get public key
   */
  async getPublicKey(): Promise<string | null> {
    return this.get(SECURE_KEYS.PUBLIC_KEY);
  }

  /**
   * Store wallet address
   */
  async setAddress(address: string): Promise<boolean> {
    return this.set(SECURE_KEYS.ADDRESS, address);
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string | null> {
    return this.get(SECURE_KEYS.ADDRESS);
  }

  /**
   * Set biometric auth enabled flag
   */
  async setBiometricEnabled(enabled: boolean): Promise<boolean> {
    return this.set(SECURE_KEYS.BIOMETRIC_ENABLED, enabled.toString());
  }

  /**
   * Check if biometric auth is enabled
   */
  async isBiometricEnabled(): Promise<boolean> {
    const value = await this.get(SECURE_KEYS.BIOMETRIC_ENABLED);
    return value === 'true';
  }

  /**
   * Get secure-store options
   */
  private getOptions(): any {
    const options: any = {};

    if (this.options.keychainAccessibility) {
      options.keychainAccessibility = this.options.keychainAccessibility;
    }

    return options;
  }

  /**
   * Import expo-secure-store (lazy load)
   */
  private async importSecureStore(): Promise<any> {
    try {
      const module = await import('expo-secure-store');
      return module.default;
    } catch {
      return null;
    }
  }
}

/**
 * Create a secure storage instance
 */
export async function createSecureStorage(
  options?: SecureStorageOptions
): Promise<SecureStorage> {
  const storage = new SecureStorage(options);
  await storage.initialize();
  return storage;
}
