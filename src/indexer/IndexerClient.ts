// ============================================================================
// Indexer Client - GraphQL + WebSocket Subscriptions
// ============================================================================

import {
  IIndexerClient,
  Transaction,
  WalletBalance,
  IndexerQueryOptions,
  IndexerSubscriptionFilter,
  IndexerSubscriptionEvent,
  NetworkConfig,
  MidnightErrorCode,
  MidnightError,
} from '../types';
import { createLogger } from '../utils/Logger';
import { NetworkConfig as NetworkConfigManager } from '../core/NetworkConfig';

const logger = createLogger('IndexerClient');

/**
 * GraphQL queries
 */
const QUERIES = {
  /** Get transactions for an address */
  GET_TRANSACTIONS: `
    query GetTransactions($address: String!, $after: String, $limit: Int, $types: [String!]) {
      transactions(address: $address, after: $after, limit: $limit, types: $types) {
        hash
        type
        status
        from
        to
        amount
        fee
        timestamp
        blockNumber
        contractAddress
        method
        metadata
      }
    }
  `,

  /** Get a single transaction */
  GET_TRANSACTION: `
    query GetTransaction($hash: String!) {
      transaction(hash: $hash) {
        hash
        type
        status
        from
        to
        amount
        fee
        timestamp
        blockNumber
        contractAddress
        method
        metadata
      }
    }
  `,

  /** Get wallet balance */
  GET_BALANCE: `
    query GetBalance($address: String!) {
      balance(address: $address) {
        available
        total
        locked
        pending
      }
    }
  `,

  /** Get contract state */
  GET_CONTRACT_STATE: `
    query GetContractState($address: String!) {
      contract(address: $address) {
        address
        state
        deployedAt
        transactionCount
      }
    }
  `,

  /** Get contract info */
  GET_CONTRACT_INFO: `
    query GetContractInfo($address: String!) {
      contract(address: $address) {
        address
        deployer
        deployedAt
        transactionCount
      }
    }
  `,
};

/**
 * GraphQL subscriptions
 */
const SUBSCRIPTIONS = {
  /** Subscribe to new transactions */
  NEW_TRANSACTIONS: `
    subscription NewTransactions($address: String!) {
      newTransactions(address: $address) {
        hash
        type
        status
        from
        to
        amount
        fee
        timestamp
        blockNumber
        contractAddress
        method
        metadata
      }
    }
  `,

  /** Subscribe to new blocks */
  NEW_BLOCKS: `
    subscription NewBlocks {
      newBlocks {
        number
        hash
        timestamp
        transactionCount
      }
    }
  `,

  /** Subscribe to contract events */
  CONTRACT_EVENTS: `
    subscription ContractEvents($address: String!) {
      contractEvents(address: $address) {
        transaction {
          hash
          from
          timestamp
        }
        event
        data
      }
    }
  `,
};

/**
 * Subscription handler
 */
interface SubscriptionHandler {
  filter: IndexerSubscriptionFilter;
  callback: (event: IndexerSubscriptionEvent) => void;
  unsubscribe: () => void;
}

/**
 * Indexer client implementation
 * Uses Apollo Client for GraphQL + WebSocket subscriptions
 */
export class IndexerClient implements IIndexerClient {
  private networkConfig: NetworkConfig;
  private apolloClient: any = null;
  private wsClient: any = null;
  private subscriptions: Map<string, SubscriptionHandler> = new Map();
  private connected: boolean = false;

  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
  }

  /**
   * Initialize the indexer client
   */
  async initialize(): Promise<void> {
    try {
      await this.setupApolloClient();
      await this.setupWebSocketClient();
      this.connected = true;
      logger.info('Indexer client initialized');
    } catch (error) {
      logger.error('Failed to initialize indexer client', error);
      throw new MidnightError(
        MidnightErrorCode.NETWORK_ERROR,
        `Failed to connect to indexer: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Get transactions for an address
   */
  async getTransactions(
    address: string,
    options: IndexerQueryOptions = {}
  ): Promise<Transaction[]> {
    await this.ensureConnected();

    try {
      const variables: Record<string, unknown> = {
        address,
        limit: options.limit ?? 50,
      };

      if (options.afterTxHash) {
        variables.after = options.afterTxHash;
      }

      if (options.type) {
        variables.types = [options.type];
      }

      const result = await this.executeGraphQL(QUERIES.GET_TRANSACTIONS, variables);

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return this.parseTransactions(result.data.transactions);
    } catch (error) {
      logger.error('Failed to get transactions', error);
      return [];
    }
  }

  /**
   * Get a single transaction
   */
  async getTransaction(hash: string): Promise<Transaction | null> {
    await this.ensureConnected();

    try {
      const result = await this.executeGraphQL(QUERIES.GET_TRANSACTION, { hash });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (!result.data.transaction) {
        return null;
      }

      return this.parseTransaction(result.data.transaction);
    } catch (error) {
      logger.error(`Failed to get transaction ${hash}`, error);
      return null;
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(address: string): Promise<WalletBalance> {
    await this.ensureConnected();

    try {
      const result = await this.executeGraphQL(QUERIES.GET_BALANCE, { address });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const balance = result.data.balance;
      return {
        available: BigInt(balance.available),
        total: BigInt(balance.total),
        locked: BigInt(balance.locked),
        pending: BigInt(balance.pending),
      };
    } catch (error) {
      logger.error(`Failed to get balance for ${address}`, error);
      return {
        available: 0n,
        total: 0n,
        locked: 0n,
        pending: 0n,
      };
    }
  }

  /**
   * Subscribe to indexer events
   * Returns unsubscribe function
   */
  subscribe(
    filter: IndexerSubscriptionFilter,
    callback: (event: IndexerSubscriptionEvent) => void
  ): () => void {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    logger.debug(`Creating subscription: ${subscriptionId}`, filter);

    // Store subscription handler
    const handler: SubscriptionHandler = {
      filter,
      callback,
      unsubscribe: () => this.unsubscribeInternal(subscriptionId),
    };

    this.subscriptions.set(subscriptionId, handler);

    // Start actual GraphQL subscription
    this.startGraphQLSubscription(subscriptionId, filter);

    // Return unsubscribe function
    return () => handler.unsubscribe();
  }

  /**
   * Execute custom GraphQL query
   */
  async query<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    await this.ensureConnected();

    try {
      return await this.executeGraphQL(query, variables);
    } catch (error) {
      logger.error('GraphQL query failed', error);
      throw error;
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from indexer
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting indexer client');

    // Unsubscribe all
    for (const [id, handler] of this.subscriptions.entries()) {
      handler.unsubscribe();
    }
    this.subscriptions.clear();

    // Close WebSocket
    if (this.wsClient) {
      await this.wsClient.dispose();
      this.wsClient = null;
    }

    // Reset Apollo client
    this.apolloClient = null;
    this.connected = false;
  }

  /**
   * Setup Apollo Client
   */
  private async setupApolloClient(): Promise<void> {
    try {
      // Try to import Apollo Client
      const { ApolloClient, InMemoryCache, HttpLink } = await import('@apollo/client');

      const httpLink = new HttpLink({
        uri: this.networkConfig.indexerUrl,
      });

      this.apolloClient = new ApolloClient({
        link: httpLink,
        cache: new InMemoryCache(),
        defaultOptions: {
          watchQuery: {
            fetchPolicy: 'network-only',
          },
          query: {
            fetchPolicy: 'network-only',
          },
        },
      });

      logger.debug('Apollo Client setup complete');
    } catch (error) {
      logger.warn('Apollo Client not available, using fetch fallback', error);
      // Will use fetch fallback in executeGraphQL
    }
  }

  /**
   * Setup WebSocket client for subscriptions
   */
  private async setupWebSocketClient(): Promise<void> {
    try {
      const { createClient } = await import('graphql-ws');

      this.wsClient = createClient({
        url: this.networkConfig.indexerWsUrl,
        on: {
          connected: () => {
            logger.debug('WebSocket connected');
          },
          error: (error: unknown) => {
            logger.error('WebSocket error', error);
          },
          closed: () => {
            logger.debug('WebSocket closed');
          },
        },
      });

      logger.debug('WebSocket client setup complete');
    } catch (error) {
      logger.warn('GraphQL WebSocket not available', error);
    }
  }

  /**
   * Execute GraphQL query
   */
  private async executeGraphQL(
    query: string,
    variables: Record<string, unknown>
  ): Promise<any> {
    if (this.apolloClient) {
      const result = await this.apolloClient.query({
        query,
        variables,
      });
      return result.data;
    }

    // Fallback to fetch
    const response = await fetch(this.networkConfig.indexerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Start GraphQL subscription
   */
  private async startGraphQLSubscription(
    subscriptionId: string,
    filter: IndexerSubscriptionFilter
  ): Promise<void> {
    if (!this.wsClient) {
      logger.warn('WebSocket client not available, subscription not active');
      return;
    }

    try {
      // Determine subscription type based on filter
      let subscriptionQuery = SUBSCRIPTIONS.NEW_TRANSACTIONS;
      let variables: Record<string, unknown> = {};

      if (filter.contractAddress) {
        subscriptionQuery = SUBSCRIPTIONS.CONTRACT_EVENTS;
        variables = { address: filter.contractAddress };
      } else if (filter.address) {
        subscriptionQuery = SUBSCRIPTIONS.NEW_TRANSACTIONS;
        variables = { address: filter.address };
      } else {
        subscriptionQuery = SUBSCRIPTIONS.NEW_BLOCKS;
        variables = {};
      }

      // Subscribe
      this.wsClient.subscribe(
        { query: subscriptionQuery, variables },
        {
          next: (data: any) => {
            const handler = this.subscriptions.get(subscriptionId);
            if (handler) {
              const event = this.parseSubscriptionEvent(data);
              if (this.matchesFilter(event, filter)) {
                handler.callback(event);
              }
            }
          },
          error: (error: unknown) => {
            logger.error(`Subscription error: ${subscriptionId}`, error);
          },
          complete: () => {
            logger.debug(`Subscription complete: ${subscriptionId}`);
          },
        }
      );
    } catch (error) {
      logger.error(`Failed to start subscription: ${subscriptionId}`, error);
    }
  }

  /**
   * Unsubscribe from a subscription
   */
  private unsubscribeInternal(subscriptionId: string): void {
    logger.debug(`Unsubscribing: ${subscriptionId}`);
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Parse transaction from GraphQL response
   */
  private parseTransaction(data: any): Transaction {
    return {
      hash: data.hash,
      type: data.type,
      status: data.status,
      from: data.from,
      to: data.to,
      amount: BigInt(data.amount || 0),
      fee: BigInt(data.fee || 0),
      timestamp: data.timestamp,
      blockNumber: data.blockNumber,
      contractAddress: data.contractAddress,
      method: data.method,
      metadata: data.metadata,
    };
  }

  /**
   * Parse transactions from GraphQL response
   */
  private parseTransactions(data: any[]): Transaction[] {
    return data.map((tx) => this.parseTransaction(tx));
  }

  /**
   * Parse subscription event
   */
  private parseSubscriptionEvent(data: any): IndexerSubscriptionEvent {
    if (data.newTransactions) {
      return {
        type: 'new_tx',
        data: this.parseTransactions(data.newTransactions),
        timestamp: Date.now(),
      };
    }

    if (data.newBlocks) {
      return {
        type: 'new_block',
        data: data.newBlocks,
        timestamp: Date.now(),
      };
    }

    if (data.contractEvents) {
      return {
        type: 'contract_event',
        data: data.contractEvents,
        timestamp: Date.now(),
      };
    }

    return {
      type: 'tx_update',
      data,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(
    event: IndexerSubscriptionEvent,
    filter: IndexerSubscriptionFilter
  ): boolean {
    // For now, always return true
    // In production, this would filter based on event type and data
    return true;
  }

  /**
   * Ensure client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.initialize();
    }
  }
}

/**
 * Create an indexer client instance
 */
export async function createIndexerClient(
  networkConfig?: NetworkConfig
): Promise<IndexerClient> {
  const config =
    networkConfig ?? NetworkConfigManager.getInstance().getCurrentConfig();

  const client = new IndexerClient(config);
  await client.initialize();
  return client;
}

/**
 * Export GraphQL queries for external use
 */
export const GRAPHQL_QUERIES = QUERIES;
export const GRAPHQL_SUBSCRIPTIONS = SUBSCRIPTIONS;
