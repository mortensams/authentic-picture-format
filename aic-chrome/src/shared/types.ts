// Shared TypeScript interfaces for the Chrome extension
// Migrated from your working PoC

export interface Certificate {
  id: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  certificateType: string;
  publicKey: number[];
  extensions: {
    allowedOperations: string[];
    contentTypes: string[];
    deviceCapabilities?: string[];
  };
}

export interface ExifData {
  camera?: string;
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  focalLength?: number;
  focalLengthString?: string;
  aperture?: number;
  apertureString?: string;
  shutterSpeed?: number;
  shutterSpeedString?: string;
  iso?: number;
  captureTime: string;
  orientation: number;
  gps?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
}

export interface SignaturePayload {
  imageHash: number[];
  description: string;
  exifData: ExifData;
  processingType: string;
  timestamp: string;
  photographer: string;
  certificateId: string;
  originalFilename: string;
  fileSize: number;
}

export interface CertificationData {
  version: string;
  certificate: Certificate;
  signature: number[];
  payload: SignaturePayload;
}

export interface TrustResult {
  level: 'verified' | 'enhanced' | 'synthetic' | 'uncertified' | 'warning' | 'error';
  trusted: boolean;
  certificateValid: boolean;
  signatureValid: boolean;
  imageHashValid: boolean;
  overallStatus: 'verified' | 'failed' | 'error';
  details: {
    certificateId: string;
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    processingType: string;
    timestamp: string;
    description: string;
    originalFilename: string;
  };
  exifData: ExifData;
  trustIssues: string[];
  blockchainTrust?: BlockchainTrustData;
}

export interface BlockchainTrustData {
  isActive: boolean;
  stakeAmount: string;
  reputationScore: number;
  validationCount: number;
  registrationDate: Date;
  lastActivity?: Date;
  communityEndorsements?: number;
}

export interface ExtensionSettings {
  showTrustIndicators: boolean;
  indicatorPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showUncertifiedIndicators: boolean;
  blockchainRpcUrl: string;
  trustContractAddress: string;
  cacheDuration: number;
  privacyLevel: 'maximum' | 'balanced' | 'minimal';
  autoValidation: boolean;
}

export interface ChromeMessage {
  type: 'VALIDATE_IMAGE' | 'GET_TRUST_DATA' | 'IMPORT_CERTIFICATE' | 'UPDATE_SETTINGS';
  data: any;
  tabId?: number;
}

export interface ChromeMessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class TrustValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TrustValidationError';
  }
}

export class BlockchainError extends Error {
  constructor(
    message: string,
    public code: string,
    public transactionHash?: string
  ) {
    super(message);
    this.name = 'BlockchainError';
  }
}