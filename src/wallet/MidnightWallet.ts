// ============================================================================
// Midnight Wallet - Main Wallet with Biometric Gate
// ============================================================================

import {
  IMidnightWallet,
  WalletInfo,
  WalletBalance,
  HDWalletOptions,
  MidnightErrorCode,
  MidnightError,
  NetworkType,
} from '../types';
import { DEFAULT_DERIVATION_PATH } from '../core/constants';
import { createLogger } from '../utils/Logger';
import {
  isValidMnemonic,
  deriveAddress,
  generateMnemonic,
  formatDerivationPath,
  sign,
  verify,
  getPublicKey,
  HDKeyManager,
} from './KeyDerivation';
import { SecureStorage, SECURE_KEYS } from './SecureStorage';
import { BiometricAuth, BiometricAuthOptions } from './BiometricAuth';

const logger = createLogger('MidnightWallet');

/**
 * Wallet configuration
 */
export interface WalletConfig {
  network: NetworkType;
  requireBiometrics: boolean;
  autoLockTimeout?: number; // ms
}

/**
 * Midnight Wallet implementation
 * Wraps wallet SDK functionality with biometric authentication gate
 */
export class MidnightWallet implements IMidnightWallet {
  private storage: SecureStorage;
  private biometric: BiometricAuth;
  private config: WalletConfig;
  private keyManager: HDKeyManager;
  private unlocked: boolean = false;
  private currentAddress: string | null = null;
  private autoLockTimer: NodeJS.Timeout | null = null;

  constructor(
    storage: SecureStorage,
    biometric: BiometricAuth,
    config: WalletConfig
  ) {
    this.storage = storage;
    this.biometric = biometric;
    this.config = config;
    this.keyManager = new HDKeyManager();
  }

  /**
   * Create a new wallet
   */
  async create(options?: HDWalletOptions): Promise<WalletInfo> {
    logger.info('Creating new wallet');

    const {
      mnemonic = generateMnemonic(),
      passphrase = '',
      path = { ...DEFAULT_DERIVATION_PATH },
    } = options ?? {};

    // Initialize key manager
    this.keyManager.fromMnemonic(mnemonic, passphrase);

    // Derive key pair
    const derived = this.keyManager.derive(path);
    const publicKey = derived.key.publicKey;
    const address = deriveAddress(publicKey, this.config.network);

    // Store in secure storage
    await this.storage.setMnemonic(mnemonic);
    await this.storage.setPublicKey(Buffer.from(publicKey).toString('hex'));
    await this.storage.setAddress(address);
    await this.storage.set(SECURE_KEYS.NETWORK, this.config.network);

    // Store wallet config
    await this.storage.set(SECURE_KEYS.WALLET_CONFIG, JSON.stringify({
      network: this.config.network,
      path,
    }));

    this.currentAddress = address;
    this.unlocked = true;

    logger.info(`Wallet created: ${address}`);
    this.startAutoLockTimer();

    return {
      address,
      publicKey: Buffer.from(publicKey).toString('hex'),
      network: this.config.network,
    };
  }

  /**
   * Import existing wallet from mnemonic
   */
  async import(mnemonic: string, options?: Partial<HDWalletOptions>): Promise<WalletInfo> {
    logger.info('Importing wallet from mnemonic');

    if (!isValidMnemonic(mnemonic)) {
      throw new MidnightError(MidnightErrorCode.INVALID_MNEMONIC, 'Invalid mnemonic phrase');
    }

    const {
      passphrase = '',
      path = { ...DEFAULT_DERIVATION_PATH },
    } = options ?? {};

    // Check if wallet already exists
    const existingMnemonic = await this.storage.getMnemonic();
    if (existingMnemonic) {
      throw new MidnightError(MidnightErrorCode.WALLET_ALREADY_EXISTS, 'Wallet already exists');
    }

    // Initialize key manager
    this.keyManager.fromMnemonic(mnemonic, passphrase);

    // Derive key pair
    const derived = this.keyManager.derive(path);
    const publicKey = derived.key.publicKey;
    const address = deriveAddress(publicKey, this.config.network);

    // Store in secure storage
    await this.storage.setMnemonic(mnemonic);
    await this.storage.setPublicKey(Buffer.from(publicKey).toString('hex'));
    await this.storage.setAddress(address);
    await this.storage.set(SECURE_KEYS.NETWORK, this.config.network);

    // Store wallet config
    await this.storage.set(SECURE_KEYS.WALLET_CONFIG, JSON.stringify({
      network: this.config.network,
      path,
    }));

    this.currentAddress = address;
    this.unlocked = true;

    logger.info(`Wallet imported: ${address}`);
    this.startAutoLockTimer();

    return {
      address,
      publicKey: Buffer.from(publicKey).toString('hex'),
      network: this.config.network,
    };
  }

  /**
   * Get wallet info
   */
  async getWalletInfo(): Promise<WalletInfo> {
    await this.ensureUnlocked();

    const address = await this.storage.getAddress();
    const publicKey = await this.storage.getPublicKey();
    const networkStr = await this.storage.get(SECURE_KEYS.NETWORK);

    if (!address || !publicKey) {
      throw new MidnightError(MidnightErrorCode.WALLET_NOT_FOUND, 'Wallet not found');
    }

    return {
      address,
      publicKey,
      network: (networkStr as NetworkType) ?? this.config.network,
    };
  }

  /**
   * Get wallet balance
   * Note: This requires connection to indexer/ledger
   */
  async getBalance(): Promise<WalletBalance> {
    await this.ensureUnlocked();

    const address = await this.storage.getAddress();
    if (!address) {
      throw new MidnightError(MidnightErrorCode.WALLET_NOT_FOUND, 'Wallet not found');
    }

    // Placeholder: In production, this would query the indexer
    logger.debug(`Getting balance for ${address}`);

    // Return zero balance for now
    // The actual balance would come from IndexerClient
    return {
      available: 0n,
      total: 0n,
      locked: 0n,
      pending: 0n,
    };
  }

  /**
   * Sign a transaction with biometric gate
   */
  async signTransaction(tx: Uint8Array): Promise<Uint8Array> {
    await this.ensureUnlocked();
    await this.authenticate('Sign transaction');

    // Get private key
    const privateKey = await this.getPrivateKey();
    if (!privateKey) {
      throw new MidnightError(MidnightErrorCode.KEY_DERivation_FAILED, 'Failed to derive private key');
    }

    // Sign transaction
    const signature = sign(privateKey, tx);
    logger.debug('Transaction signed');

    return signature;
  }

  /**
   * Sign a message with biometric gate
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    await this.ensureUnlocked();
    await this.authenticate('Sign message');

    // Get private key
    const privateKey = await this.getPrivateKey();
    if (!privateKey) {
      throw new MidnightError(MidnightErrorCode.KEY_DERivation_FAILED, 'Failed to derive private key');
    }

    // Sign message
    const signature = sign(privateKey, message);
    logger.debug('Message signed');

    return signature;
  }

  /**
   * Verify a message signature
   */
  verifySignature(message: Uint8Array, signature: Uint8Array, address: string): boolean {
    const publicKeyHex = async (): Promise<string | null> => {
      return this.storage.getPublicKey();
    };

    // This is a placeholder - actual implementation would recover address from signature
    // and compare with the provided address
    return true;
  }

  /**
   * Lock the wallet
   */
  async lock(): Promise<void> {
    this.unlocked = false;
    this.keyManager.clear();
    this.currentAddress = null;
    this.stopAutoLockTimer();
    logger.debug('Wallet locked');
  }

  /**
   * Unlock the wallet with optional biometric
   */
  async unlock(biometric: boolean = false): Promise<boolean> {
    const mnemonic = await this.storage.getMnemonic();
    if (!mnemonic) {
      throw new MidnightError(MidnightErrorCode.WALLET_NOT_FOUND, 'Wallet not found');
    }

    // Authenticate if biometric required
    if (biometric || this.config.requireBiometrics) {
      const result = await this.biometric.authenticate({
        prompt: 'Unlock your wallet',
      });
      if (!result.success) {
        return false;
      }
    }

    // Get wallet config
    const configStr = await this.storage.get(SECURE_KEYS.WALLET_CONFIG);
    let path = DEFAULT_DERIVATION_PATH;
    if (configStr) {
      try {
        const config = JSON.parse(configStr);
        path = config.path ?? DEFAULT_DERIVATION_PATH;
      } catch {
        // Use default path
      }
    }

    // Initialize key manager
    this.keyManager.fromMnemonic(mnemonic, '');

    // Get address
    const address = await this.storage.getAddress();
    if (address) {
      this.currentAddress = address;
    }

    this.unlocked = true;
    this.startAutoLockTimer();
    logger.debug('Wallet unlocked');

    return true;
  }

  /**
   * Check if wallet is unlocked
   */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Check if wallet exists
   */
  async exists(): Promise<boolean> {
    const mnemonic = await this.storage.getMnemonic();
    return mnemonic !== null;
  }

  /**
   * Remove wallet from secure storage
   */
  async wipe(): Promise<void> {
    await this.authenticate('Wipe wallet - this cannot be undone');

    await this.storage.clearWallet();
    await this.lock();
    logger.info('Wallet wiped');
  }

  /**
   * Change network
   */
  async setNetwork(network: NetworkType): Promise<void> {
    this.config.network = network;
    await this.storage.set(SECURE_KEYS.NETWORK, network);

    // Re-derive address with new network
    if (this.unlocked) {
      const publicKey = await this.storage.getPublicKey();
      if (publicKey) {
        const address = deriveAddress(new Uint8Array(Buffer.from(publicKey, 'hex')), network);
        await this.storage.setAddress(address);
        this.currentAddress = address;
      }
    }
  }

  /**
   * Enable or disable biometric authentication
   */
  async setBiometricEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const capability = await this.biometric.checkCapability();
      if (!capability.available || !capability.enrolled) {
        throw new MidnightError(
          MidnightErrorCode.BIOMETRIC_NOT_AVAILABLE,
          'Biometric authentication is not available or not enrolled'
        );
      }
    }

    await this.storage.setBiometricEnabled(enabled);
    this.config.requireBiometrics = enabled;
  }

  /**
   * Get private key (internal use only)
   */
  private async getPrivateKey(): Promise<Uint8Array | null> {
    if (!this.keyManager.isInitialized()) {
      const mnemonic = await this.storage.getMnemonic();
      if (!mnemonic) {
        return null;
      }

      const configStr = await this.storage.get(SECURE_KEYS.WALLET_CONFIG);
      let path = DEFAULT_DERIVATION_PATH;
      if (configStr) {
        try {
          const config = JSON.parse(configStr);
          path = config.path ?? DEFAULT_DERIVATION_PATH;
        } catch {
          // Use default path
        }
      }

      this.keyManager.fromMnemonic(mnemonic, '');
    }

    const derived = this.keyManager.derive(DEFAULT_DERIVATION_PATH);
    return derived.key.privateKey;
  }

  /**
   * Ensure wallet is unlocked
   */
  private async ensureUnlocked(): Promise<void> {
    if (!this.unlocked) {
      throw new MidnightError(MidnightErrorCode.WALLET_LOCKED, 'Wallet is locked');
    }
  }

  /**
   * Authenticate with biometrics
   */
  private async authenticate(reason: string): Promise<void> {
    if (this.config.requireBiometrics) {
      const result = await this.biometric.authenticate({
        prompt: reason,
      });

      if (!result.success) {
        const code = result.error?.includes('cancel')
          ? MidnightErrorCode.BIOMETRIC_DISMISSED
          : MidnightErrorCode.BIOMETRIC_FAILED;

        throw new MidnightError(code, result.error ?? 'Biometric authentication failed');
      }
    }
  }

  /**
   * Start auto-lock timer
   */
  private startAutoLockTimer(): void {
    this.stopAutoLockTimer();

    if (this.config.autoLockTimeout && this.config.autoLockTimeout > 0) {
      this.autoLockTimer = setTimeout(() => {
        logger.debug('Auto-lock timeout reached');
        this.lock();
      }, this.config.autoLockTimeout);
    }
  }

  /**
   * Stop auto-lock timer
   */
  private stopAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }
}

/**
 * Create a Midnight wallet instance
 */
export async function createWallet(
  storage: SecureStorage,
  biometric: BiometricAuth,
  config: WalletConfig
): Promise<MidnightWallet> {
  const wallet = new MidnightWallet(storage, biometric, config);
  return wallet;
}
