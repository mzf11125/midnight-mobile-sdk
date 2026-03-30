// ============================================================================
// Midnight Client - Main SDK Entry Point
// ============================================================================

import { EventEmitter3 } from 'eventemitter3';
import {
  MidnightSDKConfig,
  NetworkType,
  WalletInfo,
  WalletBalance,
  Transaction,
  ContractDeployOptions,
  ContractDeployResult,
  ContractCallOptions,
  ContractCallResult,
  IndexerQueryOptions,
  IndexerSubscriptionFilter,
  IndexerSubscriptionEvent,
  DAppRequest,
  SDKEvent,
  SDKEventPayload,
  ConnectionState,
  IMidnightWallet,
  IContractClient,
  IIndexerClient,
  IDAppConnector,
} from '../types';
import { NetworkConfig } from './NetworkConfig';
import { createLogger, ILogger } from '../utils/Logger';
import { createSQLiteStorage } from '../storage/SQLitePrivateState';
import { createTransactionCache } from '../storage/TransactionCache';
import { SecureStorage, createSecureStorage } from '../wallet/SecureStorage';
import { BiometricAuth, createBiometricAuth } from '../wallet/BiometricAuth';
import { MidnightWallet, createWallet, WalletConfig } from '../wallet/MidnightWallet';
import { ProofProvider, createProofProvider } from '../contracts/ProofProvider';
import { ContractClient, createContractClient } from '../contracts/ContractClient';
import { IndexerClient, createIndexerClient } from '../indexer/IndexerClient';
import { DAppConnector, createDAppConnector } from '../connector/DAppConnector';
import { DeepLinkManager, createDeepLinkManager } from '../connector/DeepLinkManager';
import { QRScanner, createQRScanner } from './connector/QRScanner';
import { STORAGE_PREFIXES, DEFAULT_DERIVATION_PATH } from './constants';

const logger = createLogger('MidnightClient');

/**
 * Midnight SDK Client
 * Main entry point for all SDK functionality
 */
export class MidnightClient extends EventEmitter3 {
  private config: MidnightSDKConfig;
  private storage: any = null;
  private transactionCache: any = null;
  private secureStorage: SecureStorage | null = null;
  private biometric: BiometricAuth | null = null;
  private wallet: IMidnightWallet | null = null;
  private proofProvider: ProofProvider | null = null;
  private contractClient: IContractClient | null = null;
  private indexerClient: IIndexerClient | null = null;
  private dappConnector: IDAppConnector | null = null;
  private deepLinkManager: DeepLinkManager | null = null;
  private qrScanner: QRScanner | null = null;
  private state: ConnectionState = 'disconnected';

  constructor(config: MidnightSDKConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the SDK
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Midnight Mobile SDK');

    try {
      this.updateState('connecting');

      // Set up network configuration
      const networkConfig = NetworkConfig.getInstance();
      if (this.config.customEndpoints) {
        networkConfig.registerNetwork(this.config.network, {
          ...networkConfig.getConfig(this.config.network),
          ...this.config.customEndpoints,
        } as any);
      } else {
        networkConfig.setCurrentNetwork(this.config.network);
      }

      // Initialize storage
      const dbName = this.config.dbName ?? 'midnight_mobile_sdk';
      this.storage = await createSQLiteStorage(dbName);

      // Initialize transaction cache
      this.transactionCache = await createTransactionCache(this.storage);

      // Initialize secure storage
      this.secureStorage = await createSecureStorage();

      // Initialize biometric auth
      this.biometric = await createBiometricAuth();

      // Initialize wallet
      const walletConfig: WalletConfig = {
        network: this.config.network,
        requireBiometrics: this.config.requireBiometrics ?? true,
        autoLockTimeout: 300000, // 5 minutes
      };

      // Check if wallet exists
      const walletExists = await this.secureStorage.has('hd_mnemonic');

      if (walletExists && this.secureStorage && this.biometric) {
        this.wallet = await createWallet(this.secureStorage, this.biometric, walletConfig);
      }

      // Initialize proof provider
      if (this.config.proofProvider) {
        this.proofProvider = createProofProvider(this.config.proofProvider);
      } else {
        const endpoints = networkConfig.getCurrentConfig();
        this.proofProvider = createProofProvider({
          endpoint: endpoints.proofProviderUrl,
        });
      }

      // Initialize contract client
      this.contractClient = createContractClient({
        network: this.config.network,
        proofProvider: this.proofProvider,
      });

      // Initialize indexer client
      this.indexerClient = await createIndexerClient(
        networkConfig.getCurrentConfig()
      );

      // Initialize DApp connector
      this.dappConnector = createDAppConnector();

      // Initialize deep link manager
      this.deepLinkManager = createDeepLinkManager();
      this.deepLinkManager.setDAppConnector(this.dappConnector);

      // Initialize QR scanner
      this.qrScanner = createQRScanner();

      // Set up event forwarding
      this.setupEventForwarding();

      this.updateState('connected');
      this.emit('ready', this.createEventPayload('ready'));

      logger.info('Midnight Mobile SDK initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SDK', error);
      this.updateState('error');
      throw error;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(): Promise<WalletInfo> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }

    logger.info('Creating new wallet');
    const info = await this.wallet.create();
    this.emit('wallet_created', info);
    return info;
  }

  /**
   * Import existing wallet from mnemonic
   */
  async importWallet(mnemonic: string): Promise<WalletInfo> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }

    logger.info('Importing wallet');
    const info = await this.wallet.import(mnemonic);
    this.emit('wallet_imported', info);
    return info;
  }

  /**
   * Check if wallet exists
   */
  async hasWallet(): Promise<boolean> {
    if (!this.wallet) {
      return false;
    }
    return await (this.wallet as any).exists();
  }

  /**
   * Get wallet info
   */
  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return await this.wallet.getWalletInfo();
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    const info = await this.getWalletInfo();
    return await this.indexerClient.getBalance(info.address);
  }

  /**
   * Get transaction history
   */
  async getTransactions(options?: IndexerQueryOptions): Promise<Transaction[]> {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    const info = await this.getWalletInfo();
    return await this.indexerClient.getTransactions(info.address, options);
  }

  /**
   * Subscribe to transaction events
   */
  subscribeToTransactions(
    callback: (tx: Transaction) => void
  ): () => void {
    if (!this.indexerClient) {
      throw new Error('Indexer client not initialized');
    }

    return this.indexerClient.subscribe(
      { address: async () => (await this.getWalletInfo()).address } as any,
      (event: IndexerSubscriptionEvent) => {
        if (event.type === 'new_tx') {
          const txs = event.data as Transaction[];
          txs.forEach(callback);
        }
      }
    );
  }

  /**
   * Deploy a contract
   */
  async deployContract(options: ContractDeployOptions): Promise<ContractDeployResult> {
    if (!this.contractClient) {
      throw new Error('Contract client not initialized');
    }

    const info = await this.getWalletInfo();
    (this.contractClient as any).setWallet(info);

    return await this.contractClient.deploy(options);
  }

  /**
   * Call a contract method
   */
  async callContract(options: ContractCallOptions): Promise<ContractCallResult> {
    if (!this.contractClient) {
      throw new Error('Contract client not initialized');
    }

    const info = await this.getWalletInfo();
    (this.contractClient as any).setWallet(info);

    return await this.contractClient.call(options);
  }

  /**
   * Query a contract (read-only)
   */
  async queryContract(
    address: string,
    method: string,
    args: Uint8Array
  ): Promise<unknown> {
    if (!this.contractClient) {
      throw new Error('Contract client not initialized');
    }

    const result = await this.contractClient.query(address, method, args);
    return result.returnData;
  }

  /**
   * Handle incoming deep link
   */
  async handleDeepLink(url: string): Promise<void> {
    if (!this.deepLinkManager) {
      throw new Error('Deep link manager not initialized');
    }
    await this.deepLinkManager.processDeepLink(url);
  }

  /**
   * Approve a DApp request
   */
  async approveDAppRequest(request: DAppRequest, result?: unknown): Promise<void> {
    if (!this.dappConnector) {
      throw new Error('DApp connector not initialized');
    }
    await this.dappConnector.approveRequest(request, result);
  }

  /**
   * Reject a DApp request
   */
  async rejectDAppRequest(request: DAppRequest, reason?: string): Promise<void> {
    if (!this.dappConnector) {
      throw new Error('DApp connector not initialized');
    }
    await this.dappConnector.rejectRequest(request, reason);
  }

  /**
   * Scan QR code
   */
  async scanQRCode(): Promise<string> {
    if (!this.qrScanner) {
      throw new Error('QR scanner not initialized');
    }

    return new Promise((resolve, reject) => {
      this.qrScanner!.startScanning((result) => {
        resolve(result.data);
        this.qrScanner!.stopScanning();
      }).catch(reject);
    });
  }

  /**
   * Lock the wallet
   */
  async lockWallet(): Promise<void> {
    if (!this.wallet) {
      return;
    }
    await this.wallet.lock();
    this.emit('wallet_locked');
  }

  /**
   * Unlock the wallet
   */
  async unlockWallet(biometric: boolean = true): Promise<boolean> {
    if (!this.wallet) {
      return false;
    }
    const unlocked = await this.wallet.unlock(biometric);
    if (unlocked) {
      this.emit('wallet_unlocked');
    }
    return unlocked;
  }

  /**
   * Check if wallet is unlocked
   */
  isWalletUnlocked(): boolean {
    return this.wallet?.isUnlocked() ?? false;
  }

  /**
   * Change network
   */
  async setNetwork(network: NetworkType): void {
    this.config.network = network;
    NetworkConfig.getInstance().setCurrentNetwork(network);

    if (this.wallet) {
      await (this.wallet as any).setNetwork(network);
    }

    this.emit('network_changed', network);
  }

  /**
   * Get current network
   */
  getNetwork(): NetworkType {
    return this.config.network;
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting Midnight SDK');

    // Lock wallet
    if (this.wallet) {
      await this.wallet.lock();
    }

    // Disconnect indexer
    if (this.indexerClient) {
      await this.indexerClient.disconnect();
    }

    // Stop deep link listening
    if (this.deepLinkManager) {
      await this.deepLinkManager.stopListening();
    }

    // Close storage
    if (this.storage) {
      await this.storage.close();
    }

    // Clear all listeners
    this.removeAllListeners();

    this.state = 'disconnected';
  }

  /**
   * Get the wallet instance
   */
  getWallet(): IMidnightWallet | null {
    return this.wallet;
  }

  /**
   * Get the contract client
   */
  getContractClient(): IContractClient | null {
    return this.contractClient;
  }

  /**
   * Get the indexer client
   */
  getIndexerClient(): IIndexerClient | null {
    return this.indexerClient;
  }

  /**
   * Get the DApp connector
   */
  getDAppConnector(): IDAppConnector | null {
    return this.dappConnector;
  }

  /**
   * Get the QR scanner
   */
  getQRScanner(): QRScanner | null {
    return this.qrScanner;
  }

  /**
   * Setup event forwarding from sub-modules
   */
  private setupEventForwarding(): void {
    // Forward DApp connector events
    if (this.dappConnector) {
      this.dappConnector.on('request', (request: DAppRequest) => {
        this.emit('dapp_request', this.createEventPayload('dapp_request', { request }));
      });
    }

    // Forward indexer subscription events
    if (this.indexerClient) {
      this.indexerClient.subscribe(
        { address: async () => (await this.getWalletInfo()).address } as any,
        (event: IndexerSubscriptionEvent) => {
          this.emit('new_transaction', this.createEventPayload('new_transaction', { event }));
        }
      );
    }
  }

  /**
   * Update connection state
   */
  private updateState(state: ConnectionState): void {
    this.state = state;
    this.emit('connection_state', this.createEventPayload('connection_state', { state }));
  }

  /**
   * Create event payload
   */
  private createEventPayload(type: SDKEvent, extra?: Record<string, unknown>): SDKEventPayload {
    return {
      type,
      timestamp: Date.now(),
      ...extra,
    };
  }
}

/**
 * Create and initialize a Midnight SDK client
 */
export async function createMidnightClient(config: MidnightSDKConfig): Promise<MidnightClient> {
  const client = new MidnightClient(config);
  await client.initialize();
  return client;
}

/**
 * Quick initialization helper
 */
export async function initMidnightSDK(network: NetworkType): Promise<MidnightClient> {
  return createMidnightClient({
    network,
    requireBiometrics: true,
    debug: false,
  });
}
