// ============================================================================
// Network Configuration
// ============================================================================

import { NetworkType, NetworkConfig as INetworkConfig } from '../types';
import { NETWORK_IDS } from './constants';

/** Default network endpoints for each Midnight network */
const DEFAULT_ENDPOINTS: Record<NetworkType, INetworkConfig> = {
  testnet: {
    networkId: 0,
    indexerUrl: 'https://indexer.testnet.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
    proofProviderUrl: 'https://proof-provider.testnet.midnight.network',
    ledgerUrl: 'https://ledger.testnet.midnight.network/api/v1',
    zkConfigUrl: 'https://zk-config.testnet.midnight.network',
  },
  preprod: {
    networkId: 1,
    indexerUrl: 'https://indexer.preprod.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v1/graphql',
    proofProviderUrl: 'https://proof-provider.preprod.midnight.network',
    ledgerUrl: 'https://ledger.preprod.midnight.network/api/v1',
    zkConfigUrl: 'https://zk-config.preprod.midnight.network',
  },
  mainnet: {
    networkId: 2,
    indexerUrl: 'https://indexer.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.midnight.network/api/v1/graphql',
    proofProviderUrl: 'https://proof-provider.midnight.network',
    ledgerUrl: 'https://ledger.midnight.network/api/v1',
    zkConfigUrl: 'https://zk-config.midnight.network',
  },
};

/**
 * Network configuration manager
 * Provides network endpoints and validates custom configurations
 */
export class NetworkConfig {
  private static instance: NetworkConfig;
  private configs: Map<NetworkType, INetworkConfig>;
  private currentNetwork: NetworkType;

  private constructor() {
    this.configs = new Map(Object.entries(DEFAULT_ENDPOINTS) as [NetworkType, INetworkConfig][]);
    this.currentNetwork = 'testnet';
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): NetworkConfig {
    if (!NetworkConfig.instance) {
      NetworkConfig.instance = new NetworkConfig();
    }
    return NetworkConfig.instance;
  }

  /**
   * Get configuration for a specific network
   */
  getConfig(network: NetworkType): INetworkConfig {
    const config = this.configs.get(network);
    if (!config) {
      throw new Error(`Unknown network: ${network}`);
    }
    return { ...config };
  }

  /**
   * Get the current network configuration
   */
  getCurrentConfig(): INetworkConfig {
    return this.getConfig(this.currentNetwork);
  }

  /**
   * Set the current network
   */
  setCurrentNetwork(network: NetworkType): void {
    if (!this.configs.has(network)) {
      throw new Error(`Unknown network: ${network}`);
    }
    this.currentNetwork = network;
  }

  /**
   * Get the current network type
   */
  getCurrentNetwork(): NetworkType {
    return this.currentNetwork;
  }

  /**
   * Get network ID from network type
   */
  getNetworkId(network: NetworkType): number {
    return NETWORK_IDS[network];
  }

  /**
   * Register or override a network configuration
   */
  registerNetwork(network: NetworkType, config: INetworkConfig): void {
    this.validateConfig(config);
    this.configs.set(network, { ...config });
  }

  /**
   * Merge custom endpoints with default network config
   */
  withCustomEndpoints(
    network: NetworkType,
    custom: Partial<INetworkConfig>
  ): INetworkConfig {
    const base = this.getConfig(network);
    return {
      ...base,
      ...custom,
    };
  }

  /**
   * Validate a network configuration
   */
  private validateConfig(config: INetworkConfig): void {
    const required: (keyof INetworkConfig)[] = [
      'networkId',
      'indexerUrl',
      'indexerWsUrl',
      'proofProviderUrl',
      'ledgerUrl',
      'zkConfigUrl',
    ];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Invalid network config: missing ${field}`);
      }
    }

    // Validate URLs
    const urlFields: (keyof INetworkConfig)[] = [
      'indexerUrl',
      'indexerWsUrl',
      'proofProviderUrl',
      'ledgerUrl',
      'zkConfigUrl',
    ];

    for (const field of urlFields) {
      const url = config[field];
      try {
        new URL(url as string);
      } catch {
        throw new Error(`Invalid ${field}: must be a valid URL`);
      }
    }

    // Validate WebSocket URL
    if (!config.indexerWsUrl.startsWith('wss://') && !config.indexerWsUrl.startsWith('ws://')) {
      throw new Error('indexerWsUrl must be a WebSocket URL');
    }
  }

  /**
   * Check if a network is a test network (not mainnet)
   */
  isTestNetwork(network: NetworkType): boolean {
    return network !== 'mainnet';
  }

  /**
   * Get all registered network types
   */
  getAvailableNetworks(): NetworkType[] {
    return Array.from(this.configs.keys());
  }
}

/**
 * Factory function to get network config
 */
export function getNetworkConfig(network?: NetworkType): INetworkConfig {
  const instance = NetworkConfig.getInstance();
  return network ? instance.getConfig(network) : instance.getCurrentConfig();
}

/**
 * Set the current active network
 */
export function setNetwork(network: NetworkType): void {
  NetworkConfig.getInstance().setCurrentNetwork(network);
}
