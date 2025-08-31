export class JPEGEmbedder {
  static MARKER_APP15 = 0xEF;
  static SIGNATURE = 'IMGTRUST';

  static async embedCertification(imageBuffer, certificationData) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (!this.isValidJPEG(uint8Array)) {
      throw new Error('Invalid JPEG file');
    }

    const certPayload = JSON.stringify(certificationData);
    const certBytes = new TextEncoder().encode(certPayload);
    const segmentLength = certBytes.length + this.SIGNATURE.length + 2;
    
    if (segmentLength > 65535) {
      throw new Error('Certification data too large for JPEG segment');
    }

    const appSegment = this.createAPP15Segment(certBytes, segmentLength);
    return this.insertSegment(uint8Array, appSegment);
  }

  static isValidJPEG(uint8Array) {
    return uint8Array.length >= 2 && 
           uint8Array[0] === 0xFF && 
           uint8Array[1] === 0xD8;
  }

  static createAPP15Segment(certBytes, segmentLength) {
    const appSegment = new Uint8Array(segmentLength + 2);
    
    appSegment[0] = 0xFF;
    appSegment[1] = this.MARKER_APP15;
    appSegment[2] = (segmentLength >> 8) & 0xFF;
    appSegment[3] = segmentLength & 0xFF;
    
    const signature = new TextEncoder().encode(this.SIGNATURE);
    appSegment.set(signature, 4);
    appSegment.set(certBytes, 4 + signature.length);
    
    return appSegment;
  }

  static insertSegment(originalArray, segment) {
    // Find the right place to insert our APP15 segment
    // We should insert it after existing APP segments (APP0, APP1/EXIF, etc.)
    // but before the actual image data starts
    
    let insertPosition = 2; // Start after SOI marker
    
    // Skip over existing APP segments to preserve them
    while (insertPosition < originalArray.length - 4) {
      if (originalArray[insertPosition] === 0xFF) {
        const marker = originalArray[insertPosition + 1];
        
        // Check if it's an APP segment (0xE0-0xEF) or other metadata segment
        if ((marker >= 0xE0 && marker <= 0xEF) || marker === 0xFE) {
          // Get segment length and skip over it
          const segmentLength = (originalArray[insertPosition + 2] << 8) | 
                               originalArray[insertPosition + 3];
          insertPosition += segmentLength + 2;
        } else if (marker === 0xDB || marker === 0xC0 || marker === 0xC2 || 
                   marker === 0xC4 || marker === 0xDD || marker === 0xDA) {
          // We've reached the actual image data segments, insert before here
          break;
        } else {
          insertPosition++;
        }
      } else {
        insertPosition++;
      }
    }
    
    // Create result array with our segment inserted at the right position
    const result = new Uint8Array(originalArray.length + segment.length);
    
    // Copy everything before insertion point
    result.set(originalArray.slice(0, insertPosition), 0);
    // Insert our certification segment
    result.set(segment, insertPosition);
    // Copy everything after insertion point
    result.set(originalArray.slice(insertPosition), insertPosition + segment.length);
    
    return result.buffer;
  }

  static async extractCertification(imageBuffer) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (!this.isValidJPEG(uint8Array)) {
      return null;
    }

    let offset = 2;
    while (offset < uint8Array.length - 4) {
      if (uint8Array[offset] === 0xFF && uint8Array[offset + 1] === this.MARKER_APP15) {
        const segmentLength = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        const signatureOffset = offset + 4;
        
        const signature = new TextDecoder().decode(
          uint8Array.slice(signatureOffset, signatureOffset + this.SIGNATURE.length)
        );
        
        if (signature === this.SIGNATURE) {
          const dataOffset = signatureOffset + this.SIGNATURE.length;
          const dataLength = segmentLength - this.SIGNATURE.length - 2;
          const certData = new TextDecoder().decode(
            uint8Array.slice(dataOffset, dataOffset + dataLength)
          );
          
          try {
            return JSON.parse(certData);
          } catch (e) {
            return null;
          }
        }
      }
      
      offset++;
    }
    
    return null;
  }
}