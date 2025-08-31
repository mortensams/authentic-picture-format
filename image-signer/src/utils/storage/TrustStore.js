export class TrustStore {
  static DB_NAME = 'ImageTrustStore';
  static DB_VERSION = 3; // Increased version to force migration
  static STORE_NAME = 'certificates';
  static TRUSTED_STORE_NAME = 'trustedCertificates';

  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        
        // Delete old store if it exists with wrong schema
        if (oldVersion < 3 && db.objectStoreNames.contains(this.STORE_NAME)) {
          db.deleteObjectStore(this.STORE_NAME);
        }
        
        // Create certificates store with correct schema
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('subject', 'tbsCertificate.subject.string', { unique: false });
          store.createIndex('issuer', 'tbsCertificate.issuer.string', { unique: false });
          store.createIndex('fingerprint', 'fingerprint.sha256', { unique: false });
        }
        
        // Create trusted certificates store for imported certs
        if (!db.objectStoreNames.contains(this.TRUSTED_STORE_NAME)) {
          const trustedStore = db.createObjectStore(this.TRUSTED_STORE_NAME, { 
            keyPath: 'fingerprint.sha256' 
          });
          trustedStore.createIndex('subject', 'tbsCertificate.subject.string', { unique: false });
          trustedStore.createIndex('serialNumber', 'tbsCertificate.serialNumber', { unique: false });
          trustedStore.createIndex('imported', 'importedAt', { unique: false });
        }
      };
    });
  }

  static async storeCertificate(certificate) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.put(certificate);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  static async getCertificate(id) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  static async getAllCertificates() {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  static async deleteCertificate(id) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  // Trusted Certificate Management Methods

  static async importTrustedCertificate(certificate) {
    const db = await this.openDB();
    const transaction = db.transaction([this.TRUSTED_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.TRUSTED_STORE_NAME);
    
    // Add import metadata
    const trustedCert = {
      ...certificate,
      importedAt: new Date().toISOString(),
      trustLevel: 'manual',
      notes: ''
    };
    
    // Ensure fingerprint exists
    if (!trustedCert.fingerprint?.sha256) {
      const { PEMParser } = await import('../certificates/PEMParser.js');
      trustedCert.fingerprint = await PEMParser.calculateFingerprint(certificate);
    }
    
    return new Promise((resolve, reject) => {
      const request = store.put(trustedCert);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(trustedCert);
      };
    });
  }

  static async getTrustedCertificates() {
    const db = await this.openDB();
    const transaction = db.transaction([this.TRUSTED_STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.TRUSTED_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  static async isCertificateTrusted(certificate) {
    const db = await this.openDB();
    const transaction = db.transaction([this.TRUSTED_STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.TRUSTED_STORE_NAME);
    
    const fingerprint = certificate.fingerprint?.sha256;
    if (!fingerprint) return false;
    
    return new Promise((resolve) => {
      const request = store.get(fingerprint);
      request.onsuccess = () => {
        db.close();
        resolve(!!request.result);
      };
      request.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  }

  static async removeTrustedCertificate(fingerprint) {
    const db = await this.openDB();
    const transaction = db.transaction([this.TRUSTED_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.TRUSTED_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(fingerprint);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }

  static async validateCertificateChain(certificate) {
    const trustedCerts = await this.getTrustedCertificates();
    const { PEMParser } = await import('../certificates/PEMParser.js');
    
    return PEMParser.validateAgainstTrustStore(certificate, trustedCerts);
  }

  // Utility method to clear database (for development/debugging)
  static async clearDatabase() {
    return new Promise((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase(this.DB_NAME);
      deleteReq.onsuccess = () => resolve();
      deleteReq.onerror = () => reject(deleteReq.error);
    });
  }
}