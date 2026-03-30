import '@testing-library/jest-native/extend-expect';

// Mock react-native modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock expo modules
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([])),
}));

jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(),
  close: jest.fn(),
  execute: jest.fn(),
  executeAsync: jest.fn(),
  delete: jest.fn(),
}));

// Mock midnight packages that may not work in Node environment
jest.mock('@midnight-ntwrk/midnight-js-contracts', () => ({
  deploy: jest.fn(),
  call: jest.fn(),
}));

jest.mock('@midnight-ntwrk/http-client-proof-provider', () => ({
  createHttpClientProofProvider: jest.fn(),
}));

// Silence console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
