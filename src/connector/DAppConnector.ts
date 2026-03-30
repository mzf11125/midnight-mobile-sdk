// ============================================================================
// DApp Connector - Deep Link Protocol Handler
// ============================================================================

import {
  IDAppConnector,
  DAppRequest,
  DAppResponse,
  DAppRequestMethod,
  MidnightErrorCode,
  MidnightError,
} from '../types';
import { createLogger } from '../utils/Logger';
import { validateUrl } from '../utils/Validation';
import { EventEmitter3 } from 'eventemitter3';

const logger = createLogger('DAppConnector');

/** Protocol version */
const PROTOCOL_VERSION = 1;

/** Deep link schemes */
const SCHEMES = ['midnight', 'midnight-dapp'] as const;

/** Pending requests awaiting user approval */
interface PendingRequest {
  request: DAppRequest;
  timeout: NodeJS.Timeout;
  resolve: (response: DAppResponse) => void;
  reject: (error: Error) => void;
}

/**
 * DApp connector events
 */
export interface DAppConnectorEvents {
  request: (request: DAppRequest) => void;
  response: (response: DAppResponse) => void;
  connected: (dappInfo: { name: string; url: string }) => void;
  disconnected: () => void;
}

/**
 * DApp connector implementation
 * Handles deep links and QR codes for DApp connections
 */
export class DAppConnector extends EventEmitter3 implements IDAppConnector {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestTimeout: number = 300000; // 5 minutes default
  private connectedDApp: { name: string; url: string } | null = null;

  constructor() {
    super();
    this.setupDeepLinkListener();
  }

  /**
   * Handle incoming deep link URL
   */
  async handleDeepLink(url: string): Promise<void> {
    logger.debug(`Handling deep link: ${url}`);

    try {
      const parsed = this.parseDeepLink(url);

      if (!parsed) {
        throw new Error('Invalid deep link format');
      }

      switch (parsed.type) {
        case 'request':
          await this.handleRequest(parsed.data as DAppRequest);
          break;

        case 'connect':
          await this.handleConnect(parsed.data);
          break;

        case 'disconnect':
          await this.handleDisconnect();
          break;

        default:
          throw new Error(`Unknown deep link type: ${parsed.type}`);
      }
    } catch (error) {
      logger.error('Failed to handle deep link', error);
      throw new MidnightError(
        MidnightErrorCode.INVALID_DAPP_REQUEST,
        `Invalid deep link: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Approve a DApp request
   */
  async approveRequest(request: DAppRequest, result?: unknown): Promise<void> {
    logger.info(`Approving request: ${request.id}`);

    const pending = this.pendingRequests.get(request.id);
    if (!pending) {
      throw new Error('Request not found or expired');
    }

    const response: DAppResponse = {
      id: request.id,
      approved: true,
      result,
      timestamp: Date.now(),
    };

    // Send response to DApp callback
    await this.sendResponse(request.callback, response);

    // Resolve pending promise
    pending.resolve(response);

    // Clean up
    this.clearPendingRequest(request.id);

    this.emit('response', response);
  }

  /**
   * Reject a DApp request
   */
  async rejectRequest(request: DAppRequest, reason?: string): Promise<void> {
    logger.info(`Rejecting request: ${request.id} - ${reason}`);

    const pending = this.pendingRequests.get(request.id);
    if (!pending) {
      throw new Error('Request not found or expired');
    }

    const response: DAppResponse = {
      id: request.id,
      approved: false,
      error: reason ?? 'User rejected the request',
      timestamp: Date.now(),
    };

    // Send response to DApp callback
    await this.sendResponse(request.callback, response);

    // Reject pending promise
    pending.reject(new Error(response.error));

    // Clean up
    this.clearPendingRequest(request.id);

    this.emit('response', response);
  }

  /**
   * Generate QR code for DApp connection
   * Returns a URL that the DApp can scan
   */
  async generateConnectionQR(): Promise<string> {
    const connectionData = {
      type: 'connect',
      version: PROTOCOL_VERSION,
      timestamp: Date.now(),
      // In production, this would include device-specific identifiers
      // and ephemeral keys for secure pairing
    };

    // Encode as JSON for QR code
    const json = JSON.stringify(connectionData);

    // Create deep link URL
    const url = `midnight://connect?data=${encodeURIComponent(json)}`;

    logger.debug('Generated connection QR');
    return url;
  }

  /**
   * Scan QR code with DApp request
   * This is a placeholder - actual implementation would use camera
   */
  async scanQRCode(): Promise<DAppRequest> {
    // Placeholder: In production, this would use react-native-vision-camera
    // to scan a QR code and parse the DApp request

    throw new Error('QR scanning not implemented - use QRScanner module');
  }

  /**
   * Check if connected to a DApp
   */
  isConnected(): boolean {
    return this.connectedDApp !== null;
  }

  /**
   * Get connected DApp info
   */
  getConnectedDApp(): { name: string; url: string } | null {
    return this.connectedDApp;
  }

  /**
   * Disconnect from current DApp
   */
  disconnect(): void {
    if (this.connectedDApp) {
      logger.info(`Disconnecting from DApp: ${this.connectedDApp.name}`);
      this.connectedDApp = null;
      this.emit('disconnected');
    }
  }

  /**
   * Set request timeout
   */
  setRequestTimeout(timeout: number): void {
    this.requestTimeout = timeout;
  }

  /**
   * Parse deep link URL
   */
  private parseDeepLink(url: string): { type: string; data: unknown } | null {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    // Check scheme
    if (!SCHEMES.includes(parsed.protocol.replace(':', '') as any)) {
      return null;
    }

    // Parse path
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const type = pathParts[0];

    // Parse query parameters
    const params = new URLSearchParams(parsed.search);
    const dataStr = params.get('data');

    let data: unknown;
    if (dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch {
        return null;
      }
    }

    return { type, data };
  }

  /**
   * Handle DApp request
   */
  private async handleRequest(request: DAppRequest): Promise<void> {
    // Validate request
    if (!this.isValidRequest(request)) {
      throw new Error('Invalid DApp request');
    }

    logger.info(`Received DApp request: ${request.method} (${request.id})`);

    this.emit('request', request);

    // Create promise for response
    const promise = new Promise<DAppResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.clearPendingRequest(request.id);
        reject(new Error('Request timeout'));
      }, this.requestTimeout);

      this.pendingRequests.set(request.id, {
        request,
        timeout,
        resolve,
        reject,
      });
    });

    // Return promise - caller will await user approval/rejection
    // Note: This is handled by the app UI calling approveRequest/rejectRequest
    return promise;
  }

  /**
   * Handle connection request
   */
  private async handleConnect(data: unknown): Promise<void> {
    const info = data as { name?: string; url?: string };

    if (!info.name || !info.url) {
      throw new Error('Invalid connection data');
    }

    // Validate URL
    const validation = validateUrl(info.url);
    if (!validation.valid) {
      throw new Error(`Invalid DApp URL: ${validation.error}`);
    }

    this.connectedDApp = {
      name: info.name,
      url: info.url,
    };

    logger.info(`Connected to DApp: ${info.name} (${info.url})`);
    this.emit('connected', this.connectedDApp);
  }

  /**
   * Handle disconnect
   */
  private async handleDisconnect(): Promise<void> {
    this.disconnect();
  }

  /**
   * Send response to DApp callback URL
   */
  private async sendResponse(callback: string, response: DAppResponse): Promise<void> {
    // Validate callback URL
    const validation = validateUrl(callback);
    if (!validation.valid) {
      throw new Error(`Invalid callback URL: ${validation.error}`);
    }

    try {
      // In production, this would make an HTTP POST to the callback
      // or use a universal link to return to the DApp

      logger.debug(`Sending response to: ${callback}`);

      // For mobile deep links, we open the callback URL with response data
      const callbackUrl = new URL(callback);
      callbackUrl.searchParams.set('response', JSON.stringify(response));

      // Emit event for app to handle URL opening
      this.emit('openUrl', callbackUrl.toString());
    } catch (error) {
      logger.error('Failed to send response', error);
    }
  }

  /**
   * Validate DApp request
   */
  private isValidRequest(request: DAppRequest): boolean {
    if (!request.id || !request.method || !request.callback) {
      return false;
    }

    if (!this.isValidMethod(request.method)) {
      return false;
    }

    if (typeof request.timestamp !== 'number' || Date.now() - request.timestamp > 300000) {
      // Request is too old (5 minutes)
      return false;
    }

    return true;
  }

  /**
   * Check if method is valid
   */
  private isValidMethod(method: string): method is DAppRequestMethod {
    const validMethods: DAppRequestMethod[] = [
      'sign_transaction',
      'sign_message',
      'get_address',
      'get_balance',
      'send_transaction',
      'deploy_contract',
      'call_contract',
    ];
    return validMethods.includes(method as DAppRequestMethod);
  }

  /**
   * Clear pending request
   */
  private clearPendingRequest(id: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Setup deep link listener
   * This is platform-specific implementation
   */
  private setupDeepLinkListener(): void {
    // On React Native, this would use Linking API
    // For now, this is a placeholder

    logger.debug('Deep link listener setup (placeholder)');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Clear all pending requests
    for (const [id] of this.pendingRequests) {
      this.clearPendingRequest(id);
    }

    this.disconnect();
    this.removeAllListeners();
  }
}

/**
 * Create a DApp connector instance
 */
export function createDAppConnector(): DAppConnector {
  return new DAppConnector();
}
