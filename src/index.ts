// ============================================================================
// Midnight Mobile SDK - Main Entry Point
// ============================================================================

// Version
export const VERSION = '0.1.0';

// Main client
export {
  MidnightClient,
  createMidnightClient,
  initMidnightSDK,
} from './core/MidnightClient';

// Network configuration
export {
  NetworkConfig,
  getNetworkConfig,
  setNetwork,
} from './core/NetworkConfig';

export {
  NETWORK_IDS,
  DEFAULT_DERIVATION_PATH,
  MIDNIGHT_COIN_TYPE,
  DEFAULT_FEES,
  TIMEOUTS,
  DEEP_LINK_SCHEMES,
} from './core/constants';

// Wallet
export {
  MidnightWallet,
  createWallet,
  WalletConfig,
} from './wallet/MidnightWallet';

export {
  SecureStorage,
  createSecureStorage,
} from './wallet/SecureStorage';

export {
  BiometricAuth,
  createBiometricAuth,
  canUseBiometric,
  promptBiometric,
} from './wallet/BiometricAuth';

export {
  generateMnemonic,
  isValidMnemonic,
  deriveFromMnemonic,
  deriveAddress,
  sign,
  verify,
  HDKeyManager,
  createHDKeyManager,
  generateWallet,
  formatDerivationPath,
  parseDerivationPath,
} from './wallet/KeyDerivation';

// Storage
export {
  SQLitePrivateState,
  createSQLiteStorage,
  MemoryStorageAdapter,
} from './storage/SQLitePrivateState';

export { StorageAdapter } from './storage/StorageAdapter';

export {
  TransactionCache,
  createTransactionCache,
} from './storage/TransactionCache';

// Contracts
export {
  ContractClient,
  createContractClient,
  DeploymentStatus,
} from './contracts/ContractClient';

export {
  ProofProvider,
  createProofProvider,
} from './contracts/ProofProvider';

// Indexer
export {
  IndexerClient,
  createIndexerClient,
  GRAPHQL_QUERIES,
  GRAPHQL_SUBSCRIPTIONS,
} from './indexer/IndexerClient';

// DApp Connector
export {
  DAppConnector,
  createDAppConnector,
} from './connector/DAppConnector';

export {
  QRScanner,
  createQRScanner,
  scanQRCode,
} from './connector/QRScanner';

export {
  DeepLinkManager,
  createDeepLinkManager,
} from './connector/DeepLinkManager';

export {
  MidnightProtocol,
  createMidnightProtocol,
  PROTOCOL_VERSION as MIDNIGHT_PROTOCOL_VERSION,
} from './connector/MidnightProtocol';

// Utilities
export {
  Logger,
  createLogger,
  getDefaultLogger,
  setLogLevel,
  enableDebugMode,
} from './utils/Logger';

export {
  createMidnightError,
  isMidnightError,
  getUserMessage,
  isRetryable,
  retryAsync,
  withTimeout,
} from './utils/Errors';

export {
  validateMnemonic,
  validateAddress,
  validatePublicKey,
  validateHex,
  validateUrl,
  validateContractSource,
} from './utils/Validation';

// Types
export type {
  // Core types
  NetworkType,
  NetworkConfig as NetworkConfigType,

  // Wallet types
  WalletInfo,
  WalletBalance,
  KeyDerivationPath,
  HDWalletOptions,
  BiometricAuthOptions,

  // Transaction types
  TxType,
  TxStatus,
  Transaction,

  // Contract types
  ContractDeployOptions,
  ContractDeployResult,
  ContractCallOptions,
  ContractCallResult,
  ContractQueryResult,
  ProofProviderConfig,

  // Indexer types
  IndexerQueryOptions,
  IndexerSubscriptionFilter,
  IndexerSubscriptionEvent,

  // DApp types
  DAppRequestMethod,
  DAppRequest,
  DAppResponse,

  // Storage types
  IStorageAdapter,
  Entry,
  CachedTransaction,

  // SDK types
  MidnightSDKConfig,
  SDKEvent,
  SDKEventPayload,
  ConnectionState,
  ILogger,

  // Interfaces
  IMidnightWallet,
  IContractClient,
  IIndexerClient,
  IDAppConnector,

  // Error types
  MidnightErrorCode,
  MidnightError,
} from './types';

// Re-export EventEmitter
export { EventEmitter3 as EventEmitter } from './types';

// Default export
export { MidnightClient as default } from './core/MidnightClient';
