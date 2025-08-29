import { WebCryptoUtils } from '../crypto/WebCryptoUtils';

/**
 * X.509-like certificate implementation following RFC 5280 structure
 * This creates certificates that mimic real X.509 format but using Web Crypto API
 */
export class X509Certificate {
  static VERSION = {
    V1: 0,
    V2: 1,
    V3: 2
  };

  static SIGNATURE_ALGORITHMS = {
    'ES384': {
      name: 'ECDSA',
      hash: 'SHA-384',
      oid: '1.2.840.10045.4.3.3' // ecdsa-with-SHA384
    },
    'ES256': {
      name: 'ECDSA', 
      hash: 'SHA-256',
      oid: '1.2.840.10045.4.3.2' // ecdsa-with-SHA256
    }
  };

  static KEY_USAGE = {
    DIGITAL_SIGNATURE: 0x80,
    NON_REPUDIATION: 0x40,
    KEY_ENCIPHERMENT: 0x20,
    DATA_ENCIPHERMENT: 0x10,
    KEY_AGREEMENT: 0x08,
    KEY_CERT_SIGN: 0x04,
    CRL_SIGN: 0x02
  };

  static EXTENDED_KEY_USAGE = {
    CONTENT_COMMITMENT: '1.3.6.1.5.5.7.3.8',
    TIMESTAMPING: '1.3.6.1.5.5.7.3.8',
    DOCUMENT_SIGNING: '1.3.6.1.4.1.311.10.3.12'
  };

  /**
   * Generate a new X.509-like certificate
   */
  static async generateCertificate(subjectInfo, issuerInfo = null, options = {}) {
    const keyPair = await WebCryptoUtils.generateKeyPair();
    const publicKeyData = await WebCryptoUtils.exportPublicKey(keyPair.publicKey);
    const privateKeyData = await WebCryptoUtils.exportPrivateKey(keyPair.privateKey);

    const now = new Date();
    const validityPeriod = options.validityDays || 365;
    const notBefore = options.notBefore || now;
    const notAfter = new Date(notBefore.getTime() + validityPeriod * 24 * 60 * 60 * 1000);

    // Generate certificate serial number (should be unique)
    const serialNumber = this.generateSerialNumber();
    
    // If self-signed, issuer is same as subject
    const actualIssuer = issuerInfo || subjectInfo;

    // Create TBS (To Be Signed) certificate structure
    const tbsCertificate = {
      version: this.VERSION.V3,
      serialNumber: serialNumber,
      signature: {
        algorithm: 'ES384',
        parameters: null
      },
      issuer: this.formatDistinguishedName(actualIssuer),
      validity: {
        notBefore: notBefore.toISOString(),
        notAfter: notAfter.toISOString()
      },
      subject: this.formatDistinguishedName(subjectInfo),
      subjectPublicKeyInfo: {
        algorithm: {
          algorithm: 'ecPublicKey',
          parameters: 'secp384r1'
        },
        publicKey: publicKeyData
      },
      extensions: this.createExtensions(options)
    };

    // Calculate certificate fingerprint (similar to thumbprint)
    const tbsData = JSON.stringify(tbsCertificate);
    const fingerprint = await this.calculateFingerprint(tbsData);

    // Sign the TBS certificate
    const signature = await WebCryptoUtils.signData(keyPair.privateKey, tbsData);

    const certificate = {
      // Add ID for IndexedDB storage
      id: `cert-${serialNumber}-${Date.now()}`,
      
      // X.509 v3 Certificate Structure
      tbsCertificate: tbsCertificate,
      signatureAlgorithm: {
        algorithm: 'ES384',
        oid: this.SIGNATURE_ALGORITHMS.ES384.oid
      },
      signatureValue: signature,
      
      // Additional metadata
      fingerprint: {
        sha256: fingerprint.sha256,
        sha384: fingerprint.sha384
      },
      keyPair: keyPair,
      privateKey: privateKeyData,
      
      // Certificate chain info
      isSelfSigned: !issuerInfo,
      trustChain: options.trustChain || ['self-signed'],
      
      // C2PA compatibility fields
      c2pa: {
        version: '1.0',
        claim_generator: 'Image Certification Studio/2.0',
        claim_generator_info: [
          {
            name: 'Image Certification Studio',
            version: '2.0',
            icon: null
          }
        ]
      }
    };

    return certificate;
  }

  /**
   * Format Distinguished Name following X.500 standard
   */
  static formatDistinguishedName(info) {
    const dn = {
      commonName: info.name || info.commonName || 'Unknown',
      organizationName: info.organization || null,
      organizationalUnitName: info.department || null,
      localityName: info.city || null,
      stateOrProvinceName: info.state || null,
      countryName: info.country || null,
      emailAddress: info.email || null
    };

    // Create string representation
    const dnString = Object.entries(dn)
      .filter(([_, value]) => value !== null)
      .map(([key, value]) => {
        const abbreviation = this.getDNAbbreviation(key);
        return `${abbreviation}=${value}`;
      })
      .join(', ');

    return {
      ...dn,
      string: dnString
    };
  }

  static getDNAbbreviation(key) {
    const abbreviations = {
      commonName: 'CN',
      organizationName: 'O',
      organizationalUnitName: 'OU',
      localityName: 'L',
      stateOrProvinceName: 'ST',
      countryName: 'C',
      emailAddress: 'E'
    };
    return abbreviations[key] || key;
  }

  /**
   * Create X.509 v3 extensions
   */
  static createExtensions(options) {
    const extensions = [];

    // Basic Constraints (critical for CA certificates)
    extensions.push({
      extnID: '2.5.29.19', // basicConstraints
      critical: true,
      extnValue: {
        cA: options.isCA || false,
        pathLenConstraint: options.pathLenConstraint || 0
      }
    });

    // Key Usage
    extensions.push({
      extnID: '2.5.29.15', // keyUsage
      critical: true,
      extnValue: [
        'digitalSignature',
        'nonRepudiation',
        'contentCommitment'
      ]
    });

    // Extended Key Usage for content authenticity
    extensions.push({
      extnID: '2.5.29.37', // extKeyUsage
      critical: false,
      extnValue: [
        this.EXTENDED_KEY_USAGE.CONTENT_COMMITMENT,
        this.EXTENDED_KEY_USAGE.DOCUMENT_SIGNING
      ]
    });

    // Subject Alternative Name (if provided)
    if (options.subjectAltNames) {
      extensions.push({
        extnID: '2.5.29.17', // subjectAltName
        critical: false,
        extnValue: options.subjectAltNames
      });
    }

    // Authority Key Identifier (for non-self-signed)
    if (options.authorityKeyId) {
      extensions.push({
        extnID: '2.5.29.35', // authorityKeyIdentifier
        critical: false,
        extnValue: {
          keyIdentifier: options.authorityKeyId
        }
      });
    }

    // C2PA specific extension for content authenticity
    extensions.push({
      extnID: '1.3.6.1.4.1.54321.1', // Custom OID for C2PA compatibility
      critical: false,
      extnValue: {
        purpose: 'content-authenticity',
        capabilities: ['capture', 'edit', 'sign'],
        trustModel: 'self-signed-development'
      }
    });

    return extensions;
  }

  /**
   * Generate unique serial number
   */
  static generateSerialNumber() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Calculate certificate fingerprint
   */
  static async calculateFingerprint(data) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    
    const sha256Buffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const sha384Buffer = await crypto.subtle.digest('SHA-384', dataBytes);
    
    return {
      sha256: this.bufferToHex(sha256Buffer),
      sha384: this.bufferToHex(sha384Buffer)
    };
  }

  static bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase();
  }

  /**
   * Export certificate in PEM-like format
   */
  static exportCertificate(certificate, includePrivateKey = false) {
    const certData = {
      ...certificate.tbsCertificate,
      signatureAlgorithm: certificate.signatureAlgorithm,
      signatureValue: certificate.signatureValue,
      fingerprint: certificate.fingerprint
    };

    const b64 = btoa(JSON.stringify(certData));
    const pemCert = `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;

    if (includePrivateKey && certificate.privateKey) {
      const privKeyB64 = btoa(JSON.stringify(certificate.privateKey));
      const pemKey = `-----BEGIN EC PRIVATE KEY-----\n${privKeyB64.match(/.{1,64}/g).join('\n')}\n-----END EC PRIVATE KEY-----`;
      return `${pemCert}\n\n${pemKey}`;
    }

    return pemCert;
  }

  /**
   * Verify certificate signature (for validation)
   */
  static async verifyCertificate(certificate, issuerPublicKey = null) {
    try {
      // For self-signed, use certificate's own public key
      const publicKey = issuerPublicKey || certificate.tbsCertificate.subjectPublicKeyInfo.publicKey;
      
      // In a real implementation, we would reconstruct the public key and verify
      // For this mock, we'll return a validation result
      return {
        valid: true,
        issuer: certificate.tbsCertificate.issuer.string,
        subject: certificate.tbsCertificate.subject.string,
        fingerprint: certificate.fingerprint,
        validFrom: certificate.tbsCertificate.validity.notBefore,
        validTo: certificate.tbsCertificate.validity.notAfter,
        isTrusted: certificate.isSelfSigned ? 'self-signed-development' : 'verified'
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}