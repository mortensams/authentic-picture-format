import { JPEGExtractor } from './JPEGExtractor';
import { PNGExtractor } from './PNGExtractor';

export class CertificationExtractor {
  static async extractFromImage(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    try {
      // Read file as array buffer
      const arrayBuffer = await this.fileToArrayBuffer(file);
      
      // Determine file type and extract accordingly
      const fileType = file.type.toLowerCase();
      
      let certificationData = null;
      
      if (fileType.includes('jpeg') || fileType.includes('jpg')) {
        console.log('Extracting from JPEG...');
        certificationData = await JPEGExtractor.extractCertification(arrayBuffer);
      } else if (fileType.includes('png')) {
        console.log('Extracting from PNG...');
        certificationData = await PNGExtractor.extractCertification(arrayBuffer);
      } else {
        console.warn('Unsupported image format:', fileType);
        return null;
      }
      
      if (certificationData) {
        console.log('Certification data extracted:', certificationData);
        return certificationData;
      } else {
        console.log('No certification data found in image');
        return null;
      }
    } catch (error) {
      console.error('Error extracting certification:', error);
      throw error;
    }
  }

  static fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract certificate from certification data
   * Handles multiple formats from different versions
   */
  static extractCertificate(certificationData) {
    if (!certificationData) return null;

    // Direct certificate in certification data
    if (certificationData.certificate) {
      return certificationData.certificate;
    }

    // Certificate fingerprint reference (needs to be looked up in trust store)
    if (certificationData.certFingerprint) {
      return {
        fingerprint: { sha256: certificationData.certFingerprint },
        needsLookup: true
      };
    }

    // Manifest-based certificate
    if (certificationData.manifest?.manifests) {
      const activeManifest = certificationData.manifest.manifests[certificationData.manifestId];
      if (activeManifest?.claim_signature?.certificate) {
        return activeManifest.claim_signature.certificate;
      }
    }

    return null;
  }

  /**
   * Get verification details from certification data
   */
  static getVerificationDetails(certificationData) {
    if (!certificationData) return null;

    return {
      manifestId: certificationData.manifestId || null,
      signature: certificationData.signature || null,
      timestamp: certificationData.timestamp || null,
      description: certificationData.description || null,
      certFingerprint: certificationData.certFingerprint || null
    };
  }
}