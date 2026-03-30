// ============================================================================
// Midnight Network Types
// ============================================================================

/** Supported Midnight networks */
export type NetworkType = 'testnet' | 'preprod' | 'mainnet';

/** Network configuration endpoints */
export interface NetworkConfig {
  /** Network identifier */
  networkId: number;
  /** GraphQL indexer endpoint */
  indexerUrl: string;
  /** WebSocket indexer endpoint */
  indexerWsUrl: string;
  /** Proof provider HTTP endpoint */
  proofProviderUrl: string;
  /** Ledger data provider endpoint */
  ledgerUrl: string;
  /** ZK config provider endpoint */
  zkConfigUrl: string;
}

/** Wallet address and associated metadata */
export interface WalletInfo {
  /** Bech32-encoded address */
  address: string;
  /** Public key (hex) */
  publicKey: string;
  /** Network the wallet belongs to */
  network: NetworkType;
}

/** Wallet balance information */
export interface WalletBalance {
  /** Available spending balance */
  available: bigint;
  /** Total balance including locked/unconfirmed */
  total: bigint;
  /** Locked/staked amount */
  locked: bigint;
  /** Pending (unconfirmed) amount */
  pending: bigint;
}

/** Transaction types on Midnight */
export type TxType = 'transfer' | 'contract_deploy' | 'contract_call' | 'stake' | 'unstake';

/** Transaction status */
export type TxStatus = 'pending' | 'confirmed' | 'failed' | 'unknown';

/** A Midnight transaction */
export interface Transaction {
  /** Transaction hash (hex) */
  hash: string;
  /** Transaction type */
  type: TxType;
  /** Current status */
  status: TxStatus;
  /** From address */
  from: string;
  /** To address (null for contract deployments) */
  to: string | null;
  /** Amount transferred */
  amount: bigint;
  /** Fee paid */
  fee: bigint;
  /** Transaction timestamp (Unix ms) */
  timestamp: number;
  /** Block number (null if pending) */
  blockNumber: number | null;
  /** Contract address (if applicable) */
  contractAddress?: string;
  /** Method called (if contract tx) */
  method?: string;
  /** Transaction metadata */
  metadata?: Record<string, unknown>;
}

/** Contract deployment options */
export interface ContractDeployOptions {
  /** Compact contract source code */
  source: string;
  /** Initial constructor arguments (encoded) */
  args?: Uint8Array;
  /** Maximum fee to pay */
  maxFee?: bigint;
  /** Confirmation timeout (ms) */
  timeout?: number;
}

/** Contract call options */
export interface ContractCallOptions {
  /** Contract address */
  address: string;
  /** Method name */
  method: string;
  /** Method arguments (encoded) */
  args: Uint8Array;
  /** Value to send (optional) */
  value?: bigint;
  /** Maximum fee to pay */
  maxFee?: bigint;
  /** Confirmation timeout (ms) */
  timeout?: number;
}

/** Contract deployment result */
export interface ContractDeployResult {
  /** Deployed contract address */
  address: string;
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
}

/** Contract call result */
export interface ContractCallResult {
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
  /** Return data (decoded) */
  returnData: Uint8Array;
}

/** Contract query result (read-only) */
export interface ContractQueryResult {
  /** Return data (decoded) */
  returnData: Uint8Array;
  /** Whether the call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/** Proof provider configuration */
export interface ProofProviderConfig {
  /** HTTP endpoint for proof generation */
  endpoint: string;
  /** Authentication token (if required) */
  authToken?: string;
  /** Request timeout (ms) */
  timeout?: number;
}

/** Indexer query options */
export interface IndexerQueryOptions {
  /** Fetch transactions after this hash */
  afterTxHash?: string;
  /** Limit number of results */
  limit?: number;
  /** Filter by transaction type */
  type?: TxType;
  /** Filter by contract address */
  contractAddress?: string;
}

/** Indexer subscription filter */
export interface IndexerSubscriptionFilter {
  /** Address to watch */
  address?: string;
  /** Contract address to watch */
  contractAddress?: string;
  /** Transaction types to watch */
  txTypes?: TxType[];
}

/** GraphQL subscription event */
export interface IndexerSubscriptionEvent<T = unknown> {
  /** Event type */
  type: 'new_tx' | 'new_block' | 'tx_update' | 'contract_event';
  /** Event data */
  data: T;
  /** Timestamp (Unix ms) */
  timestamp: number;
}

/** DApp connection request types */
export type DAppRequestMethod =
  | 'sign_transaction'
  | 'sign_message'
  | 'get_address'
  | 'get_balance'
  | 'send_transaction'
  | 'deploy_contract'
  | 'call_contract';

/** DApp request via deep link */
export interface DAppRequest {
  /** Unique request ID */
  id: string;
  /** Request method */
  method: DAppRequestMethod;
  /** Request parameters */
  params: Record<string, unknown>;
  /** DApp callback URL */
  callback: string;
  /** Request timestamp */
  timestamp: number;
}

/** DApp response */
export interface DAppResponse {
  /** Request ID being responded to */
  id: string;
  /** Whether the request was approved */
  approved: boolean;
  /** Response data (if approved) */
  result?: unknown;
  /** Error message (if rejected) */
  error?: string;
  /** Response timestamp */
  timestamp: number;
}

/** Biometric authentication options */
export interface BiometricAuthOptions {
  /** Prompt message */
  prompt?: string;
  /** Cancel button text */
  cancelLabel?: string;
  /** Fall back to device passcode */
  fallbackToDevicePasscode?: boolean;
}

/** Secure storage key types */
export type SecureKeyType =
  | 'hd_mnemonic'
  | 'hd_private_key'
  | 'wallet_public_key'
  | 'wallet_address'
  | 'biometric_enabled'
  | 'wallet_config';

/** Storage adapter interface (LevelDB-compatible) */
export interface IStorageAdapter {
  /** Get a value by key */
  get(key: string): Promise<Uint8Array | undefined>;
  /** Put a value */
  put(key: string, value: Uint8Array): Promise<void>;
  /** Delete a value */
  del(key: string): Promise<void>;
  /** Get multiple values by batch */
  getBatch(keys: string[]): Promise<(Uint8Array | undefined)[]>;
  /** Put multiple values */
  putBatch(entries: Array<{ key: string; value: Uint8Array }>): Promise<void>;
  /** Delete multiple keys */
  delBatch(keys: string[]): Promise<void>;
  /** Create an iterator for range queries */
  iterator(opts?: { gte?: string; lte?: string; limit?: number }): AsyncIterator<Entry>;
  /** Clear all data */
  clear(): Promise<void>;
  /** Close the storage */
  close(): Promise<void>;
}

/** Storage iterator entry */
export interface Entry {
  key: string;
  value: Uint8Array;
}

/** Transaction cache entry for offline queue */
export interface CachedTransaction {
  /** Unique cache ID */
  id: string;
  /** Serialized transaction */
  transaction: Uint8Array;
  /** Creation timestamp */
  createdAt: number;
  /** Retry count */
  retryCount: number;
  /** Target network */
  network: NetworkType;
  /** Whether this is a high-priority tx */
  priority: 'high' | 'normal' | 'low';
}

/** Logger levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/** Logger interface */
export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
}

/** SDK initialization options */
export interface MidnightSDKConfig {
  /** Network to connect to */
  network: NetworkType;
  /** Custom network endpoints (optional) */
  customEndpoints?: Partial<NetworkConfig>;
  /** Storage database name */
  dbName?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger */
  logger?: ILogger;
  /** Require biometric auth for signing */
  requireBiometrics?: boolean;
  /** Proof provider configuration */
  proofProvider?: ProofProviderConfig;
}

/** SDK client events */
export type SDKEvent =
  | 'ready'
  | 'sync_start'
  | 'sync_progress'
  | 'sync_complete'
  | 'sync_error'
  | 'new_transaction'
  | 'balance_update'
  | 'dapp_request'
  | 'connection_state';

/** Connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error';

/** Event payload base */
export interface EventPayload {
  type: SDKEvent;
  timestamp: number;
}

/** Sync progress event */
export interface SyncProgressEvent extends EventPayload {
  type: 'sync_progress';
  progress: number; // 0-100
  blocksRemaining: number;
}

/** Balance update event */
export interface BalanceUpdateEvent extends EventPayload {
  type: 'balance_update';
  address: string;
  oldBalance: WalletBalance;
  newBalance: WalletBalance;
}

/** DApp request event */
export interface DAppRequestEvent extends EventPayload {
  type: 'dapp_request';
  request: DAppRequest;
}

/** Connection state event */
export interface ConnectionStateEvent extends EventPayload {
  type: 'connection_state';
  state: ConnectionState;
  error?: string;
}

/** Union of all event payloads */
export type SDKEventPayload =
  | EventPayload
  | SyncProgressEvent
  | BalanceUpdateEvent
  | DAppRequestEvent
  | ConnectionStateEvent;

/** Key derivation path (BIP-44 like) */
export interface KeyDerivationPath {
  /** Purpose (e.g., 44 for BIP-44) */
  purpose: number;
  /** Coin type (Midnight-specific) */
  coinType: number;
  /** Account index */
  account: number;
  /** Change (0=external, 1=internal) */
  change: number;
  /** Address index */
  index: number;
}

/** HD wallet creation options */
export interface HDWalletOptions {
  /** Mnemonic phrase (12/24 words) */
  mnemonic?: string;
  /** BIP-39 passphrase */
  passphrase?: string;
  /** Derivation path */
  path?: KeyDerivationPath;
  /** Language for mnemonic generation */
  language?: 'english' | 'chinese' | 'japanese' | 'spanish' | 'french';
}

/** Wallet interface */
export interface IMidnightWallet {
  /** Create a new wallet */
  create(options?: HDWalletOptions): Promise<WalletInfo>;
  /** Import existing wallet from mnemonic */
  import(mnemonic: string, options?: Partial<HDWalletOptions>): Promise<WalletInfo>;
  /** Get wallet info */
  getWalletInfo(): Promise<WalletInfo>;
  /** Get wallet balance */
  getBalance(): Promise<WalletBalance>;
  /** Sign a transaction */
  signTransaction(tx: Uint8Array): Promise<Uint8Array>;
  /** Sign a message */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Verify a message signature */
  verifySignature(message: Uint8Array, signature: Uint8Array, address: string): boolean;
  /** Lock the wallet (requires re-authentication) */
  lock(): Promise<void>;
  /** Unlock the wallet */
  unlock(biometric?: boolean): Promise<boolean>;
  /** Whether wallet is currently unlocked */
  isUnlocked(): boolean;
  /** Remove wallet from secure storage */
  wipe(): Promise<void>;
}

/** Contract client interface */
export interface IContractClient {
  /** Deploy a new contract */
  deploy(options: ContractDeployOptions): Promise<ContractDeployResult>;
  /** Call a contract method */
  call(options: ContractCallOptions): Promise<ContractCallResult>;
  /** Query a contract (read-only) */
  query(address: string, method: string, args: Uint8Array): Promise<ContractQueryResult>;
  /** Get contract state */
  getState(address: string): Promise<Record<string, unknown>>;
}

/** Indexer client interface */
export interface IIndexerClient {
  /** Query transactions */
  getTransactions(address: string, options?: IndexerQueryOptions): Promise<Transaction[]>;
  /** Get a single transaction */
  getTransaction(hash: string): Promise<Transaction | null>;
  /** Get balance */
  getBalance(address: string): Promise<WalletBalance>;
  /** Subscribe to events */
  subscribe(filter: IndexerSubscriptionFilter, callback: (event: IndexerSubscriptionEvent) => void): () => void;
  /** Execute custom GraphQL query */
  query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

/** DApp connector interface */
export interface IDAppConnector {
  /** Handle incoming deep link */
  handleDeepLink(url: string): Promise<void>;
  /** Approve a DApp request */
  approveRequest(request: DAppRequest, result?: unknown): Promise<void>;
  /** Reject a DApp request */
  rejectRequest(request: DAppRequest, reason?: string): Promise<void>;
  /** Generate QR code for DApp connection */
  generateConnectionQR(): Promise<string>;
  /** Scan QR code with DApp request */
  scanQRCode(): Promise<DAppRequest>;
}

/** Error codes */
export enum MidnightErrorCode {
  // Generic errors (0-99)
  UNKNOWN = 0,
  NETWORK_ERROR = 1,
  TIMEOUT = 2,
  INVALID_RESPONSE = 3,

  // Wallet errors (100-199)
  WALLET_NOT_FOUND = 100,
  WALLET_LOCKED = 101,
  WALLET_ALREADY_EXISTS = 102,
  INVALID_MNEMONIC = 103,
  KEY_DERivation_FAILED = 104,
  BIOMETRIC_NOT_AVAILABLE = 105,
  BIOMETRIC_FAILED = 106,
  BIOMETRIC_DISMISSED = 107,

  // Transaction errors (200-299)
  TRANSACTION_FAILED = 200,
  INSUFFICIENT_BALANCE = 201,
  INVALID_TRANSACTION = 202,
  TRANSACTION_REJECTED = 203,
  TRANSACTION_TIMEOUT = 204,

  // Contract errors (300-399)
  CONTRACT_DEPLOY_FAILED = 300,
  CONTRACT_CALL_FAILED = 301,
  CONTRACT_QUERY_FAILED = 302,
  PROOF_GENERATION_FAILED = 303,
  INVALID_CONTRACT_SOURCE = 304,

  // Storage errors (400-499)
  STORAGE_ERROR = 400,
  DATABASE_CORRUPTED = 401,
  MIGRATION_FAILED = 402,

  // DApp errors (500-599)
  INVALID_DAPP_REQUEST = 500,
  DAPP_NOT_APPROVED = 501,
  DAPP_CONNECTION_FAILED = 502,
  INVALID_QR_CODE = 503,
}

/** Midnight SDK error */
export class MidnightError extends Error {
  constructor(
    public code: MidnightErrorCode,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'MidnightError';
  }
}

/** Re-export for convenience */
export type { EventEmitter3 as EventEmitter } from 'eventemitter3';
