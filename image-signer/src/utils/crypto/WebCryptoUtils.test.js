import { WebCryptoUtils } from './WebCryptoUtils';

describe('WebCryptoUtils', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid ECDSA key pair', async () => {
      const keyPair = await WebCryptoUtils.generateKeyPair();
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.type).toBe('private');
    });
  });

  describe('exportPublicKey', () => {
    it('should export public key as array', async () => {
      const keyPair = await WebCryptoUtils.generateKeyPair();
      const exported = await WebCryptoUtils.exportPublicKey(keyPair.publicKey);
      
      expect(Array.isArray(exported)).toBe(true);
      expect(exported.length).toBeGreaterThan(0);
      expect(exported.every(byte => typeof byte === 'number')).toBe(true);
    });
  });

  describe('signData and verify', () => {
    it('should create a valid signature', async () => {
      const keyPair = await WebCryptoUtils.generateKeyPair();
      const data = 'Test data to sign';
      
      const signature = await WebCryptoUtils.signData(keyPair.privateKey, data);
      
      expect(Array.isArray(signature)).toBe(true);
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('hashImageData', () => {
    it('should hash image data consistently', async () => {
      const testData = new TextEncoder().encode('test image data');
      const hash1 = await WebCryptoUtils.hashImageData(testData.buffer);
      const hash2 = await WebCryptoUtils.hashImageData(testData.buffer);
      
      expect(hash1).toEqual(hash2);
      expect(hash1.length).toBe(48); // SHA-384 produces 48 bytes
    });
  });

  describe('stripMetadata', () => {
    it('should handle non-image data gracefully', async () => {
      const testData = new TextEncoder().encode('not an image');
      const result = await WebCryptoUtils.stripMetadata(testData.buffer);
      
      expect(result).toBeDefined();
      expect(result).toBe(testData.buffer);
    });

    it('should detect JPEG format', async () => {
      const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = await WebCryptoUtils.stripMetadata(jpegHeader.buffer);
      
      expect(result).toBeDefined();
    });

    it('should detect PNG format', async () => {
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = await WebCryptoUtils.stripMetadata(pngHeader.buffer);
      
      expect(result).toBeDefined();
    });
  });
});