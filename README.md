# @dedanzi/midnight-mobile-sdk

> React Native SDK for Midnight Network - Mobile wallet, zero-knowledge contracts, and DApp connectivity.

[![npm version](https://badge.fury.io/js/%40dedanzi%2Fmidnight-mobile-sdk.svg)](https://www.npmjs.com/package/@dedanzi/midnight-mobile-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`@dedanzi/midnight-mobile-sdk` is a comprehensive React Native library for building mobile applications on the Midnight Network. It wraps the existing `@midnight-ntwrk` packages while providing mobile-specific adapters:

- **Storage:** LevelDB → SQLite adapter for mobile persistence
- **Security:** iOS Keychain + Android Keystore for secure wallet key storage
- **Authentication:** Biometric authentication gate (FaceID/TouchID/Fingerprint) before all signing operations
- **Connectivity:** Deep Links / Universal Links replacing browser-based `window.midnight`
- **UX Features:** QR code scanner, offline transaction queue, real-time subscriptions

## Features

| Feature | iOS | Android | Description |
|---------|-----|---------|-------------|
| HD Wallet (BIP-32/44) | ✅ | ✅ | Hierarchical deterministic wallet generation |
| Biometric Auth | ✅ | ✅ | FaceID, TouchID, Fingerprint support |
| Secure Storage | ✅ | ✅ | Keychain / EncryptedSharedPreferences |
| Contract Deploy | ✅ | ✅ | With ZK proof delegation |
| Contract Calls | ✅ | ✅ | With ZK proof delegation |
| Indexer Queries | ✅ | ✅ | GraphQL + WebSocket subscriptions |
| Deep Links | ✅ | ✅ | `midnight://` protocol |
| QR Scanner | ✅ | ✅ | Payment requests, DApp connections |
| Offline Queue | ✅ | ✅ | Transaction caching for retry |

## Installation

```bash
npm install @dedanzi/midnight-mobile-sdk
# or
yarn add @dedanzi/midnight-mobile-sdk
```

### Peer Dependencies

Install the required peer dependencies:

```bash
npm install expo-local-authentication expo-secure-store react-native-quick-sqlite
# or
yarn add expo-local-authentication expo-secure-store react-native-quick-sqlite
```

## Quick Start

```typescript
import { initMidnightSDK } from '@dedanzi/midnight-mobile-sdk';

// Initialize the SDK for testnet
const sdk = await initMidnightSDK('testnet');

// Create a new wallet (prompts for biometric)
const walletInfo = await sdk.createWallet();
console.log('Wallet address:', walletInfo.address);

// Get wallet balance
const balance = await sdk.getBalance();
console.log('Available balance:', balance.available.toString());

// Subscribe to new transactions
const unsubscribe = sdk.subscribeToTransactions((tx) => {
  console.log('New transaction:', tx.hash, 'Amount:', tx.amount);
});
```

## Wallet Management

### Create a New Wallet

```typescript
import { createMidnightClient } from '@dedanzi/midnight-mobile-sdk';

const sdk = await createMidnightClient({
  network: 'testnet',
  requireBiometrics: true,
  autoLockTimeout: 300000, // 5 minutes
});

// Create wallet with BIP-39 mnemonic
const wallet = await sdk.createWallet();
// { address: 'tmid1...', publicKey: '...', network: 'testnet' }
```

### Import Existing Wallet

```typescript
// Import from 12 or 24 word mnemonic
const wallet = await sdk.importWallet(
  'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid'
);
```

### Sign Transactions (with Biometric Gate)

```typescript
// Automatically prompts for biometric authentication
const signature = await (await sdk.getWallet())?.signTransaction(transactionData);

// Sign a message
const messageSig = await (await sdk.getWallet())?.signMessage(
  new TextEncoder().encode('Hello Midnight!')
);
```

### Wallet Lock/Unlock

```typescript
// Lock wallet (requires re-authentication)
await sdk.lockWallet();

// Unlock with biometric
const unlocked = await sdk.unlockWallet(true);
```

## Contract Interaction

### Deploy a Contract

```typescript
const result = await sdk.deployContract({
  source: compactContractSource,
  args: encodedConstructorArgs,
  maxFee: 5000000n,
});

console.log('Contract deployed:', result.address);
```

### Call a Contract Method

```typescript
const result = await sdk.callContract({
  address: 'tmid1...',
  method: 'transfer',
  args: encodedArgs,
  value: 1000000n,
});

console.log('Transaction hash:', result.txHash);
```

### Query Contract (Read-Only)

```typescript
const result = await sdk.queryContract(
  contractAddress,
  'getBalance',
  queryArgs
);
```

## Indexer & Subscriptions

### Query Transactions

```typescript
import { createIndexerClient } from '@dedanzi/midnight-mobile-sdk';

const indexer = await createIndexerClient({
  indexerUrl: 'https://indexer.testnet.midnight.network/api/v1/graphql',
  indexerWsUrl: 'wss://indexer.testnet.midnight.network/api/v1/graphql',
});

// Get transaction history
const transactions = await indexer.getTransactions(walletAddress, {
  limit: 50,
  type: 'transfer',
});
```

### Subscribe to Events

```typescript
// Subscribe to new transactions
const unsubscribe = indexer.subscribe(
  { address: walletAddress },
  (event) => {
    if (event.type === 'new_tx') {
      const tx = event.data[0];
      console.log('Received:', tx.amount);
    }
  }
);

// Later: unsubscribe();
```

### Custom GraphQL Queries

```typescript
const result = await indexer.query(`
  query GetContractState($address: String!) {
    contract(address: $address) {
      state
      transactionCount
    }
  }
`, { address: contractAddress });
```

## DApp Connectivity

### Handle Deep Links

```typescript
import { createDeepLinkManager } from '@dedanzi/midnight-mobile-sdk';

const deepLinkManager = createDeepLinkManager();

// Process incoming deep link
await deepLinkManager.processDeepLink('midnight://payment?address=...&amount=...');

// Listen for deep link events
deepLinkManager.on('payment_request', (event) => {
  console.log('Payment requested:', event.data);
});
```

### QR Code Scanning

```typescript
import { QRScanner, scanQRCode } from '@dedanzi/midnight-mobile-sdk';

// Quick scan
const result = await scanQRCode();
console.log('Scanned:', result.data);

// Or use the scanner directly
const scanner = new QRScanner({ useFrontCamera: false });
await scanner.startScanning((result) => {
  const parsed = QRScanner.parseMidnightQR(result.data);
  if (parsed?.type === 'payment_request') {
    console.log('Payment:', parsed.data);
  }
});
```

### Generate Payment QR Codes

```typescript
// Generate a payment request QR
const qrUrl = QRScanner.generatePaymentQR(
  'tmid1...',  // address
  1000000n,    // amount (in dust)
  'testnet'
);
```

## Network Configuration

### Supported Networks

```typescript
import { setNetwork, NetworkConfig } from '@dedanzi/midnight-mobile-sdk';

// Switch to mainnet
await sdk.setNetwork('mainnet');

// Or use NetworkConfig directly
NetworkConfig.getInstance().setCurrentNetwork('preprod');
```

### Custom Endpoints

```typescript
const sdk = await createMidnightClient({
  network: 'testnet',
  customEndpoints: {
    indexerUrl: 'https://custom-indexer.example.com/graphql',
    proofProviderUrl: 'https://custom-proof.example.com',
  },
});
```

## Storage & Offline Support

### Transaction Cache

The SDK automatically caches failed transactions for retry:

```typescript
import { createTransactionCache } from '@dedanzi/midnight-mobile-sdk';

const cache = await createTransactionCache(storage);

// Get pending transactions
const pending = await cache.getPending('testnet');

// Retry with custom sender
await cache.retryPending('testnet', async (cachedTx) => {
  return await submitToNetwork(cachedTx.transaction);
});
```

### SQLite Storage

```typescript
import { createSQLiteStorage } from '@dedanzi/midnight-mobile-sdk';

const storage = await createSQLiteStorage('my_app_db');

// LevelDB-compatible API
await storage.put('key', new Uint8Array([1, 2, 3]));
const value = await storage.get('key');
```

## Error Handling

```typescript
import {
  MidnightError,
  MidnightErrorCode,
  getUserMessage,
  isRetryable,
} from '@dedanzi/midnight-mobile-sdk';

try {
  await sdk.deployContract(options);
} catch (error) {
  if (error instanceof MidnightError) {
    console.error('Error code:', error.code);
    console.error('User message:', getUserMessage(error));

    if (isRetryable(error)) {
      // Retry the operation
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `WALLET_NOT_FOUND` | No wallet exists. Create or import one first. |
| `WALLET_LOCKED` | Wallet is locked. Authenticate to continue. |
| `WALLET_ALREADY_EXISTS` | A wallet already exists. Wipe it first. |
| `INVALID_MNEMONIC` | Invalid recovery phrase. Check and try again. |
| `KEY_DERIVATION_FAILED` | Failed to derive wallet keys. |
| `BIOMETRIC_NOT_AVAILABLE` | Biometric auth not available on this device. |
| `BIOMETRIC_FAILED` | Biometric authentication failed. |
| `BIOMETRIC_DISMISSED` | User cancelled biometric prompt. |
| `INSUFFICIENT_BALANCE` | Not enough funds for this transaction. |
| `TRANSACTION_FAILED` | Transaction execution failed. |
| `TRANSACTION_TIMEOUT` | Transaction timed out. Check status later. |
| `CONTRACT_DEPLOY_FAILED` | Contract deployment failed. |
| `CONTRACT_CALL_FAILED` | Contract call failed. |
| `PROOF_GENERATION_FAILED` | ZK proof generation failed. |
| `INVALID_CONTRACT_SOURCE` | Invalid contract source code. |

## Platform Setup

### iOS

1. **Add to Podfile:**
```ruby
pod 'MidnightMobileSDK', :path => '../node_modules/@dedanzi/midnight-mobile-sdk/ios'
```

2. **Install pods:**
```bash
cd ios && pod install && cd ..
```

3. **Configure Universal Links (optional):**
   - Open Xcode → Your App Target → Signing & Capabilities
   - Add "Associated Domains"
   - Add `applinks:your-domain.com` for verified links

4. **Info.plist entries are auto-configured by the SDK**

### Android

1. **Add to `android/settings.gradle`:**
```gradle
include ':@dedanzi_midnight-mobile-sdk'
project(':@dedanzi_midnight-mobile-sdk').projectDir = new File(rootProject.projectDir, '../node_modules/@dedanzi/midnight-mobile-sdk/android')
```

2. **Add to `android/app/build.gradle`:**
```gradle
dependencies {
    implementation project(':@dedanzi_midnight-mobile-sdk')
}
```

3. **ProGuard (if enabled):**
```proguard
-keep class com.dedanzi.midnightmobilesdk.** { *; }
```

4. **Deep linking is auto-configured via AndroidManifest.xml**

## API Reference

### MidnightClient

The main SDK client.

```typescript
class MidnightClient extends EventEmitter {
  // Initialization
  async initialize(): Promise<void>

  // Wallet
  async createWallet(): Promise<WalletInfo>
  async importWallet(mnemonic: string): Promise<WalletInfo>
  async hasWallet(): Promise<boolean>
  async getWalletInfo(): Promise<WalletInfo>
  async getBalance(): Promise<WalletBalance>
  async lockWallet(): Promise<void>
  async unlockWallet(biometric?: boolean): Promise<boolean>
  isWalletUnlocked(): boolean

  // Transactions
  async getTransactions(options?: IndexerQueryOptions): Promise<Transaction[]>
  subscribeToTransactions(callback: (tx: Transaction) => void): () => void

  // Contracts
  async deployContract(options: ContractDeployOptions): Promise<ContractDeployResult>
  async callContract(options: ContractCallOptions): Promise<ContractCallResult>
  async queryContract(address: string, method: string, args: Uint8Array): Promise<unknown>

  // DApp
  async handleDeepLink(url: string): Promise<void>
  async approveDAppRequest(request: DAppRequest, result?: unknown): Promise<void>
  async rejectDAppRequest(request: DAppRequest, reason?: string): Promise<void>
  async scanQRCode(): Promise<string>

  // Network
  async setNetwork(network: NetworkType): void
  getNetwork(): NetworkType
  getConnectionState(): ConnectionState

  // Cleanup
  async disconnect(): Promise<void>
}
```

## TypeScript Support

This package is built with TypeScript. All types are exported:

```typescript
import type {
  WalletInfo,
  WalletBalance,
  Transaction,
  ContractDeployOptions,
  DAppRequest,
  NetworkType,
  MidnightErrorCode,
  // ... and many more
} from '@dedanzi/midnight-mobile-sdk';
```

## License

MIT © [dedanzi](https://github.com/dedanzi)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## Support

- **Issues:** [GitHub Issues](https://github.com/dedanzi/midnight-mobile-sdk/issues)
- **Discussions:** [GitHub Discussions](https://github.com/dedanzi/midnight-mobile-sdk/discussions)
- **Midnight Network:** [midnight.network](https://midnight.network)

---

**Built with ❤️ for the Midnight Network**
