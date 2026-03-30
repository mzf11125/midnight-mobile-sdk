// ============================================================================
// Proof Provider - HTTP Client to Proof Server
// ============================================================================

import { ProofProviderConfig, MidnightErrorCode, MidnightError } from '../types';
import { createLogger } from '../utils/Logger';
import { retryAsync, withTimeout } from '../utils/Errors';

const logger = createLogger('ProofProvider');

/**
 * Proof request data
 */
export interface ProofRequest {
  /** Contract address */
  contractAddress?: string;
  /** Public inputs */
  publicInputs: Uint8Array;
  /** Private inputs (optional, for client-side proofs) */
  privateInputs?: Uint8Array;
  /** Contract method being called */
  method?: string;
}

/**
 * Proof response
 */
export interface ProofResponse {
  /** Generated proof */
  proof: Uint8Array;
  /** Public outputs */
  outputs: Uint8Array;
  /** Proof ID for verification */
  proofId: string;
  /** Time taken to generate (ms) */
  duration: number;
}

/**
 * HTTP-based proof provider
 * Connects to remote proof generation server
 */
export class ProofProvider {
  private config: ProofProviderConfig;
  private fetch: typeof fetch;

  constructor(config: ProofProviderConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default
      ...config,
    };

    // Use native fetch or polyfill
    this.fetch = typeof fetch !== 'undefined' ? fetch : this.nodeFetch;
  }

  /**
   * Generate a zero-knowledge proof
   */
  async generateProof(request: ProofRequest): Promise<ProofResponse> {
    logger.debug('Generating proof', {
      contractAddress: request.contractAddress,
      method: request.method,
    });

    try {
      return await retryAsync(
        () => this.generateProofInternal(request),
        {
          maxAttempts: 2,
          baseDelay: 2000,
          onRetry: (attempt, error) => {
            logger.warn(`Proof generation attempt ${attempt} failed, retrying...`, error);
          },
        }
      );
    } catch (error) {
      logger.error('Proof generation failed', error);
      throw new MidnightError(
        MidnightErrorCode.PROOF_GENERATION_FAILED,
        `Failed to generate proof: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Generate proof for contract deployment
   */
  async generateDeploymentProof(
    contractSource: string,
    constructorArgs: Uint8Array
  ): Promise<ProofResponse> {
    return this.generateProof({
      publicInputs: constructorArgs,
      method: 'deploy',
    });
  }

  /**
   * Generate proof for contract call
   */
  async generateCallProof(
    contractAddress: string,
    method: string,
    args: Uint8Array
  ): Promise<ProofResponse> {
    return this.generateProof({
      contractAddress,
      publicInputs: args,
      method,
    });
  }

  /**
   * Verify a proof
   */
  async verifyProof(proofId: string, proof: Uint8Array): Promise<boolean> {
    logger.debug(`Verifying proof: ${proofId}`);

    try {
      const url = new URL('/verify', this.config.endpoint);
      const response = await this.fetchWithAuth(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proofId,
          proof: Array.from(proof),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result.valid === true;
    } catch (error) {
      logger.error('Proof verification failed', error);
      return false;
    }
  }

  /**
   * Check if proof server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL('/health', this.config.endpoint);
      const response = await this.fetch(url.toString(), {
        method: 'GET',
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get proof server status
   */
  async getStatus(): Promise<{
    healthy: boolean;
    queueSize?: number;
    averageProofTime?: number;
  }> {
    try {
      const url = new URL('/status', this.config.endpoint);
      const response = await this.fetch(url.toString(), {
        method: 'GET',
      });

      if (!response.ok) {
        return { healthy: false };
      }

      const data = await response.json();
      return {
        healthy: true,
        queueSize: data.queueSize,
        averageProofTime: data.averageProofTime,
      };
    } catch (error) {
      logger.error('Failed to get proof server status', error);
      return { healthy: false };
    }
  }

  /**
   * Internal proof generation
   */
  private async generateProofInternal(request: ProofRequest): Promise<ProofResponse> {
    const url = new URL('/prove', this.config.endpoint);

    const body = {
      contractAddress: request.contractAddress,
      publicInputs: Array.from(request.publicInputs),
      privateInputs: request.privateInputs ? Array.from(request.privateInputs) : undefined,
      method: request.method,
    };

    const startTime = Date.now();

    const response = await withTimeout(
      this.fetchWithAuth(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      this.config.timeout!,
      'Proof generation timed out'
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    return {
      proof: new Uint8Array(data.proof),
      outputs: new Uint8Array(data.outputs || []),
      proofId: data.proofId,
      duration,
    };
  }

  /**
   * Fetch with authentication
   */
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if configured
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return this.fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Node.js fetch polyfill
   */
  private async nodeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Try to import node-fetch
    try {
      const nodeFetch = await import('node-fetch');
      return nodeFetch.default(url, options);
    } catch {
      throw new Error('fetch is not available. Please provide a fetch implementation or polyfill.');
    }
  }
}

/**
 * Create a proof provider instance
 */
export function createProofProvider(config: ProofProviderConfig): ProofProvider {
  return new ProofProvider(config);
}
