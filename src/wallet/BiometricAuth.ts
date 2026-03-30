// ============================================================================
// Biometric Authentication - FaceID/Fingerprint Wrapper
// ============================================================================

import { BiometricAuthOptions, MidnightErrorCode, MidnightError } from '../types';
import { createLogger } from '../utils/Logger';
import { validateBiometricAvailability } from '../utils/Validation';

const logger = createLogger('BiometricAuth');

/**
 * Biometric authentication type
 */
export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  error?: string;
  biometricType?: BiometricType;
}

/**
 * Biometric capability info
 */
export interface BiometricCapability {
  available: boolean;
  enrolled: boolean;
  biometricType: BiometricType;
  supportedTypes: BiometricType[];
}

/**
 * Wrapper for expo-local-authentication
 * Provides biometric authentication using FaceID, TouchID, or fingerprint
 */
export class BiometricAuth {
  private localAuth: any = null;
  private available: boolean = false;
  private capability: BiometricCapability = {
    available: false,
    enrolled: false,
    biometricType: 'none',
    supportedTypes: [],
  };

  constructor() {
    // Initialization happens in initialize()
  }

  /**
   * Initialize biometric authentication
   */
  async initialize(): Promise<void> {
    try {
      this.localAuth = await this.importLocalAuth();

      if (!this.localAuth) {
        logger.warn('expo-local-authentication not available');
        this.available = false;
        return;
      }

      await this.checkCapability();
      this.available = true;
      logger.debug('Biometric auth initialized', this.capability);
    } catch (error) {
      logger.warn('Biometric auth initialization failed', error);
      this.available = false;
    }
  }

  /**
   * Check if biometric authentication is available
   */
  isAvailable(): boolean {
    return this.available && this.capability.available;
  }

  /**
   * Check if biometric data is enrolled
   */
  isEnrolled(): boolean {
    return this.capability.enrolled;
  }

  /**
   * Get capability info
   */
  getCapability(): BiometricCapability {
    return { ...this.capability };
  }

  /**
   * Authenticate with biometrics
   */
  async authenticate(options: BiometricAuthOptions = {}): Promise<AuthResult> {
    if (!this.available) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device',
      };
    }

    if (!this.capability.enrolled) {
      return {
        success: false,
        error: 'No biometric data enrolled. Please set up FaceID, TouchID, or fingerprint.',
      };
    }

    const {
      prompt = 'Authenticate to continue',
      cancelLabel = 'Cancel',
      fallbackToDevicePasscode = true,
    } = options;

    try {
      // Disable fallback if requested
      if (!fallbackToDevicePasscode) {
        // Note: expo-local-authentication doesn't directly support this
        // This would require native module customization
      }

      const result = await this.localAuth.authenticateAsync({
        promptMessage: prompt,
        cancelLabel,
        fallbackLabel: fallbackToDevicePasscode ? 'Use Passcode' : undefined,
      });

      if (result.success) {
        logger.debug('Biometric authentication succeeded');
        return {
          success: true,
          biometricType: this.capability.biometricType,
        };
      }

      // Determine error type
      let error: string;

      if (result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'not_enrolled') {
        error = 'Authentication was cancelled';
      } else if (result.error === 'lockout') {
        error = 'Too many attempts. Please try again later.';
      } else if (result.error === 'passcode_not_set') {
        error = 'Please set up a device passcode first.';
      } else if (result.error === 'app_cancel') {
        error = 'Authentication was dismissed';
      } else if (result.error === 'not_available') {
        error = 'Biometric authentication is not available';
      } else {
        error = result.error || 'Authentication failed';
      }

      logger.debug(`Biometric authentication failed: ${error}`);

      return {
        success: false,
        error,
      };
    } catch (error) {
      logger.error('Biometric authentication error', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication error',
      };
    }
  }

  /**
   * Authenticate with specific error codes
   */
  async authenticateOrThrow(options: BiometricAuthOptions = {}): Promise<void> {
    const result = await this.authenticate(options);

    if (!result.success) {
      // Map common error strings to error codes
      let code = MidnightErrorCode.BIOMETRIC_FAILED;

      if (result.error?.includes('cancel')) {
        code = MidnightErrorCode.BIOMETRIC_DISMISSED;
      } else if (result.error?.includes('not available') || result.error?.includes('not_available')) {
        code = MidnightErrorCode.BIOMETRIC_NOT_AVAILABLE;
      }

      throw new MidnightError(code, result.error ?? 'Biometric authentication failed');
    }
  }

  /**
   * Check and update capability
   */
  async checkCapability(): Promise<BiometricCapability> {
    if (!this.localAuth) {
      this.capability = {
        available: false,
        enrolled: false,
        biometricType: 'none',
        supportedTypes: [],
      };
      return this.capability;
    }

    try {
      const [hardwareAsync, enrolledAsync, typesAsync] = await Promise.all([
        this.localAuth.hasHardwareAsync(),
        this.localAuth.isEnrolledAsync(),
        this.localAuth.supportedAuthenticationTypesAsync(),
      ]);

      // Determine biometric type
      let biometricType: BiometricType = 'none';

      if (hardwareAsync && enrolledAsync) {
        if (typesAsync.includes(1)) {
          biometricType = 'face'; // FACE_ID
        } else if (typesAsync.includes(0)) {
          biometricType = 'fingerprint'; // FINGERPRINT
        } else if (typesAsync.includes(2)) {
          biometricType = 'iris'; // IRIS
        }
      }

      const supportedTypes: BiometricType[] = [];
      for (const type of typesAsync) {
        if (type === 0) supportedTypes.push('fingerprint');
        else if (type === 1) supportedTypes.push('face');
        else if (type === 2) supportedTypes.push('iris');
      }

      this.capability = {
        available: hardwareAsync ?? false,
        enrolled: enrolledAsync ?? false,
        biometricType,
        supportedTypes,
      };

      logger.debug('Biometric capability checked', this.capability);
    } catch (error) {
      logger.warn('Failed to check biometric capability', error);
      this.capability = {
        available: false,
        enrolled: false,
        biometricType: 'none',
        supportedTypes: [],
      };
    }

    return this.capability;
  }

  /**
   * Get human-readable biometric type name
   */
  getBiometricTypeName(type: BiometricType): string {
    const names: Record<BiometricType, string> = {
      face: 'Face ID',
      fingerprint: 'Touch ID / Fingerprint',
      iris: 'Iris Scanner',
      none: 'None',
    };
    return names[type] ?? 'None';
  }

  /**
   * Get prompt message for current biometric type
   */
  getPromptMessage(baseMessage: string = 'Authenticate to continue'): string {
    const typeName = this.getBiometricTypeName(this.capability.biometricType);
    if (this.capability.biometricType === 'none') {
      return baseMessage;
    }
    return `${baseMessage} using ${typeName}`;
  }

  /**
   * Import expo-local-authentication (lazy load)
   */
  private async importLocalAuth(): Promise<any> {
    try {
      const module = await import('expo-local-authentication');
      return module.default;
    } catch {
      return null;
    }
  }
}

/**
 * Create a biometric auth instance
 */
export async function createBiometricAuth(): Promise<BiometricAuth> {
  const auth = new BiometricAuth();
  await auth.initialize();
  return auth;
}

/**
 * Quick check if biometric auth is available and enrolled
 */
export async function canUseBiometric(): Promise<boolean> {
  const auth = await createBiometricAuth();
  return auth.isAvailable() && auth.isEnrolled();
}

/**
 * Prompt user for biometric authentication
 */
export async function promptBiometric(options?: BiometricAuthOptions): Promise<AuthResult> {
  const auth = await createBiometricAuth();
  return auth.authenticate(options);
}
