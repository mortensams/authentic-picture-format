export const appConfig = {
  app: {
    name: 'Image Certification Studio',
    version: '2.0.0',
    description: 'Cryptographic image certification with content authenticity'
  },
  
  certification: {
    defaultSubject: 'Professional Photographer',
    defaultIssuer: 'Self-Signed Certificate',
    validityDays: 365,
    allowedOperations: ['capture', 'basic_editing', 'professional_enhancement'],
    contentTypes: ['photography', 'journalism', 'art', 'documentary'],
    signatureAlgorithm: 'ECDSA',
    hashAlgorithm: 'SHA-384',
    curve: 'P-384'
  },
  
  ui: {
    maxImageSizeMB: 50,
    supportedFormats: ['image/jpeg', 'image/jpg', 'image/png'],
    enableDebugMode: false
  },
  
  storage: {
    dbName: 'ImageTrustStore',
    dbVersion: 1,
    certificateStore: 'certificates'
  }
};

export default appConfig;