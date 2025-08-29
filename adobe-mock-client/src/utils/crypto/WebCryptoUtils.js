export class WebCryptoUtils {
  static async generateKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-384",
      },
      true,
      ["sign", "verify"]
    );
  }

  static async exportPublicKey(publicKey) {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    return Array.from(new Uint8Array(exported));
  }

  static async exportPrivateKey(privateKey) {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    return Array.from(new Uint8Array(exported));
  }

  static async signData(privateKey, data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    
    const signature = await crypto.subtle.sign(
      {
        name: "ECDSA",
        hash: "SHA-384",
      },
      privateKey,
      encodedData
    );
    
    return Array.from(new Uint8Array(signature));
  }

  static async hashImageData(imageData) {
    const cleanImageData = await this.stripMetadata(imageData);
    const hashBuffer = await crypto.subtle.digest('SHA-384', cleanImageData);
    return Array.from(new Uint8Array(hashBuffer));
  }

  static async stripMetadata(imageBuffer) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      return this.stripJPEGMetadata(uint8Array);
    }
    
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let isPNG = true;
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        isPNG = false;
        break;
      }
    }
    
    if (isPNG) {
      return this.stripPNGMetadata(uint8Array);
    }
    
    return imageBuffer;
  }

  static stripJPEGMetadata(uint8Array) {
    const result = [];
    let i = 0;
    
    // Add SOI marker
    result.push(uint8Array[0], uint8Array[1]); // 0xFF, 0xD8
    i = 2;
    
    while (i < uint8Array.length - 1) {
      if (uint8Array[i] === 0xFF) {
        const marker = uint8Array[i + 1];
        
        // Check if this is a marker we want to keep
        if (marker === 0xD8 || marker === 0xD9 || // SOI, EOI
            (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xCC) || // SOF markers (except DHT and DAC)
            marker === 0xC4 || // DHT
            marker === 0xDB || // DQT
            marker === 0xDA) { // SOS
          
          if (marker === 0xDA) { // Start of Scan - copy everything from here
            // For large arrays, avoid spread operator which can cause stack overflow
            for (let j = i; j < uint8Array.length; j++) {
              result.push(uint8Array[j]);
            }
            break;
          } else {
            result.push(uint8Array[i], uint8Array[i + 1]);
            i += 2;
            
            // Copy the segment data if not SOI or EOI
            if (marker !== 0xD8 && marker !== 0xD9) {
              if (i + 2 <= uint8Array.length) {
                const length = (uint8Array[i] << 8) | uint8Array[i + 1];
                // Use a loop instead of spread to avoid stack overflow
                for (let j = i; j < Math.min(i + length, uint8Array.length); j++) {
                  result.push(uint8Array[j]);
                }
                i += length;
              } else {
                break; // Invalid JPEG structure
              }
            }
          }
        } else {
          // Skip metadata segments (APP0-APP15, COM, etc.)
          i += 2;
          if (i + 2 <= uint8Array.length) {
            const length = (uint8Array[i] << 8) | uint8Array[i + 1];
            i += length;
          } else {
            break; // Invalid JPEG structure
          }
        }
      } else {
        i++;
      }
    }
    
    return new Uint8Array(result).buffer;
  }

  static stripPNGMetadata(uint8Array) {
    const result = [];
    
    // Add PNG signature (8 bytes)
    for (let j = 0; j < 8; j++) {
      result.push(uint8Array[j]);
    }
    
    let i = 8;
    while (i < uint8Array.length - 12) {
      if (i + 8 > uint8Array.length) break;
      
      const chunkLength = (uint8Array[i] << 24) | (uint8Array[i + 1] << 16) | 
                         (uint8Array[i + 2] << 8) | uint8Array[i + 3];
      const chunkType = String.fromCharCode(uint8Array[i + 4], uint8Array[i + 5], 
                                          uint8Array[i + 6], uint8Array[i + 7]);
      
      // Keep only critical chunks
      if (chunkType === 'IHDR' || chunkType === 'PLTE' || chunkType === 'IDAT' || chunkType === 'IEND') {
        // Use loop instead of spread to avoid stack overflow
        const chunkEnd = Math.min(i + chunkLength + 12, uint8Array.length);
        for (let j = i; j < chunkEnd; j++) {
          result.push(uint8Array[j]);
        }
      }
      
      i += chunkLength + 12;
      
      // Safety check to prevent infinite loops
      if (chunkLength < 0 || chunkLength > uint8Array.length) {
        break;
      }
    }
    
    return new Uint8Array(result).buffer;
  }
}