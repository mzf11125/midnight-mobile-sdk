// ============================================================================
// Midnight Protocol - DApp Communication Protocol
// ============================================================================

import { createLogger } from '../utils/Logger';
import {
  DAppRequest,
  DAppResponse,
  DAppRequestMethod,
  MidnightErrorCode,
  MidnightError,
} from '../types';

const logger = createLogger('MidnightProtocol');

/** Protocol version */
export const PROTOCOL_VERSION = '1.0.0';

/** Request timeout (ms) */
const DEFAULT_TIMEOUT = 300000; // 5 minutes

/**
 * Protocol message types
 */
export type ProtocolMessageType =
  | 'handshake'
  | 'request'
  | 'response'
  | 'error'
  | 'ping'
  | 'pong'
  | 'disconnect';

/**
 * Protocol message base
 */
export interface ProtocolMessage {
  version: string;
  type: ProtocolMessageType;
  id: string;
  timestamp: number;
}

/**
 * Handshake message
 */
export interface HandshakeMessage extends ProtocolMessage {
  type: 'handshake';
  data: {
    appName: string;
    appVersion: string;
    network: string;
    capabilities: string[];
  };
}

/**
 * Request message
 */
export interface RequestMessage extends ProtocolMessage {
  type: 'request';
  data: {
    method: DAppRequestMethod;
    params: Record<string, unknown>;
    callback: string;
  };
}

/**
 * Response message
 */
export interface ResponseMessage extends ProtocolMessage {
  type: 'response';
  data: {
    approved: boolean;
    result?: unknown;
    error?: string;
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends ProtocolMessage {
  type: 'error';
  data: {
    code: number;
    message: string;
  };
}

/**
 * Union of all protocol messages
 */
export type AnyProtocolMessage =
  | HandshakeMessage
  | RequestMessage
  | ResponseMessage
  | ErrorMessage
  | { type: 'ping' } & ProtocolMessage
  | { type: 'pong' } & ProtocolMessage
  | { type: 'disconnect' } & ProtocolMessage;

/**
 * Message handler callback
 */
export type MessageHandler = (message: AnyProtocolMessage) => void;

/**
 * Midnight protocol implementation
 * Defines the communication protocol between DApps and the wallet
 */
export class MidnightProtocol {
  private handlers: Map<ProtocolMessageType, MessageHandler[]> = new Map();
  private pendingRequests: Map<string, {
    resolve: (response: DAppResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor() {
    this.setupDefaultHandlers();
  }

  /**
   * Create a handshake message
   */
  createHandshake(data: HandshakeMessage['data']): HandshakeMessage {
    return this.createMessage('handshake', data);
  }

  /**
   * Create a request message from DApp request
   */
  createRequest(request: DAppRequest): RequestMessage {
    return {
      version: PROTOCOL_VERSION,
      type: 'request',
      id: request.id,
      timestamp: request.timestamp,
      data: {
        method: request.method,
        params: request.params,
        callback: request.callback,
      },
    };
  }

  /**
   * Create a response message
   */
  createResponse(requestId: string, approved: boolean, result?: unknown, error?: string): ResponseMessage {
    return {
      version: PROTOCOL_VERSION,
      type: 'response',
      id: requestId,
      timestamp: Date.now(),
      data: {
        approved,
        result,
        error,
      },
    };
  }

  /**
   * Create an error message
   */
  createError(requestId: string, code: number, message: string): ErrorMessage {
    return {
      version: PROTOCOL_VERSION,
      type: 'error',
      id: requestId,
      timestamp: Date.now(),
      data: {
        code,
        message,
      },
    };
  }

  /**
   * Parse a protocol message
   */
  parseMessage(data: string | Uint8Array): AnyProtocolMessage | null {
    try {
      let json: string;

      if (data instanceof Uint8Array) {
        json = new TextDecoder().decode(data);
      } else {
        json = data;
      }

      const message = JSON.parse(json);

      // Validate basic structure
      if (!message.type || !message.id || !message.version) {
        throw new Error('Invalid message structure');
      }

      // Check protocol version
      if (message.version !== PROTOCOL_VERSION) {
        throw new Error(`Unsupported protocol version: ${message.version}`);
      }

      return message as AnyProtocolMessage;
    } catch (error) {
      logger.error('Failed to parse protocol message', error);
      return null;
    }
  }

  /**
   * Encode a protocol message
   */
  encodeMessage(message: AnyProtocolMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Handle an incoming message
   */
  async handleMessage(data: string | Uint8Array): Promise<void> {
    const message = this.parseMessage(data);

    if (!message) {
      logger.error('Failed to parse incoming message');
      return;
    }

    logger.debug(`Received message: ${message.type} (${message.id})`);

    // Get handlers for this message type
    const handlers = this.handlers.get(message.type);

    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error(`Handler error for ${message.type}`, error);
        }
      }
    }

    // Emit generic message event
    this.emit('message', message);
  }

  /**
   * Register a message handler
   */
  on(type: ProtocolMessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }

    this.handlers.get(type)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Send a request and wait for response
   */
  async sendRequest(
    method: DAppRequestMethod,
    params: Record<string, unknown>,
    callback: string,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<DAppResponse> {
    const id = this.generateId();

    const message: RequestMessage = {
      version: PROTOCOL_VERSION,
      type: 'request',
      id,
      timestamp: Date.now(),
      data: {
        method,
        params,
        callback,
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          resolve(response);
        },
        reject,
        timeout: timeoutHandle,
      });

      // Emit message for sender to handle
      this.emit('send', message);
    });
  }

  /**
   * Respond to a request
   */
  respondTo(requestId: string, approved: boolean, result?: unknown, error?: string): void {
    const message = this.createResponse(requestId, approved, result, error);

    // Resolve pending request
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);

      const response: DAppResponse = {
        id: requestId,
        approved,
        result,
        error,
        timestamp: Date.now(),
      };

      pending.resolve(response);
    }

    // Emit message for sender to handle
    this.emit('send', message);
  }

  /**
   * Send an error response
   */
  errorTo(requestId: string, code: MidnightErrorCode, message: string): void {
    const errorMessage = this.createError(requestId, code, message);
    this.emit('send', errorMessage);
  }

  /**
   * Send ping
   */
  ping(): void {
    const message: ProtocolMessage = {
      version: PROTOCOL_VERSION,
      type: 'ping',
      id: this.generateId(),
      timestamp: Date.now(),
    };
    this.emit('send', message);
  }

  /**
   * Send pong
   */
  pong(pingId: string): void {
    const message: ProtocolMessage = {
      version: PROTOCOL_VERSION,
      type: 'pong',
      id: pingId,
      timestamp: Date.now(),
    };
    this.emit('send', message);
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    const message: ProtocolMessage = {
      version: PROTOCOL_VERSION,
      type: 'disconnect',
      id: this.generateId(),
      timestamp: Date.now(),
    };
    this.emit('send', message);
  }

  /**
   * Register default handlers
   */
  private setupDefaultHandlers(): void {
    // Handle ping with pong
    this.on('ping', (message) => {
      this.pong(message.id);
    });

    // Handle response messages
    this.on('response', (message) => {
      const responseMessage = message as ResponseMessage;
      const pending = this.pendingRequests.get(responseMessage.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(responseMessage.id);

        const response: DAppResponse = {
          id: responseMessage.id,
          approved: responseMessage.data.approved,
          result: responseMessage.data.result,
          error: responseMessage.data.error,
          timestamp: responseMessage.timestamp,
        };

        if (responseMessage.data.approved) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(responseMessage.data.error ?? 'Request rejected'));
        }
      }
    });

    // Handle error messages
    this.on('error', (message) => {
      const errorMessage = message as ErrorMessage;
      const pending = this.pendingRequests.get(errorMessage.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(errorMessage.id);
        pending.reject(new Error(errorMessage.data.message));
      }
    });
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Simple event emitter
   */
  private listeners: Map<string, ((data: unknown) => void)[]> = new Map();

  private emit(event: string, data: unknown): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          logger.error(`Listener error for ${event}`, error);
        }
      }
    }
  }

  onEvent(event: string, listener: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Protocol destroyed'));
    }
    this.pendingRequests.clear();

    // Clear all handlers
    this.handlers.clear();
    this.listeners.clear();
  }
}

/**
 * Create a Midnight protocol instance
 */
export function createMidnightProtocol(): MidnightProtocol {
  return new MidnightProtocol();
}
