export class PNGExtractor {
  static CHUNK_TYPE = 'tRST'; // Custom chunk for trust/certification data
  static PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

  static async extractCertification(imageBuffer) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (!this.isValidPNG(uint8Array)) {
      return null;
    }

    let offset = 8;
    while (offset < uint8Array.length - 12) {
      const chunkLength = (uint8Array[offset] << 24) | 
                         (uint8Array[offset + 1] << 16) |
                         (uint8Array[offset + 2] << 8) | 
                         uint8Array[offset + 3];
      
      const chunkType = String.fromCharCode(
        uint8Array[offset + 4],
        uint8Array[offset + 5],
        uint8Array[offset + 6],
        uint8Array[offset + 7]
      );
      
      if (chunkType === this.CHUNK_TYPE) {
        const dataOffset = offset + 8;
        const certData = new TextDecoder().decode(
          uint8Array.slice(dataOffset, dataOffset + chunkLength)
        );
        
        try {
          return JSON.parse(certData);
        } catch (e) {
          console.error('Failed to parse certification data:', e);
          return null;
        }
      }
      
      // Move to next chunk
      offset += chunkLength + 12;
    }
    
    return null;
  }

  static isValidPNG(uint8Array) {
    if (uint8Array.length < 8) return false;
    
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== this.PNG_SIGNATURE[i]) {
        return false;
      }
    }
    return true;
  }
}