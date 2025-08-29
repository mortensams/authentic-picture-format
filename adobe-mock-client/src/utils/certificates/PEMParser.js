/**
 * PEM Certificate Parser
 * Parses PEM-encoded certificates for import into trust store
 */
export class PEMParser {
  /**
   * Parse a PEM-encoded certificate
   */
  static parseCertificate(pemString) {
    console.log('PEMParser.parseCertificate called');
    console.log('Input string length:', pemString?.length);
    console.log('First 100 chars:', pemString?.substring(0, 100));
    
    try {
      // Remove PEM headers and footers
      const pemContent = pemString
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
        .replace(/-----END EC PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');

      console.log('PEM content after cleanup:', pemContent.substring(0, 50));

      // Decode base64
      const jsonString = atob(pemContent);
      console.log('Decoded JSON string:', jsonString.substring(0, 100));
      
      const certData = JSON.parse(jsonString);
      console.log('Parsed certificate data:', certData);

      // Validate certificate structure
      if (!this.isValidCertificate(certData)) {
        console.error('Certificate validation failed');
        throw new Error('Invalid certificate structure');
      }

      return certData;
    } catch (error) {
      console.error('PEM parsing error:', error);
      throw new Error(`Failed to parse PEM certificate: ${error.message}`);
    }
  }

  /**
   * Parse multiple certificates from a PEM string (certificate chain)
   */
  static parseCertificateChain(pemString) {
    const certificates = [];
    const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
    const matches = pemString.match(certRegex);

    if (!matches) {
      throw new Error('No certificates found in PEM string');
    }

    for (const match of matches) {
      try {
        const cert = this.parseCertificate(match);
        certificates.push(cert);
      } catch (error) {
        console.warn('Failed to parse certificate in chain:', error);
      }
    }

    return certificates;
  }

  /**
   * Validate certificate structure
   */
  static isValidCertificate(cert) {
    // Check for required X.509 fields
    if (!cert.version && !cert.tbsCertificate) {
      return false;
    }

    // If it has tbsCertificate, validate that structure
    if (cert.tbsCertificate) {
      const tbs = cert.tbsCertificate;
      if (!tbs.serialNumber || !tbs.subject || !tbs.issuer || !tbs.validity) {
        return false;
      }
    }

    // Check for signature
    if (!cert.signatureValue && !cert.signature) {
      return false;
    }

    return true;
  }

  /**
   * Extract public key from certificate
   */
  static extractPublicKey(certificate) {
    if (certificate.tbsCertificate?.subjectPublicKeyInfo?.publicKey) {
      return certificate.tbsCertificate.subjectPublicKeyInfo.publicKey;
    }
    
    if (certificate.publicKey) {
      return certificate.publicKey;
    }

    throw new Error('No public key found in certificate');
  }

  /**
   * Get certificate information for display
   */
  static getCertificateInfo(certificate) {
    const tbs = certificate.tbsCertificate || certificate;
    
    return {
      subject: tbs.subject?.string || tbs.subject || 'Unknown',
      issuer: tbs.issuer?.string || tbs.issuer || 'Unknown',
      serialNumber: tbs.serialNumber || 'Unknown',
      validFrom: tbs.validity?.notBefore || null,
      validTo: tbs.validity?.notAfter || null,
      fingerprint: certificate.fingerprint || null,
      signatureAlgorithm: certificate.signatureAlgorithm?.algorithm || 'Unknown',
      isSelfSigned: certificate.isSelfSigned !== undefined ? certificate.isSelfSigned : 
                    (tbs.subject === tbs.issuer),
      extensions: tbs.extensions || []
    };
  }

  /**
   * Convert certificate back to PEM format for export
   */
  static toPEM(certificate, type = 'CERTIFICATE') {
    const jsonString = JSON.stringify(certificate);
    const b64 = btoa(jsonString);
    const lines = b64.match(/.{1,64}/g) || [];
    
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
  }

  /**
   * Validate certificate against a trust store
   */
  static async validateAgainstTrustStore(certificate, trustStore) {
    const certInfo = this.getCertificateInfo(certificate);
    
    // Check if certificate is expired
    if (certInfo.validTo) {
      const now = new Date();
      const validTo = new Date(certInfo.validTo);
      if (now > validTo) {
        return {
          valid: false,
          reason: 'Certificate has expired',
          expired: true
        };
      }
    }

    // Check if certificate is not yet valid
    if (certInfo.validFrom) {
      const now = new Date();
      const validFrom = new Date(certInfo.validFrom);
      if (now < validFrom) {
        return {
          valid: false,
          reason: 'Certificate is not yet valid',
          notYetValid: true
        };
      }
    }

    // Check if issuer is in trust store
    for (const trustedCert of trustStore) {
      const trustedInfo = this.getCertificateInfo(trustedCert);
      
      // Check if this is the issuer
      if (trustedInfo.subject === certInfo.issuer) {
        return {
          valid: true,
          trustedBy: trustedInfo.subject,
          trustChain: [certInfo.subject, trustedInfo.subject]
        };
      }
      
      // Check if this is the same certificate (self-signed)
      if (trustedInfo.serialNumber === certInfo.serialNumber &&
          trustedInfo.fingerprint?.sha256 === certInfo.fingerprint?.sha256) {
        return {
          valid: true,
          trustedBy: 'Direct trust',
          trustChain: [certInfo.subject]
        };
      }
    }

    // Certificate not found in trust store
    return {
      valid: false,
      reason: 'Certificate not found in trust store',
      untrusted: true
    };
  }

  /**
   * Import certificate from file
   */
  static async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const pemString = e.target.result;
          const certificate = this.parseCertificate(pemString);
          resolve(certificate);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Calculate certificate fingerprint if not present
   */
  static async calculateFingerprint(certificate) {
    const certString = JSON.stringify(certificate.tbsCertificate || certificate);
    const encoder = new TextEncoder();
    const data = encoder.encode(certString);
    
    const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
    const sha384Buffer = await crypto.subtle.digest('SHA-384', data);
    
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
}