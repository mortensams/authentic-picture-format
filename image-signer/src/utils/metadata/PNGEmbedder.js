export class PNGEmbedder {
  static CHUNK_TYPE = 'tRST'; // Custom chunk for trust/certification data
  static PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

  static async embedCertification(imageBuffer, certificationData) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (!this.isValidPNG(uint8Array)) {
      throw new Error('Invalid PNG file');
    }

    const iendPosition = this.findIENDChunk(uint8Array);
    if (iendPosition === -1) {
      throw new Error('IEND chunk not found in PNG');
    }

    const certPayload = JSON.stringify(certificationData);
    const certBytes = new TextEncoder().encode(certPayload);
    
    if (certBytes.length > 2147483647) {
      throw new Error('Certification data too large for PNG chunk');
    }

    const trustChunk = this.createTrustChunk(certBytes);
    return this.insertChunk(uint8Array, trustChunk, iendPosition);
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

  static findIENDChunk(uint8Array) {
    for (let i = 8; i < uint8Array.length - 8; i++) {
      if (uint8Array[i + 4] === 0x49 && // I
          uint8Array[i + 5] === 0x45 && // E
          uint8Array[i + 6] === 0x4E && // N
          uint8Array[i + 7] === 0x44) { // D
        return i;
      }
    }
    return -1;
  }

  static createTrustChunk(certBytes) {
    const chunkLength = certBytes.length;
    const chunk = new Uint8Array(chunkLength + 12);
    
    // Length
    chunk[0] = (chunkLength >> 24) & 0xFF;
    chunk[1] = (chunkLength >> 16) & 0xFF;
    chunk[2] = (chunkLength >> 8) & 0xFF;
    chunk[3] = chunkLength & 0xFF;
    
    // Chunk type: tRST
    chunk[4] = 0x74; // t
    chunk[5] = 0x52; // R
    chunk[6] = 0x53; // S
    chunk[7] = 0x54; // T
    
    // Data
    chunk.set(certBytes, 8);
    
    // CRC32
    const crc = this.calculateCRC32(chunk.slice(4, 8 + chunkLength));
    chunk[8 + chunkLength] = (crc >> 24) & 0xFF;
    chunk[9 + chunkLength] = (crc >> 16) & 0xFF;
    chunk[10 + chunkLength] = (crc >> 8) & 0xFF;
    chunk[11 + chunkLength] = crc & 0xFF;
    
    return chunk;
  }

  static insertChunk(originalArray, chunk, position) {
    const result = new Uint8Array(originalArray.length + chunk.length);
    
    result.set(originalArray.slice(0, position), 0);
    result.set(chunk, position);
    result.set(originalArray.slice(position), position + chunk.length);
    
    return result.buffer;
  }

  static calculateCRC32(data) {
    const crcTable = this.getCRCTable();
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  static getCRCTable() {
    if (!this._crcTable) {
      this._crcTable = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        this._crcTable[n] = c;
      }
    }
    return this._crcTable;
  }

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
          return null;
        }
      }
      
      offset += chunkLength + 12;
    }
    
    return null;
  }
}