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
    const result = new Uint8Array(originalArray.length + segment.length);
    
    // Copy SOI marker
    result.set(originalArray.slice(0, 2), 0);
    // Insert certification segment
    result.set(segment, 2);
    // Copy rest of file
    result.set(originalArray.slice(2), 2 + segment.length);
    
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