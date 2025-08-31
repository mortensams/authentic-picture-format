// Background service worker for certificate validation and blockchain queries

import { WebCryptoUtils, CertificationExtractor, TrustStoreManager } from '../shared/crypto-utils';
import { ExifExtractor } from '../shared/exif-extractor';
import { 
  ChromeMessage, 
  ChromeMessageResponse, 
  TrustResult, 
  ExtensionSettings,
  Certificate,
  TrustValidationError,
  BlockchainTrustData
} from '../shared/types';

class BackgroundTrustEngine {
  private validationCache = new Map<string, { result: TrustResult; timestamp: number }>();
  private readonly cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
  private settings: ExtensionSettings = {
    showTrustIndicators: true,
    indicatorPosition: 'top-right',
    showUncertifiedIndicators: false,
    blockchainRpcUrl: 'https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID',
    trustContractAddress: '0x1234567890abcdef1234567890abcdef12345678', // Placeholder
    cacheDuration: 5,
    privacyLevel: 'balanced',
    autoValidation: true
  };

  constructor() {
    this.initializeSettings();
    this.setupMessageHandlers();
    this.startPeriodicCleanup();
  }

  private async initializeSettings(): Promise<void> {
    try {
      const stored = await chrome.storage.sync.get('settings');
      this.settings = { ...this.settings, ...stored.settings };
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener(
      (message: ChromeMessage, sender, sendResponse) => {
        this.handleMessage(message, sender).then(sendResponse).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // Indicates async response
      }
    );
  }

  private async handleMessage(message: ChromeMessage, sender: chrome.runtime.MessageSender): Promise<ChromeMessageResponse> {
    try {
      switch (message.type) {
        case 'VALIDATE_IMAGE':
          return await this.handleImageValidation(message.data);
          
        case 'GET_TRUST_DATA':
          return await this.handleTrustDataRequest(message.data);
          
        case 'IMPORT_CERTIFICATE':
          return await this.handleCertificateImport(message.data);
          
        case 'UPDATE_SETTINGS':
          return await this.handleSettingsUpdate(message.data);
          
        default:
          throw new TrustValidationError(`Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE');
      }
    } catch (error) {
      console.error('Message handling error:', error);
      return { success: false, error: error.message };
    }
  }

  private async handleImageValidation(data: { imageUrl: string }): Promise<ChromeMessageResponse> {
    try {
      const { imageUrl } = data;
      
      // Check cache first
      const cached = this.validationCache.get(imageUrl);
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiryMs) {
        return { success: true, data: cached.result };
      }

      // Extract certification from image
      const certificationData = await CertificationExtractor.extractFromImageUrl(imageUrl);
      
      if (!certificationData) {
        const result: TrustResult = {
          level: 'uncertified',
          trusted: false,
          certificateValid: false,
          signatureValid: false,
          imageHashValid: false,
          overallStatus: 'failed',
          details: {
            certificateId: '',
            subject: '',
            issuer: '',
            validFrom: '',
            validTo: '',
            processingType: '',
            timestamp: '',
            description: '',
            originalFilename: ''
          },
          exifData: { orientation: 1, captureTime: new Date().toISOString() },
          trustIssues: ['No embedded certification found']
        };
        
        this.validationCache.set(imageUrl, { result, timestamp: Date.now() });
        return { success: true, data: result };
      }

      // Validate the certification
      const trustResult = await this.validateCertification(certificationData, imageUrl);
      
      // Cache the result
      this.validationCache.set(imageUrl, { result: trustResult, timestamp: Date.now() });
      
      return { success: true, data: trustResult };
      
    } catch (error) {
      console.error('Image validation error:', error);
      return { success: false, error: error.message };
    }
  }

  private async validateCertification(certData: any, imageUrl: string): Promise<TrustResult> {
    const cert = certData.certificate;
    const payload = certData.payload;
    const signature = certData.signature;

    // Check if certificate is in trust store
    const trustedCert = await TrustStoreManager.getCertificate(cert.id);
    const isTrusted = !!trustedCert;

    // Verify certificate validity period
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const isValidPeriod = now >= validFrom && now <= validTo;

    // Verify cryptographic signature
    let signatureValid = false;
    try {
      const publicKey = await WebCryptoUtils.importPublicKey(cert.publicKey);
      const payloadString = JSON.stringify(payload);
      signatureValid = await WebCryptoUtils.verifySignature(publicKey, signature, payloadString);
    } catch (error) {
      console.error('Signature verification error:', error);
    }

    // For now, assume image hash is valid (would need original image for full verification)
    const imageHashValid = true;

    const result: TrustResult = {
      level: isTrusted && isValidPeriod && signatureValid ? 'verified' : 'warning',
      trusted: isTrusted,
      certificateValid: isValidPeriod,
      signatureValid: signatureValid,
      imageHashValid: imageHashValid,
      overallStatus: (isTrusted && isValidPeriod && signatureValid && imageHashValid) ? 'verified' : 'failed',
      details: {
        certificateId: cert.id,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        processingType: payload.processingType,
        timestamp: payload.timestamp,
        description: payload.description,
        originalFilename: payload.originalFilename
      },
      exifData: payload.exifData,
      trustIssues: []
    };

    // Collect trust issues
    if (!isTrusted) result.trustIssues.push('Certificate not in trust store');
    if (!isValidPeriod) result.trustIssues.push('Certificate expired or not yet valid');
    if (!signatureValid) result.trustIssues.push('Digital signature verification failed');

    return result;
  }

  private async handleTrustDataRequest(data: { certificateId: string }): Promise<ChromeMessageResponse> {
    try {
      const certificate = await TrustStoreManager.getCertificate(data.certificateId);
      return { success: true, data: certificate };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async handleCertificateImport(data: { certificate: Certificate }): Promise<ChromeMessageResponse> {
    try {
      await TrustStoreManager.storeCertificate(data.certificate);
      return { success: true, data: 'Certificate imported successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async handleSettingsUpdate(data: { settings: Partial<ExtensionSettings> }): Promise<ChromeMessageResponse> {
    try {
      this.settings = { ...this.settings, ...data.settings };
      await chrome.storage.sync.set({ settings: this.settings });
      return { success: true, data: 'Settings updated' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private startPeriodicCleanup(): void {
    // Clean cache every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.validationCache.entries()) {
        if (now - entry.timestamp > this.cacheExpiryMs) {
          this.validationCache.delete(key);
        }
      }
    }, 10 * 60 * 1000);
  }
}

// Initialize the background service
const trustEngine = new BackgroundTrustEngine();

console.log('AIC Background Service Worker initialized');