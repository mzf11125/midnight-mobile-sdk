// ============================================================================
// Contract Client - Contract Deploy/Call with Proof Delegation
// ============================================================================

import {
  IContractClient,
  ContractDeployOptions,
  ContractDeployResult,
  ContractCallOptions,
  ContractCallResult,
  ContractQueryResult,
  MidnightErrorCode,
  MidnightError,
  NetworkType,
} from '../types';
import { createLogger } from '../utils/Logger';
import { ProofProvider } from './ProofProvider';
import { WalletInfo } from '../wallet/MidnightWallet';
import { DEFAULT_FEES, TIMEOUTS } from '../core/constants';
import { validateContractSource } from '../utils/Validation';

const logger = createLogger('ContractClient');

/**
 * Contract deployment status
 */
export type DeploymentStatus =
  | 'pending'
  | 'proving'
  | 'deploying'
  | 'confirmed'
  | 'failed';

/**
 * Contract client configuration
 */
export interface ContractClientConfig {
  network: NetworkType;
  proofProvider: ProofProvider;
  defaultTimeout?: number;
  onDeploymentStatusChange?: (address: string, status: DeploymentStatus) => void;
}

/**
 * Contract client implementation
 * Wraps midnight-js-contracts with proof delegation
 */
export class ContractClient implements IContractClient {
  private config: ContractClientConfig;
  private wallet: WalletInfo | null = null;

  constructor(config: ContractClientConfig) {
    this.config = {
      defaultTimeout: TIMEOUTS.contractDeploy,
      ...config,
    };
  }

  /**
   * Set the wallet for signing transactions
   */
  setWallet(wallet: WalletInfo): void {
    this.wallet = wallet;
  }

  /**
   * Deploy a new contract
   */
  async deploy(options: ContractDeployOptions): Promise<ContractDeployResult> {
    if (!this.wallet) {
      throw new MidnightError(MidnightErrorCode.WALLET_LOCKED, 'Wallet not set');
    }

    logger.info('Deploying contract');

    // Validate contract source
    const validation = validateContractSource(options.source);
    if (!validation.valid) {
      throw new MidnightError(
        MidnightErrorCode.INVALID_CONTRACT_SOURCE,
        validation.error ?? 'Invalid contract source'
      );
    }

    const maxFee = options.maxFee ?? DEFAULT_FEES.contractDeployFee;
    const timeout = options.timeout ?? this.config.defaultTimeout!;

    try {
      // Notify status
      this.notifyStatusChange('pending', 'pending');

      // Generate deployment proof
      this.notifyStatusChange('proving', 'proving');
      const proofResult = await this.config.proofProvider.generateDeploymentProof(
        options.source,
        options.args ?? new Uint8Array()
      );

      // Build deployment transaction
      this.notifyStatusChange('deploying', 'deploying');
      const tx = await this.buildDeploymentTransaction(options, proofResult.proof, maxFee);

      // Sign transaction (wallet handles biometric gate)
      const signature = await this.signTransaction(tx);

      // Submit to network
      const result = await this.submitTransaction(tx, signature);

      this.notifyStatusChange('confirmed', 'confirmed');
      logger.info(`Contract deployed: ${result.address}`);

      return result;
    } catch (error) {
      this.notifyStatusChange('failed', 'failed');
      logger.error('Contract deployment failed', error);

      if (error instanceof MidnightError) {
        throw error;
      }

      throw new MidnightError(
        MidnightErrorCode.CONTRACT_DEPLOY_FAILED,
        `Contract deployment failed: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Call a contract method
   */
  async call(options: ContractCallOptions): Promise<ContractCallResult> {
    if (!this.wallet) {
      throw new MidnightError(MidnightErrorCode.WALLET_LOCKED, 'Wallet not set');
    }

    logger.info(`Calling contract ${options.address}.${options.method}`);

    const maxFee = options.maxFee ?? DEFAULT_FEES.contractCallFee;
    const timeout = options.timeout ?? TIMEOUTS.contractCall;

    try {
      // Generate call proof
      const proofResult = await this.config.proofProvider.generateCallProof(
        options.address,
        options.method,
        options.args
      );

      // Build call transaction
      const tx = await this.buildCallTransaction(options, proofResult.proof, maxFee);

      // Sign transaction
      const signature = await this.signTransaction(tx);

      // Submit to network
      const result = await this.submitTransaction(tx, signature);

      logger.info(`Contract call successful: ${result.txHash}`);
      return result;
    } catch (error) {
      logger.error('Contract call failed', error);

      if (error instanceof MidnightError) {
        throw error;
      }

      throw new MidnightError(
        MidnightErrorCode.CONTRACT_CALL_FAILED,
        `Contract call failed: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Query a contract (read-only)
   * This doesn't require proof or signing
   */
  async query(
    address: string,
    method: string,
    args: Uint8Array
  ): Promise<ContractQueryResult> {
    logger.debug(`Querying contract ${address}.${method}`);

    try {
      // Query through indexer (no proof needed)
      const result = await this.queryViaIndexer(address, method, args);

      return {
        returnData: result,
        success: true,
      };
    } catch (error) {
      logger.error('Contract query failed', error);

      return {
        returnData: new Uint8Array(),
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  /**
   * Get contract state
   */
  async getState(address: string): Promise<Record<string, unknown>> {
    logger.debug(`Getting contract state: ${address}`);

    try {
      // Query through indexer
      const state = await this.queryStateViaIndexer(address);
      return state;
    } catch (error) {
      logger.error('Failed to get contract state', error);
      return {};
    }
  }

  /**
   * Get contract info
   */
  async getContractInfo(address: string): Promise<{
    address: string;
    deployer: string;
    deployedAt: number;
    transactionCount: number;
  } | null> {
    logger.debug(`Getting contract info: ${address}`);

    try {
      // Query through indexer
      const info = await this.queryContractInfo(address);
      return info;
    } catch (error) {
      logger.error('Failed to get contract info', error);
      return null;
    }
  }

  /**
   * Build deployment transaction
   */
  private async buildDeploymentTransaction(
    options: ContractDeployOptions,
    proof: Uint8Array,
    maxFee: bigint
  ): Promise<Uint8Array> {
    // Placeholder: In production, this would use the actual Compact contract format
    // and midnight-js-contracts library

    const tx = {
      type: 'contract_deploy',
      source: options.source,
      args: Array.from(options.args ?? []),
      proof: Array.from(proof),
      maxFee: maxFee.toString(),
      nonce: Date.now(),
    };

    return new TextEncoder().encode(JSON.stringify(tx));
  }

  /**
   * Build call transaction
   */
  private async buildCallTransaction(
    options: ContractCallOptions,
    proof: Uint8Array,
    maxFee: bigint
  ): Promise<Uint8Array> {
    // Placeholder: In production, this would use the actual Compact contract format

    const tx = {
      type: 'contract_call',
      address: options.address,
      method: options.method,
      args: Array.from(options.args),
      proof: Array.from(proof),
      value: options.value?.toString() ?? '0',
      maxFee: maxFee.toString(),
      nonce: Date.now(),
    };

    return new TextEncoder().encode(JSON.stringify(tx));
  }

  /**
   * Sign transaction using wallet
   */
  private async signTransaction(tx: Uint8Array): Promise<Uint8Array> {
    // This would call the wallet's signTransaction method
    // For now, return a placeholder signature
    logger.debug('Signing transaction');

    // Placeholder signature
    const signature = new Uint8Array(64);
    crypto.getRandomValues(signature);

    return signature;
  }

  /**
   * Submit transaction to network
   */
  private async submitTransaction(
    tx: Uint8Array,
    signature: Uint8Array
  ): Promise<{ txHash: string; blockNumber: number; address?: string }> {
    // Placeholder: In production, this would submit to the ledger
    logger.debug('Submitting transaction to network');

    // Generate mock transaction hash
    const hash = Array.from(new Uint8Array(32))
      .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
      .join('');

    return {
      txHash: hash,
      blockNumber: 0, // Pending
    };
  }

  /**
   * Query contract via indexer (read-only)
   */
  private async queryViaIndexer(
    address: string,
    method: string,
    args: Uint8Array
  ): Promise<Uint8Array> {
    // Placeholder: In production, this would query the indexer
    return new Uint8Array();
  }

  /**
   * Query state via indexer
   */
  private async queryStateViaIndexer(address: string): Promise<Record<string, unknown>> {
    // Placeholder: In production, this would query the indexer
    return {};
  }

  /**
   * Query contract info via indexer
   */
  private async queryContractInfo(address: string): Promise<{
    address: string;
    deployer: string;
    deployedAt: number;
    transactionCount: number;
  } | null> {
    // Placeholder: In production, this would query the indexer
    return null;
  }

  /**
   * Notify status change
   */
  private notifyStatusChange(status: DeploymentStatus, address: string): void {
    this.config.onDeploymentStatusChange?.(address, status);
  }
}

/**
 * Create a contract client instance
 */
export function createContractClient(config: ContractClientConfig): ContractClient {
  return new ContractClient(config);
}
