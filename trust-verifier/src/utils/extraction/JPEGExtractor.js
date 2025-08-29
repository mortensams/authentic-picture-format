export class JPEGExtractor {
  static MARKER_APP15 = 0xEF;
  static SIGNATURE = 'IMGTRUST';

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
            console.error('Failed to parse certification data:', e);
            return null;
          }
        }
      }
      
      offset++;
    }
    
    return null;
  }

  static isValidJPEG(uint8Array) {
    return uint8Array.length >= 2 && 
           uint8Array[0] === 0xFF && 
           uint8Array[1] === 0xD8;
  }
}