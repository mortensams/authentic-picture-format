// Crypto utilities migrated from your working PoC
// All client-side cryptography with TypeScript type safety

import { Certificate, CertificationData, TrustValidationError } from './types';

export class WebCryptoUtils {
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-384",
      },
      true,
      ["sign", "verify"]
    );
  }

  static async exportPublicKey(publicKey: CryptoKey): Promise<number[]> {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    return Array.from(new Uint8Array(exported));
  }

  static async importPublicKey(keyData: number[]): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      "spki",
      new Uint8Array(keyData),
      {
        name: "ECDSA",
        namedCurve: "P-384",
      },
      true,
      ["verify"]
    );
  }

  static async verifySignature(publicKey: CryptoKey, signature: number[], data: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    
    try {
      return await crypto.subtle.verify(
        {
          name: "ECDSA",
          hash: "SHA-384",
        },
        publicKey,
        new Uint8Array(signature),
        encodedData
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  static async hashImageDataWithoutMetadata(imageBuffer: ArrayBuffer): Promise<number[]> {
    // Real implementation: Strip certification metadata and hash clean image
    const uint8Array = new Uint8Array(imageBuffer);
    
    // Determine format and strip our certification data
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      // JPEG - remove our APP15 segment
      const cleanBuffer = this.stripJPEGCertification(uint8Array);
      const hashBuffer = await crypto.subtle.digest('SHA-384', cleanBuffer);
      return Array.from(new Uint8Array(hashBuffer));
    }
    
    // Check for PNG
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let isPNG = true;
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        isPNG = false;
        break;
      }
    }
    
    if (isPNG) {
      // PNG - remove our tRST chunk
      const cleanBuffer = this.stripPNGCertification(uint8Array);
      const hashBuffer = await crypto.subtle.digest('SHA-384', cleanBuffer);
      return Array.from(new Uint8Array(hashBuffer));
    }
    
    // Unknown format - hash as-is
    const hashBuffer = await crypto.subtle.digest('SHA-384', imageBuffer);
    return Array.from(new Uint8Array(hashBuffer));
  }

  private static stripJPEGCertification(uint8Array: Uint8Array): ArrayBuffer {
    const result: number[] = [];
    let i = 0;
    
    // Copy everything except our APP15 certification segment
    while (i < uint8Array.length - 1) {
      if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xEF) {
        // Found APP15 segment - check if it's our certification
        if (i + 12 < uint8Array.length) {
          const segmentLength = (uint8Array[i + 2] << 8) | uint8Array[i + 3];
          const signature = new TextDecoder().decode(uint8Array.slice(i + 4, i + 12));
          if (signature === 'IMGTRUST') {
            // Skip our certification segment
            i += segmentLength + 2;
            continue;
          }
        }
      }
      
      result.push(uint8Array[i]);
      i++;
    }
    
    if (i < uint8Array.length) {
      result.push(uint8Array[i]);
    }
    
    return new Uint8Array(result).buffer;
  }

  private static stripPNGCertification(uint8Array: Uint8Array): ArrayBuffer {
    const result: number[] = [];
    result.push(...Array.from(uint8Array.slice(0, 8))); // PNG signature
    
    let i = 8;
    while (i < uint8Array.length) {
      const chunkLength = (uint8Array[i] << 24) | (uint8Array[i + 1] << 16) | 
                         (uint8Array[i + 2] << 8) | uint8Array[i + 3];
      const chunkType = String.fromCharCode(uint8Array[i + 4], uint8Array[i + 5], 
                                          uint8Array[i + 6], uint8Array[i + 7]);
      
      // Skip our tRST chunk, keep everything else
      if (chunkType !== 'tRST') {
        result.push(...Array.from(uint8Array.slice(i, i + chunkLength + 12)));
      }
      
      i += chunkLength + 12;
    }
    
    return new Uint8Array(result).buffer;
  }
}

export class CertificationExtractor {
  static async extractFromImageUrl(imageUrl: string): Promise<CertificationData | null> {
    try {
      // Fetch image data
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new TrustValidationError(`Failed to fetch image: ${response.status}`, 'FETCH_ERROR');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const imageType = response.headers.get('content-type') || '';
      
      return this.extractFromBuffer(arrayBuffer, imageType);
    } catch (error) {
      console.error('Image fetch error:', error);
      return null;
    }
  }

  static async extractFromBuffer(imageBuffer: ArrayBuffer, imageType: string): Promise<CertificationData | null> {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (imageType.includes('jpeg') || imageType.includes('jpg') ||
        (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8)) {
      return this.extractFromJPEG(uint8Array);
    } else if (imageType.includes('png') || this.isPNGSignature(uint8Array)) {
      return this.extractFromPNG(uint8Array);
    }
    
    return null;
  }

  private static isPNGSignature(uint8Array: Uint8Array): boolean {
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if (uint8Array.length < 8) return false;
    
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        return false;
      }
    }
    return true;
  }

  private static extractFromJPEG(uint8Array: Uint8Array): CertificationData | null {
    // Look for APP15 segment (0xFFEF) with IMGTRUST signature
    for (let i = 0; i < uint8Array.length - 12; i++) {
      if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xEF) {
        const segmentLength = (uint8Array[i + 2] << 8) | uint8Array[i + 3];
        const signature = new TextDecoder().decode(uint8Array.slice(i + 4, i + 12));
        
        if (signature === 'IMGTRUST') {
          try {
            const certData = new TextDecoder().decode(uint8Array.slice(i + 12, i + 2 + segmentLength));
            return JSON.parse(certData) as CertificationData;
          } catch (error) {
            console.error('Failed to parse JPEG certification data:', error);
            return null;
          }
        }
      }
    }
    return null;
  }

  private static extractFromPNG(uint8Array: Uint8Array): CertificationData | null {
    // Look for tRST chunk
    for (let i = 8; i < uint8Array.length - 8; i += 4) {
      if (uint8Array[i + 4] === 0x74 && uint8Array[i + 5] === 0x52 && 
          uint8Array[i + 6] === 0x53 && uint8Array[i + 7] === 0x54) { // "tRST"
        
        const chunkLength = (uint8Array[i] << 24) | (uint8Array[i + 1] << 16) | 
                           (uint8Array[i + 2] << 8) | uint8Array[i + 3];
        
        try {
          const certData = new TextDecoder().decode(uint8Array.slice(i + 8, i + 8 + chunkLength));
          return JSON.parse(certData) as CertificationData;
        } catch (error) {
          console.error('Failed to parse PNG certification data:', error);
          return null;
        }
      }
    }
    return null;
  }
}

export class TrustStoreManager {
  private static readonly DB_NAME = 'ImageTrustStore';
  private static readonly DB_VERSION = 1;

  static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('certificates')) {
          const store = db.createObjectStore('certificates', { keyPath: 'id' });
          store.createIndex('subject', 'subject', { unique: false });
        }
      };
    });
  }

  static async storeCertificate(certificate: Certificate): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readwrite');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.put(certificate);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  static async getCertificate(id: string): Promise<Certificate | null> {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readonly');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  static async getAllCertificates(): Promise<Certificate[]> {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readonly');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  static async deleteCertificate(id: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readwrite');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}