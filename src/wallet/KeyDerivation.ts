// ============================================================================
// Key Derivation - BIP-32/44 HD Key Utilities
// ============================================================================

import { KeyDerivationPath, HDWalletOptions } from '../types';
import { DEFAULT_DERIVATION_PATH, MIDNIGHT_COIN_TYPE } from '../core/constants';
import { createLogger } from '../utils/Logger';
import { validateMnemonic } from '../utils/Validation';
import * as bip39 from 'bip39';
import * as hdkey from 'hdkey';
import { createHash } from 'crypto';

const logger = createLogger('KeyDerivation');

/**
 * Derived key pair
 */
export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}

/**
 * Extended key information
 */
export interface ExtendedKey {
  key: KeyPair;
  depth: number;
  index: number;
  fingerprint: number;
  parentFingerprint: number;
}

/**
 * BIP-44 path formatter
 */
export function formatDerivationPath(path: KeyDerivationPath): string {
  return `m/${path.purpose}'/${path.coinType}'/${path.account}'/${path.change}/${path.index}`;
}

/**
 * Parse BIP-44 path string
 */
export function parseDerivationPath(path: string): KeyDerivationPath {
  // Remove 'm/' prefix and split
  const parts = path.replace(/^m\//, '').split('/');

  if (parts.length !== 5) {
    throw new Error('Invalid BIP-44 path length');
  }

  const purpose = parseInt(parts[0].replace("'", ''));
  const coinType = parseInt(parts[1].replace("'", ''));
  const account = parseInt(parts[2].replace("'", ''));
  const change = parseInt(parts[3]);
  const index = parseInt(parts[4]);

  return { purpose, coinType, account, change, index };
}

/**
 * Generate a new BIP-39 mnemonic
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return bip39.generateMnemonic(strength);
}

/**
 * Validate mnemonic phrase
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic).valid;
}

/**
 * Get entropy from mnemonic
 */
export function mnemonicToEntropy(mnemonic: string): string {
  return bip39.mnemonicToEntropy(mnemonic);
}

/**
 * Get mnemonic from entropy
 */
export function entropyToMnemonic(entropy: string): string {
  return bip39.entropyToMnemonic(entropy);
}

/**
 * Generate seed from mnemonic
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
  return new Uint8Array(seed);
}

/**
 * Create master HD key from mnemonic
 */
export function createMasterKey(mnemonic: string, passphrase: string = ''): hdkey {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = mnemonicToSeed(mnemonic, passphrase);
  return hdkey.fromMasterSeed(Buffer.from(seed));
}

/**
 * Derive child key from path
 */
export function deriveKey(masterKey: hdkey, path: KeyDerivationPath): ExtendedKey {
  const pathStr = formatDerivationPath(path);
  logger.debug(`Deriving key: ${pathStr}`);

  const derivedKey = masterKey.derive(pathStr);

  return {
    key: {
      privateKey: new Uint8Array(derivedKey.privateKey),
      publicKey: new Uint8Array(derivedKey.publicKey),
      chainCode: new Uint8Array(derivedKey.chainCode),
    },
    depth: derivedKey.depth,
    index: derivedKey.index,
    fingerprint: derivedKey.fingerprint,
    parentFingerprint: derivedKey.parentFingerprint,
  };
}

/**
 * Derive key from mnemonic with default path
 */
export function deriveFromMnemonic(
  mnemonic: string,
  options: HDWalletOptions = {}
): ExtendedKey {
  const {
    passphrase = '',
    path = DEFAULT_DERIVATION_PATH,
  } = options;

  const masterKey = createMasterKey(mnemonic, passphrase);
  return deriveKey(masterKey, path);
}

/**
 * Get public key from private key
 */
export function getPublicKey(privateKey: Uint8Array, compressed: boolean = true): Uint8Array {
  const ec = require('elliptic').ec;
  const secp256k1 = new ec('secp256k1');
  const keyPair = secp256k1.keyFromPrivate(Buffer.from(privateKey));
  const publicKey = keyPair.getPublic(compressed, 'hex');
  return new Uint8Array(Buffer.from(publicKey, 'hex'));
}

/**
 * Derive address from public key
 * This is a placeholder - actual address derivation depends on Midnight's format
 */
export function deriveAddress(publicKey: Uint8Array, network: 'testnet' | 'preprod' | 'mainnet' = 'testnet'): string {
  // Placeholder: Actual Midnight address derivation would go here
  // This assumes bech32 encoding with network prefix

  const prefix = network === 'testnet' ? 'tmid' : network === 'preprod' ? 'ppmid' : 'mid';

  // For now, return a mock address format
  // In production, this would use actual Midnight address derivation
  const hash = createHash('sha256').update(publicKey).digest();
  const data = hash.subarray(0, 20);

  // Simple checksum
  const checksum = createHash('sha256').update(Buffer.concat([Buffer.from(prefix), data])).digest().subarray(0, 4);

  // Combine and encode to base32-like format
  const combined = Buffer.concat([data, checksum]);
  const chars = '023456789acdefghjklmnpqrsvwxyz';
  let result = `${prefix}1`;

  for (let i = 0; i < combined.length; i += 5) {
    const chunk = combined.subarray(i, i + 5);
    const value = chunk.reduce((acc, byte, idx) => acc + (byte << (8 * idx)), 0);
    for (let j = 0; j < 8; j++) {
      result += chars[(value >> (5 * j)) & 31];
    }
  }

  return result;
}

/**
 * Sign data with private key
 */
export function sign(privateKey: Uint8Array, data: Uint8Array): Uint8Array {
  const ec = require('elliptic').ec;
  const secp256k1 = new ec('secp256k1');
  const keyPair = secp256k1.keyFromPrivate(Buffer.from(privateKey));
  const signature = keyPair.sign(Buffer.from(data));
  return new Uint8Array(signature.toDER());
}

/**
 * Verify signature with public key
 */
export function verify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): boolean {
  const ec = require('elliptic').ec;
  const secp256k1 = new ec('secp256k1');
  const keyPair = secp256k1.keyFromPublic(Buffer.from(publicKey));
  return keyPair.verify(Buffer.from(data), Buffer.from(signature));
}

/**
 * Generate random private key
 */
export function generatePrivateKey(): Uint8Array {
  const ec = require('elliptic').ec;
  const secp256k1 = new ec('secp256k1');
  const keyPair = secp256k1.genKeyPair();
  return new Uint8Array(keyPair.getPrivate().toArray());
}

/**
 * Get key fingerprint
 */
export function getFingerprint(publicKey: Uint8Array): number {
  const hash = createHash('ripemd160');
  const sha256 = createHash('sha256').update(publicKey).digest();
  hash.update(sha256);
  const digest = hash.digest().subarray(0, 4);
  return digest.readUInt32BE(0);
}

/**
 * HD Key Manager class
 * Manages HD key derivation with caching
 */
export class HDKeyManager {
  private masterKey: hdkey | null = null;
  private mnemonic: string | null = null;
  private derivedKeys: Map<string, ExtendedKey> = new Map();

  /**
   * Initialize from mnemonic
   */
  fromMnemonic(mnemonic: string, passphrase: string = ''): this {
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    this.mnemonic = mnemonic;
    this.masterKey = createMasterKey(mnemonic, passphrase);
    this.derivedKeys.clear();
    return this;
  }

  /**
   * Initialize from seed
   */
  fromSeed(seed: Uint8Array): this {
    this.mnemonic = null;
    this.masterKey = hdkey.fromMasterSeed(Buffer.from(seed));
    this.derivedKeys.clear();
    return this;
  }

  /**
   * Derive a key at a specific path
   */
  derive(path: KeyDerivationPath): ExtendedKey {
    if (!this.masterKey) {
      throw new Error('HD key manager not initialized');
    }

    const pathStr = formatDerivationPath(path);

    // Check cache
    const cached = this.derivedKeys.get(pathStr);
    if (cached) {
      return cached;
    }

    // Derive new key
    const key = deriveKey(this.masterKey, path);
    this.derivedKeys.set(pathStr, key);
    return key;
  }

  /**
   * Get mnemonic (if available)
   */
  getMnemonic(): string | null {
    return this.mnemonic;
  }

  /**
   * Clear sensitive data
   */
  clear(): void {
    this.masterKey = null;
    this.mnemonic = null;
    this.derivedKeys.clear();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.masterKey !== null;
  }
}

/**
 * Create a new HD wallet key manager
 */
export function createHDKeyManager(): HDKeyManager {
  return new HDKeyManager();
}

/**
 * Generate a complete wallet with address
 */
export async function generateWallet(options: HDWalletOptions = {}): Promise<{
  mnemonic: string;
  keyPair: KeyPair;
  address: string;
  path: KeyDerivationPath;
}> {
  const mnemonic = options.mnemonic ?? generateMnemonic();
  const {
    path = DEFAULT_DERIVATION_PATH,
    passphrase = '',
  } = options;

  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const extended = deriveFromMnemonic(mnemonic, { passphrase, path });

  // Derive address
  const address = deriveAddress(extended.key.publicKey, 'testnet');

  return {
    mnemonic,
    keyPair: extended.key,
    address,
    path,
  };
}
