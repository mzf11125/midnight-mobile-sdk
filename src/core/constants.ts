// ============================================================================
// Midnight Network Constants
// ============================================================================

import { NetworkType } from '../types';

/** Midnight network IDs */
export const NETWORK_IDS: Record<NetworkType, number> = {
  testnet: 0,
  preprod: 1,
  mainnet: 2,
};

/** Default BIP-44 coin type for Midnight */
export const MIDNIGHT_COIN_TYPE = 1815;

/** Default derivation path components (BIP-44) */
export const DEFAULT_DERIVATION_PATH = {
  purpose: 44,
  coinType: MIDNIGHT_COIN_TYPE,
  account: 0,
  change: 0,
  index: 0,
};

/** Bech32 prefixes */
export const BECH32_PREFIXES = {
  testnet: 'tmid',
  preprod: 'ppmid',
  mainnet: 'mid',
} as const;

/** Default gas limits */
export const GAS_LIMITS = {
  transfer: 21000n,
  contractDeploy: 5000000n,
  contractCall: 1000000n,
} as const;

/** Default fee amounts (in dust) */
export const DEFAULT_FEES = {
  minFee: 1000n,
  transferFee: 21000n,
  contractDeployFee: 5000000n,
  contractCallFee: 1000000n,
} as const;

/** Storage key prefixes */
export const STORAGE_PREFIXES = {
  WALLET: 'wallet_',
  TRANSACTION: 'tx_',
  CONTRACT: 'contract_',
  CACHE: 'cache_',
  STATE: 'state_',
} as const;

/** Secure storage key names */
export const SECURE_KEYS = {
  MNEMONIC: 'hd_mnemonic',
  PRIVATE_KEY: 'hd_private_key',
  PUBLIC_KEY: 'wallet_public_key',
  ADDRESS: 'wallet_address',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  WALLET_CONFIG: 'wallet_config',
  NETWORK: 'network',
} as const;

/** Default timeouts (ms) */
export const TIMEOUTS = {
  transaction: 60000, // 60 seconds
  contractDeploy: 120000, // 2 minutes
  contractCall: 60000, // 60 seconds
  proofGeneration: 300000, // 5 minutes
  indexerQuery: 30000, // 30 seconds
  websocket: 120000, // 2 minutes for idle
} as const;

/** Retry configuration */
export const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffBase: 1000, // ms
  backoffMax: 10000, // ms
} as const;

/** Cache TTLs (ms) */
export const CACHE_TTL = {
  balance: 30000, // 30 seconds
  transaction: 60000, // 1 minute
  contractState: 120000, // 2 minutes
} as const;

/** QR Code protocol versions */
export const QR_PROTOCOL_VERSION = 1;

/** Deep link protocol schemes */
export const DEEP_LINK_SCHEMES = {
  midnight: 'midnight',
  midnightDApp: 'midnight-dapp',
} as const;

/** Supported DApp methods */
export const DAPP_METHODS = [
  'sign_transaction',
  'sign_message',
  'get_address',
  'get_balance',
  'send_transaction',
  'deploy_contract',
  'call_contract',
] as const;

/** WebSocket connection states */
export const WS_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/** GraphQL subscription topics */
export const SUBSCRIPTION_TOPICS = {
  NEW_TRANSACTION: 'newTransaction',
  NEW_BLOCK: 'newBlock',
  CONTRACT_EVENT: 'contractEvent',
} as const;
