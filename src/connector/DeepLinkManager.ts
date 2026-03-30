// ============================================================================
// Deep Link Manager
// ============================================================================

import { createLogger } from '../utils/Logger';
import { DAppConnector } from './DAppConnector';
import { EventEmitter3 } from 'eventemitter3';

const logger = createLogger('DeepLinkManager');

/**
 * Deep link event types
 */
export type DeepLinkEventType =
  | 'open'
  | 'url'
  | 'dapp_request'
  | 'payment_request'
  | 'connect';

/**
 * Deep link event data
 */
export interface DeepLinkEvent {
  type: DeepLinkEventType;
  url: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Deep link manager configuration
 */
export interface DeepLinkManagerConfig {
  /** Supported schemes */
  schemes?: string[];
  /** Auto-handle known link types */
  autoHandle?: boolean;
}

/**
 * Deep link manager
 * Handles deep links and universal links for Midnight SDK
 */
export class DeepLinkManager extends EventEmitter3 {
  private config: DeepLinkManagerConfig;
  private dappConnector: DAppConnector | null = null;
  private initialUrl: string | null = null;
  private listening: boolean = false;

  constructor(config: DeepLinkManagerConfig = {}) {
    super();
    this.config = {
      schemes: ['midnight', 'midnight-dapp', 'https'],
      autoHandle: true,
      ...config,
    };
  }

  /**
   * Initialize deep link handling
   */
  async initialize(): Promise<void> {
    logger.info('Initializing deep link manager');

    // Get initial URL (if app was opened from a link)
    this.initialUrl = await this.getInitialURL();

    if (this.initialUrl) {
      logger.info(`App opened from deep link: ${this.initialUrl}`);
      this.processDeepLink(this.initialUrl);
    }

    // Start listening for incoming links
    await this.startListening();

    this.listening = true;
  }

  /**
   * Set the DApp connector for handling DApp requests
   */
  setDAppConnector(connector: DAppConnector): void {
    this.dappConnector = connector;
  }

  /**
   * Process a deep link URL
   */
  async processDeepLink(url: string): Promise<boolean> {
    logger.debug(`Processing deep link: ${url}`);

    try {
      const parsed = this.parseURL(url);

      if (!parsed) {
        logger.warn('Invalid deep link URL');
        return false;
      }

      // Emit general open event
      this.emit('open', {
        type: 'open',
        url,
        timestamp: Date.now(),
      });

      // Handle based on scheme/path
      if (this.config.autoHandle) {
        return await this.autoHandleURL(url, parsed);
      }

      return true;
    } catch (error) {
      logger.error('Error processing deep link', error);
      return false;
    }
  }

  /**
   * Generate a deep link URL
   */
  generateLink(
    type: string,
    params: Record<string, string | number | boolean>
  ): string {
    const scheme = this.config.schemes?.[0] ?? 'midnight';
    const queryParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      queryParams.set(key, String(value));
    }

    return `${scheme}://${type}?${queryParams.toString()}`;
  }

  /**
   * Generate a payment request link
   */
  generatePaymentLink(address: string, amount: string, network: string = 'testnet'): string {
    return this.generateLink('payment', {
      address,
      amount,
      network,
    });
  }

  /**
   * Generate a contract interaction link
   */
  generateContractLink(
    address: string,
    method: string,
    args: string
  ): string {
    return this.generateLink('contract', {
      address,
      method,
      args,
    });
  }

  /**
   * Check if a URL is a Midnight deep link
   */
  isMidnightLink(url: string): boolean {
    try {
      const parsed = new URL(url);
      const scheme = parsed.protocol.replace(':', '');

      return this.config.schemes?.includes(scheme) ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get initial URL
   */
  async getInitialURL(): Promise<string | null> {
    try {
      // Try to import Linking API from React Native
      const Linking = await this.importLinking();
      if (Linking) {
        const url = await Linking.getInitialURL();
        return url;
      }
    } catch {
      // Linking not available
    }
    return null;
  }

  /**
   * Stop listening for deep links
   */
  async stopListening(): Promise<void> {
    if (!this.listening) {
      return;
    }

    try {
      const Linking = await this.importLinking();
      if (Linking && this.urlSubscription) {
        this.urlSubscription.remove();
        this.urlSubscription = null;
      }

      this.listening = false;
      logger.debug('Stopped listening for deep links');
    } catch (error) {
      logger.error('Error stopping deep link listening', error);
    }
  }

  private urlSubscription: any = null;

  /**
   * Start listening for incoming deep links
   */
  private async startListening(): Promise<void> {
    try {
      const Linking = await this.importLinking();
      if (!Linking) {
        logger.warn('Linking API not available');
        return;
      }

      // Subscribe to URL changes
      this.urlSubscription = Linking.addEventListener('url', ({ url }) => {
        if (url) {
          logger.debug(`Received deep link: ${url}`);
          this.processDeepLink(url);
        }
      });

      logger.debug('Started listening for deep links');
    } catch (error) {
      logger.error('Error starting deep link listening', error);
    }
  }

  /**
   * Parse URL and extract data
   */
  private parseURL(url: string): { type: string; params: Record<string, string> } | null {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const type = pathParts[0];

      const params: Record<string, string> = {};
      for (const [key, value] of parsed.searchParams.entries()) {
        params[key] = value;
      }

      return { type, params };
    } catch {
      return null;
    }
  }

  /**
   * Auto-handle URL based on type
   */
  private async autoHandleURL(
    url: string,
    parsed: { type: string; params: Record<string, string> }
  ): Promise<boolean> {
    const { type, params } = parsed;

    switch (type) {
      case 'request':
      case 'dapp':
        // Handle DApp request
        if (this.dappConnector) {
          await this.dappConnector.handleDeepLink(url);
          this.emit('dapp_request', { type: 'dapp_request', url, params });
        }
        return true;

      case 'payment':
        // Handle payment request
        this.emit('payment_request', { type: 'payment_request', url, data: params });
        return true;

      case 'connect':
        // Handle DApp connection
        if (this.dappConnector) {
          await this.dappConnector.handleDeepLink(url);
        }
        this.emit('connect', { type: 'connect', url, data: params });
        return true;

      case 'contract':
        // Handle contract interaction
        this.emit('url', {
          type: 'url',
          url,
          data: { contract: params },
        });
        return true;

      default:
        // Emit generic URL event
        this.emit('url', {
          type: 'url',
          url,
          data: parsed,
        });
        return false;
    }
  }

  /**
   * Import Linking API (lazy load)
   */
  private async importLinking(): Promise<any> {
    try {
      const ReactNative = await import('react-native');
      return ReactNative.Linking;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this.stopListening();
    this.dappConnector = null;
    this.removeAllListeners();
  }
}

/**
 * Create a deep link manager instance
 */
export function createDeepLinkManager(
  config?: DeepLinkManagerConfig
): DeepLinkManager {
  return new DeepLinkManager(config);
}
