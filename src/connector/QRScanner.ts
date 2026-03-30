// ============================================================================
// QR Code Scanner
// ============================================================================

import { createLogger } from '../utils/Logger';
import { MidnightErrorCode, MidnightError } from '../types';
import { validateQRCode } from '../utils/Validation';

const logger = createLogger('QRScanner');

/**
 * QR scan result
 */
export interface QRScanResult {
  data: string;
  format: 'QR_CODE' | 'AZTEC' | 'DATA_MATRIX' | 'UNKNOWN';
  rawData?: Uint8Array;
}

/**
 * Parsed Midnight QR data
 */
export interface MidnightQRData {
  type: 'payment_request' | 'connect' | 'contract_call' | 'sign_request';
  version: number;
  data: Record<string, unknown>;
}

/**
 * QR Scanner options
 */
export interface QRScannerOptions {
  /** Enable front camera */
  useFrontCamera?: boolean;
  /** Scan interval (ms) */
  scanInterval?: number;
  /** Enable flash */
  enableFlash?: boolean;
  /** Acceptable formats */
  formats?: ('QR_CODE' | 'AZTEC' | 'DATA_MATRIX')[];
}

/**
 * QR Scanner state
 */
export type QRScannerState = 'idle' | 'scanning' | 'paused' | 'error';

/**
 * QR Scanner implementation
 * Uses react-native-vision-camera for scanning
 */
export class QRScanner {
  private state: QRScannerState = 'idle';
  private options: QRScannerOptions;
  private camera: any = null;
  private scanCallback: ((result: QRScanResult) => void) | null = null;

  constructor(options: QRScannerOptions = {}) {
    this.options = {
      useFrontCamera: false,
      scanInterval: 500,
      enableFlash: false,
      formats: ['QR_CODE'],
      ...options,
    };
  }

  /**
   * Check if camera is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const cameraModule = await this.importCamera();
      if (!cameraModule) {
        return false;
      }

      const devices = await cameraModule.getAvailableCameraDevices();
      return devices.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const cameraModule = await this.importCamera();
      if (!cameraModule) {
        return false;
      }

      const result = await cameraModule.requestCameraPermission();
      return result === 'authorized';
    } catch (error) {
      logger.error('Failed to request camera permissions', error);
      return false;
    }
  }

  /**
   * Start scanning
   */
  async startScanning(callback: (result: QRScanResult) => void): Promise<void> {
    if (this.state === 'scanning') {
      throw new Error('Already scanning');
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new MidnightError(
        MidnightErrorCode.DAPP_CONNECTION_FAILED,
        'Camera permission denied'
      );
    }

    logger.info('Starting QR scanner');
    this.state = 'scanning';
    this.scanCallback = callback;

    try {
      await this.startCamera();
    } catch (error) {
      this.state = 'error';
      logger.error('Failed to start camera', error);
      throw error;
    }
  }

  /**
   * Stop scanning
   */
  async stopScanning(): Promise<void> {
    if (this.state !== 'scanning') {
      return;
    }

    logger.info('Stopping QR scanner');
    this.state = 'idle';
    this.scanCallback = null;

    await this.stopCamera();
  }

  /**
   * Pause scanning (keep camera active)
   */
  pause(): void {
    if (this.state === 'scanning') {
      this.state = 'paused';
      logger.debug('QR scanner paused');
    }
  }

  /**
   * Resume scanning
   */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'scanning';
      logger.debug('QR scanner resumed');
    }
  }

  /**
   * Toggle flash
   */
  async toggleFlash(): Promise<boolean> {
    if (!this.camera) {
      return false;
    }

    try {
      this.options.enableFlash = !this.options.enableFlash;
      // Update camera flash mode
      await this.camera.setFlashMode(this.options.enableFlash ? 'on' : 'off');
      return this.options.enableFlash;
    } catch (error) {
      logger.error('Failed to toggle flash', error);
      return false;
    }
  }

  /**
   * Get current state
   */
  getState(): QRScannerState {
    return this.state;
  }

  /**
   * Scan from image file
   */
  async scanFromImage(imagePath: string): Promise<QRScanResult> {
    logger.debug(`Scanning QR from image: ${imagePath}`);

    try {
      // Try to import vision-camera ML Kit or similar
      // For now, this is a placeholder

      throw new Error('Image scanning not implemented');
    } catch (error) {
      logger.error('Failed to scan from image', error);
      throw new MidnightError(
        MidnightErrorCode.INVALID_QR_CODE,
        `Failed to scan QR code: ${error}`,
        error as Error
      );
    }
  }

  /**
   * Scan single frame (manual trigger)
   */
  async scanFrame(): Promise<QRScanResult | null> {
    if (this.state !== 'scanning' && this.state !== 'paused') {
      throw new Error('Scanner not active');
    }

    // Placeholder: In production, this would capture and analyze a single frame
    return null;
  }

  /**
   * Parse Midnight QR data
   */
  static parseMidnightQR(data: string): MidnightQRData | null {
    const validation = validateQRCode(data);
    if (!validation.valid) {
      return null;
    }

    // Check if it's a midnight:// URL
    if (data.startsWith('midnight://')) {
      try {
        const url = new URL(data);
        const type = url.hostname;
        const params = new URLSearchParams(url.search);
        const dataStr = params.get('data');

        return {
          type: type as MidnightQRData['type'],
          version: 1,
          data: dataStr ? JSON.parse(dataStr) : {},
        };
      } catch {
        return null;
      }
    }

    // Try JSON parse
    try {
      const parsed = JSON.parse(data);
      if (parsed.type && parsed.version) {
        return parsed as MidnightQRData;
      }
    } catch {
      // Not JSON
    }

    return null;
  }

  /**
   * Generate payment request QR
   */
  static generatePaymentQR(address: string, amount: bigint, network: string): string {
    const data = {
      type: 'payment_request' as const,
      version: 1,
      data: {
        address,
        amount: amount.toString(),
        network,
      },
    };

    return `midnight://payment?data=${encodeURIComponent(JSON.stringify(data))}`;
  }

  /**
   * Generate connect request QR
   */
  static generateConnectQR(appName: string, callbackUrl: string): string {
    const data = {
      type: 'connect' as const,
      version: 1,
      data: {
        appName,
        callbackUrl,
      },
    };

    return `midnight://connect?data=${encodeURIComponent(JSON.stringify(data))}`;
  }

  /**
   * Start camera
   */
  private async startCamera(): Promise<void> {
    try {
      const cameraModule = await this.importCamera();
      if (!cameraModule) {
        throw new Error('Camera module not available');
      }

      const devices = await cameraModule.getAvailableCameraDevices();
      const cameraDevice = devices.find((d: any) =>
        this.options.useFrontCamera ? d.position === 'front' : d.position === 'back'
      ) ?? devices[0];

      if (!cameraDevice) {
        throw new Error('No camera available');
      }

      // Create camera
      // This is a placeholder - actual implementation would use Camera component
      // from react-native-vision-camera

      logger.debug('Camera started');
    } catch (error) {
      logger.error('Failed to start camera', error);
      throw error;
    }
  }

  /**
   * Stop camera
   */
  private async stopCamera(): Promise<void> {
    if (this.camera) {
      try {
        await this.camera.stop();
        this.camera = null;
      } catch (error) {
        logger.error('Error stopping camera', error);
      }
    }
  }

  /**
   * Import camera module (lazy load)
   */
  private async importCamera(): Promise<any> {
    try {
      const camera = await import('react-native-vision-camera');
      return camera.Camera;
    } catch {
      return null;
    }
  }

  /**
   * Handle frame scan
   */
  private handleFrameScan(frame: any): void {
    if (this.state !== 'scanning' || !this.scanCallback) {
      return;
    }

    // In production, this would use ML Kit or similar to detect QR codes
    // For now, this is a placeholder
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this.stopScanning();
    this.scanCallback = null;
  }
}

/**
 * Create a QR scanner instance
 */
export function createQRScanner(options?: QRScannerOptions): QRScanner {
  return new QRScanner(options);
}

/**
 * Quick scan helper
 */
export async function scanQRCode(
  options?: QRScannerOptions
): Promise<QRScanResult> {
  const scanner = createQRScanner(options);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      scanner.destroy();
      reject(new Error('Scan timeout'));
    }, 60000); // 60 second timeout

    scanner.startScanning((result) => {
      clearTimeout(timeout);
      scanner.destroy();
      resolve(result);
    }).catch(reject);
  });
}
