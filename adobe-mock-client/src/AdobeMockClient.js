import React, { useState, useRef, useEffect } from 'react';
import { Camera, Shield, Upload, Save, AlertCircle, CheckCircle, Download } from 'lucide-react';

// Web Crypto API utilities - REAL IMPLEMENTATION
class WebCryptoUtils {
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
    
    result.push(uint8Array[0], uint8Array[1]); // SOI
    i = 2;
    
    while (i < uint8Array.length - 1) {
      if (uint8Array[i] === 0xFF) {
        const marker = uint8Array[i + 1];
        
        if (marker === 0xD8 || marker === 0xD9 || 
            (marker >= 0xC0 && marker <= 0xCF) ||
            marker === 0xC4 || marker === 0xDB || marker === 0xDA) {
          
          if (marker === 0xDA) {
            result.push(...uint8Array.slice(i));
            break;
          } else {
            result.push(uint8Array[i], uint8Array[i + 1]);
            i += 2;
            if (marker !== 0xD8 && marker !== 0xD9) {
              const length = (uint8Array[i] << 8) | uint8Array[i + 1];
              result.push(...uint8Array.slice(i, i + length));
              i += length;
            }
          }
        } else {
          i += 2;
          if (marker >= 0xE0 && marker <= 0xEF) {
            const length = (uint8Array[i] << 8) | uint8Array[i + 1];
            i += length;
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
    result.push(...uint8Array.slice(0, 8));
    
    let i = 8;
    while (i < uint8Array.length) {
      const chunkLength = (uint8Array[i] << 24) | (uint8Array[i + 1] << 16) | 
                         (uint8Array[i + 2] << 8) | uint8Array[i + 3];
      const chunkType = String.fromCharCode(uint8Array[i + 4], uint8Array[i + 5], 
                                          uint8Array[i + 6], uint8Array[i + 7]);
      
      if (chunkType === 'IHDR' || chunkType === 'PLTE' || chunkType === 'IDAT' || chunkType === 'IEND') {
        result.push(...uint8Array.slice(i, i + chunkLength + 12));
      }
      
      i += chunkLength + 12;
    }
    
    return new Uint8Array(result).buffer;
  }
}

// Real trust store implementation using IndexedDB
class TrustStore {
  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ImageTrustStore', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('certificates')) {
          const store = db.createObjectStore('certificates', { keyPath: 'id' });
          store.createIndex('subject', 'subject', { unique: false });
        }
      };
    });
  }

  static async storeCertificate(certificate) {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readwrite');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.put(certificate);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

// Real JPEG metadata embedding
class JPEGCertificationEmbedder {
  static async embedCertificationInJPEG(imageBuffer, certificationData) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    if (uint8Array[0] !== 0xFF || uint8Array[1] !== 0xD8) {
      throw new Error('Invalid JPEG file');
    }

    const certPayload = JSON.stringify(certificationData);
    const certBytes = new TextEncoder().encode(certPayload);
    const segmentLength = certBytes.length + 10;
    const appSegment = new Uint8Array(segmentLength + 2);
    
    appSegment[0] = 0xFF;
    appSegment[1] = 0xEF;
    appSegment[2] = (segmentLength >> 8) & 0xFF;
    appSegment[3] = segmentLength & 0xFF;
    
    const signature = new TextEncoder().encode('IMGTRUST');
    appSegment.set(signature, 4);
    appSegment.set(certBytes, 12);
    
    const result = new Uint8Array(uint8Array.length + appSegment.length);
    result.set(uint8Array.slice(0, 2), 0);
    result.set(appSegment, 2);
    result.set(uint8Array.slice(2), 2 + appSegment.length);
    
    return result.buffer;
  }
}

// Real PNG metadata embedding with proper CRC32
class PNGCertificationEmbedder {
  static async embedCertificationInPNG(imageBuffer, certificationData) {
    const uint8Array = new Uint8Array(imageBuffer);
    
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        throw new Error('Invalid PNG file signature');
      }
    }

    let iendPosition = -1;
    for (let i = 8; i < uint8Array.length - 8; i++) {
      if (uint8Array[i + 4] === 0x49 && uint8Array[i + 5] === 0x45 && 
          uint8Array[i + 6] === 0x4E && uint8Array[i + 7] === 0x44) {
        iendPosition = i;
        break;
      }
    }
    
    if (iendPosition === -1) {
      throw new Error('IEND chunk not found in PNG');
    }

    const certPayload = JSON.stringify(certificationData);
    const certBytes = new TextEncoder().encode(certPayload);
    const chunkLength = certBytes.length;
    const trustChunk = new Uint8Array(chunkLength + 12);
    
    trustChunk[0] = (chunkLength >> 24) & 0xFF;
    trustChunk[1] = (chunkLength >> 16) & 0xFF;
    trustChunk[2] = (chunkLength >> 8) & 0xFF;
    trustChunk[3] = chunkLength & 0xFF;
    
    trustChunk[4] = 0x74; // t
    trustChunk[5] = 0x52; // R
    trustChunk[6] = 0x53; // S
    trustChunk[7] = 0x54; // T
    
    trustChunk.set(certBytes, 8);
    
    // Real CRC32 calculation
    const crc = this.calculateCRC32(trustChunk.slice(4, 8 + chunkLength));
    trustChunk[8 + chunkLength] = (crc >> 24) & 0xFF;
    trustChunk[9 + chunkLength] = (crc >> 16) & 0xFF;
    trustChunk[10 + chunkLength] = (crc >> 8) & 0xFF;
    trustChunk[11 + chunkLength] = crc & 0xFF;
    
    const result = new Uint8Array(uint8Array.length + trustChunk.length);
    result.set(uint8Array.slice(0, iendPosition), 0);
    result.set(trustChunk, iendPosition);
    result.set(uint8Array.slice(iendPosition), iendPosition + trustChunk.length);
    
    return result.buffer;
  }

  static calculateCRC32(data) {
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      crcTable[n] = c;
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// FIXED: Real EXIF extraction for iPhone images
class ExifExtractor {
  static async extractExifData(imageFile) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const dataView = new DataView(arrayBuffer);
          const exifData = this.parseRealExif(dataView);
          resolve(exifData);
        } catch (error) {
          console.error('EXIF parsing error:', error);
          resolve({
            camera: 'EXIF parsing failed',
            orientation: 1,
            captureTime: new Date(imageFile.lastModified).toISOString(),
            gps: null
          });
        }
      };
      reader.readAsArrayBuffer(imageFile);
    });
  }

  static parseRealExif(dataView) {
    let exifData = {
      camera: null,
      lens: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      captureTime: null,
      gps: null,
      orientation: 1
    };

    try {
      // Look for EXIF APP1 segment (0xFFE1)
      let offset = 2; // Skip SOI
      
      while (offset < dataView.byteLength - 4) {
        if (dataView.getUint8(offset) === 0xFF && dataView.getUint8(offset + 1) === 0xE1) {
          const segmentLength = dataView.getUint16(offset + 2, false);
          const exifHeaderOffset = offset + 4;
          
          if (exifHeaderOffset + 6 < dataView.byteLength) {
            const exifHeader = String.fromCharCode(
              dataView.getUint8(exifHeaderOffset),
              dataView.getUint8(exifHeaderOffset + 1),
              dataView.getUint8(exifHeaderOffset + 2),
              dataView.getUint8(exifHeaderOffset + 3)
            );
            
            if (exifHeader === 'Exif') {
              console.log('Found EXIF segment, parsing...');
              exifData = this.parseExifIFD(dataView, exifHeaderOffset + 6);
              break;
            }
          }
        }
        offset += 2;
      }
    } catch (error) {
      console.warn('EXIF parsing failed:', error);
    }

    if (!exifData.captureTime) {
      exifData.captureTime = new Date().toISOString();
    }

    return exifData;
  }

  static parseExifIFD(dataView, tiffOffset) {
    const exifData = {};
    
    try {
      const byteOrder = dataView.getUint16(tiffOffset, false);
      const littleEndian = byteOrder === 0x4949;
      
      if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) {
        return exifData;
      }

      const ifdOffset = dataView.getUint32(tiffOffset + 4, littleEndian);
      const ifdAddress = tiffOffset + ifdOffset;
      
      if (ifdAddress >= dataView.byteLength - 2) {
        return exifData;
      }

      const entryCount = dataView.getUint16(ifdAddress, littleEndian);
      console.log('EXIF entries found:', entryCount);
      
      for (let i = 0; i < Math.min(entryCount, 100); i++) {
        const entryOffset = ifdAddress + 2 + (i * 12);
        
        if (entryOffset + 12 > dataView.byteLength) break;
        
        const tag = dataView.getUint16(entryOffset, littleEndian);
        const type = dataView.getUint16(entryOffset + 2, littleEndian);
        const count = dataView.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = entryOffset + 8;
        
        try {
          switch (tag) {
            case 0x0112: // Orientation - FIXED for iPhone
              if (type === 3 && count === 1) {
                exifData.orientation = dataView.getUint16(valueOffset, littleEndian);
                console.log('Found orientation:', exifData.orientation);
              }
              break;
            case 0x010F: // Camera make
              exifData.cameraMake = this.readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              break;
            case 0x0110: // Camera model
              exifData.cameraModel = this.readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              break;
            case 0x8827: // ISO
              if (type === 3) {
                exifData.iso = dataView.getUint16(valueOffset, littleEndian);
              } else if (type === 4) {
                exifData.iso = dataView.getUint32(valueOffset, littleEndian);
              }
              break;
            case 0x0132: // DateTime
              exifData.captureTime = this.readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              break;
            case 0x829A: // Exposure time
              exifData.shutterSpeed = this.readExifRational(dataView, valueOffset, littleEndian, tiffOffset);
              break;
            case 0x829D: // F-number
              exifData.aperture = this.readExifRational(dataView, valueOffset, littleEndian, tiffOffset);
              break;
            case 0x920A: // Focal length
              exifData.focalLength = this.readExifRational(dataView, valueOffset, littleEndian, tiffOffset);
              break;
            case 0x8825: // GPS Info IFD - FIXED for iPhone GPS
              if (type === 4 && count === 1) {
                try {
                  const gpsIfdOffset = dataView.getUint32(valueOffset, littleEndian);
                  console.log('Found GPS IFD at offset:', gpsIfdOffset);
                  if (tiffOffset + gpsIfdOffset < dataView.byteLength - 2) {
                    exifData.gps = this.parseGPSIFD(dataView, tiffOffset + gpsIfdOffset, littleEndian, tiffOffset);
                  }
                } catch (gpsError) {
                  console.warn('GPS IFD parsing failed:', gpsError);
                }
              }
              break;
          }
        } catch (entryError) {
          console.warn(`Failed to parse EXIF tag ${tag.toString(16)}:`, entryError);
          continue;
        }
      }
      
      // Format extracted data properly
      if (exifData.cameraMake && exifData.cameraModel) {
        exifData.camera = `${exifData.cameraMake} ${exifData.cameraModel}`.trim();
        console.log('Camera identified:', exifData.camera);
      }
      
      if (exifData.aperture) {
        exifData.apertureString = `f/${exifData.aperture.toFixed(1)}`;
      }
      
      if (exifData.shutterSpeed) {
        if (exifData.shutterSpeed < 1) {
          exifData.shutterSpeedString = `1/${Math.round(1/exifData.shutterSpeed)}`;
        } else {
          exifData.shutterSpeedString = `${exifData.shutterSpeed}s`;
        }
      }
      
      if (exifData.focalLength) {
        exifData.focalLengthString = `${Math.round(exifData.focalLength)}mm`;
      }

      if (exifData.captureTime && typeof exifData.captureTime === 'string') {
        try {
          const exifDate = exifData.captureTime.replace(/:/g, '-').replace(' ', 'T') + 'Z';
          exifData.captureTime = new Date(exifDate).toISOString();
        } catch (dateError) {
          exifData.captureTime = new Date().toISOString();
        }
      }

    } catch (error) {
      console.warn('EXIF IFD parsing error:', error);
    }

    return exifData;
  }

  // FIXED: Real GPS IFD parsing for iPhone GPS data
  static parseGPSIFD(dataView, gpsIfdOffset, littleEndian, tiffOffset) {
    try {
      if (gpsIfdOffset + 2 >= dataView.byteLength) {
        return null;
      }

      const gpsEntryCount = dataView.getUint16(gpsIfdOffset, littleEndian);
      console.log('GPS entries found:', gpsEntryCount);
      const gpsData = {};
      
      for (let i = 0; i < Math.min(gpsEntryCount, 20); i++) {
        const entryOffset = gpsIfdOffset + 2 + (i * 12);
        
        if (entryOffset + 12 > dataView.byteLength) break;
        
        const tag = dataView.getUint16(entryOffset, littleEndian);
        const type = dataView.getUint16(entryOffset + 2, littleEndian);
        const count = dataView.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = entryOffset + 8;
        
        try {
          switch (tag) {
            case 0x0001: // GPSLatitudeRef
              gpsData.latRef = String.fromCharCode(dataView.getUint8(valueOffset));
              break;
            case 0x0002: // GPSLatitude
              gpsData.latitude = this.readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              break;
            case 0x0003: // GPSLongitudeRef
              gpsData.lngRef = String.fromCharCode(dataView.getUint8(valueOffset));
              break;
            case 0x0004: // GPSLongitude
              gpsData.longitude = this.readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              break;
            case 0x0005: // GPSAltitudeRef
              gpsData.altRef = dataView.getUint8(valueOffset);
              break;
            case 0x0006: // GPSAltitude
              gpsData.altitude = this.readExifRational(dataView, valueOffset, littleEndian, tiffOffset);
              break;
          }
        } catch (gpsError) {
          console.warn(`GPS tag ${tag} parsing failed:`, gpsError);
        }
      }
      
      // Convert GPS coordinates to decimal degrees
      if (gpsData.latitude && gpsData.longitude && gpsData.latRef && gpsData.lngRef) {
        const lat = this.dmsToDecimal(gpsData.latitude, gpsData.latRef);
        const lng = this.dmsToDecimal(gpsData.longitude, gpsData.lngRef);
        
        console.log('GPS extracted - Lat:', lat, 'Lng:', lng);
        
        return {
          latitude: lat,
          longitude: lng,
          altitude: gpsData.altitude || 0
        };
      }
      
    } catch (error) {
      console.warn('GPS IFD parsing error:', error);
    }
    
    return null;
  }

  static readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset) {
    try {
      if (type === 5 && count === 3) { // RATIONAL type, 3 values
        const coordArrayOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
        
        if (coordArrayOffset + 24 > dataView.byteLength) {
          return [0, 0, 0];
        }
        
        const degrees = this.readRationalAt(dataView, coordArrayOffset, littleEndian);
        const minutes = this.readRationalAt(dataView, coordArrayOffset + 8, littleEndian);
        const seconds = this.readRationalAt(dataView, coordArrayOffset + 16, littleEndian);
        
        return [degrees, minutes, seconds];
      }
    } catch (error) {
      console.warn('GPS coordinate reading failed:', error);
    }
    
    return [0, 0, 0];
  }

  static readRationalAt(dataView, offset, littleEndian) {
    try {
      if (offset + 8 > dataView.byteLength) return 0;
      
      const numerator = dataView.getUint32(offset, littleEndian);
      const denominator = dataView.getUint32(offset + 4, littleEndian);
      
      return denominator !== 0 ? numerator / denominator : 0;
    } catch (error) {
      return 0;
    }
  }

  static dmsToDecimal(dmsArray, ref) {
    const [degrees, minutes, seconds] = dmsArray;
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    
    if (ref === 'S' || ref === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }

  static readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset) {
    try {
      let stringOffset = valueOffset;
      if (count > 4) {
        stringOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
      }
      
      if (stringOffset + count > dataView.byteLength) {
        return null;
      }
      
      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + stringOffset, count - 1);
      return new TextDecoder().decode(bytes);
    } catch (error) {
      return null;
    }
  }

  static readExifRational(dataView, valueOffset, littleEndian, tiffOffset) {
    try {
      let rationalOffset = valueOffset;
      if (valueOffset < tiffOffset + 8) {
        rationalOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
      }
      
      if (rationalOffset + 8 > dataView.byteLength) {
        return null;
      }
      
      const numerator = dataView.getUint32(rationalOffset, littleEndian);
      const denominator = dataView.getUint32(rationalOffset + 4, littleEndian);
      
      return denominator !== 0 ? numerator / denominator : null;
    } catch (error) {
      return null;
    }
  }
}

function getOrientationDescription(orientation) {
  const orientations = {
    1: 'Normal', 2: 'Flip horizontal', 3: 'Rotate 180°', 4: 'Flip vertical',
    5: 'Rotate 90° CW + flip horizontal', 6: 'Rotate 90° CW', 
    7: 'Rotate 90° CCW + flip horizontal', 8: 'Rotate 90° CCW'
  };
  return orientations[orientation] || `Unknown (${orientation})`;
}

export default function AdobeMockClient() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [description, setDescription] = useState('');
  const [exifData, setExifData] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [certifiedImageBlob, setCertifiedImageBlob] = useState(null);
  const [status, setStatus] = useState('Initializing...');
  const fileInputRef = useRef(null);

  useEffect(() => {
    generateSelfSignedCertificate();
  }, []);

  const generateSelfSignedCertificate = async () => {
    try {
      setStatus('Generating photographer certificate...');
      
      const keyPair = await WebCryptoUtils.generateKeyPair();
      const publicKeyData = await WebCryptoUtils.exportPublicKey(keyPair.publicKey);
      const privateKeyData = await WebCryptoUtils.exportPrivateKey(keyPair.privateKey);
      
      const cert = {
        id: 'photographer-cert-' + Date.now(),
        subject: 'Professional Photographer - John Smith',
        issuer: 'Self-Signed',
        serialNumber: Math.floor(Math.random() * 1000000).toString(),
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        certificateType: 'professional_enhancement',
        publicKey: publicKeyData,
        privateKey: privateKeyData,
        keyPair: keyPair,
        extensions: {
          allowedOperations: ['capture', 'basic_editing', 'professional_enhancement'],
          contentTypes: ['photography', 'journalism']
        }
      };

      await TrustStore.storeCertificate(cert);
      setCertificate(cert);
      setStatus('Ready to certify iPhone images');
      
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setStatus('Extracting real EXIF data from iPhone image...');
      
      const preview = URL.createObjectURL(file);
      setImagePreview(preview);
      setImage(file);

      // Extract real EXIF data - FIXED for iPhone
      const exif = await ExifExtractor.extractExifData(file);
      setExifData(exif);
      
      console.log('Extracted EXIF:', exif);
      
      if (exif.gps) {
        setStatus(`✅ Real iPhone EXIF extracted with GPS: ${exif.gps.latitude.toFixed(6)}, ${exif.gps.longitude.toFixed(6)}`);
      } else {
        setStatus('✅ Real iPhone EXIF extracted (no GPS data found in image)');
      }
      
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const embedSignatureInImage = async () => {
    if (!image || !certificate || !description.trim()) return;

    try {
      setIsSigning(true);
      setStatus('Embedding real signature in image metadata...');

      const originalBuffer = await image.arrayBuffer();
      const imageHash = await WebCryptoUtils.hashImageData(originalBuffer);

      const signaturePayload = {
        imageHash: Array.from(imageHash),
        description: description,
        exifData: exifData,
        processingType: 'professional_enhancement',
        timestamp: new Date().toISOString(),
        photographer: certificate.subject,
        certificateId: certificate.id,
        originalFilename: image.name,
        fileSize: image.size
      };

      const payloadString = JSON.stringify(signaturePayload);
      const signature = await WebCryptoUtils.signData(certificate.keyPair.privateKey, payloadString);

      const certificationData = {
        version: '1.0',
        certificate: {
          id: certificate.id,
          subject: certificate.subject,
          issuer: certificate.issuer,
          publicKey: certificate.publicKey,
          validFrom: certificate.validFrom,
          validTo: certificate.validTo
        },
        signature: signature,
        payload: signaturePayload
      };

      let certifiedImageBuffer;
      const imageType = image.type.toLowerCase();
      
      if (imageType.includes('jpeg') || imageType.includes('jpg')) {
        certifiedImageBuffer = await JPEGCertificationEmbedder.embedCertificationInJPEG(
          originalBuffer, certificationData
        );
      } else if (imageType.includes('png')) {
        certifiedImageBuffer = await PNGCertificationEmbedder.embedCertificationInPNG(
          originalBuffer, certificationData
        );
      } else {
        throw new Error(`Unsupported format: ${imageType}`);
      }

      const certifiedBlob = new Blob([certifiedImageBuffer], { type: image.type });
      setCertifiedImageBlob(certifiedBlob);
      
      setStatus('✅ Real certification embedded - ready to download');
      
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsSigning(false);
    }
  };

  // FIXED: Download functionality
  const downloadCertifiedImage = () => {
    if (!certifiedImageBlob) {
      setStatus('❌ No certified image to download');
      return;
    }

    try {
      setStatus('Downloading certified image...');
      
      const url = URL.createObjectURL(certifiedImageBlob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = `certified_${image.name}`;
      link.target = '_blank';
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 1000);
      
      setStatus('✅ Certified image downloaded successfully');
      
    } catch (error) {
      setStatus(`Download failed: ${error.message}`);
      console.error('Download error:', error);
    }
  };

  const exportPublicCertificate = () => {
    if (!certificate) return;

    const publicCert = {
      id: certificate.id,
      subject: certificate.subject,
      issuer: certificate.issuer,
      serialNumber: certificate.serialNumber,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      certificateType: certificate.certificateType,
      publicKey: certificate.publicKey,
      extensions: certificate.extensions
    };

    const dataStr = JSON.stringify(publicCert, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', 'photographer_public_certificate.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canSign = image && certificate && description.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Camera className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Image Certification Studio</h1>
          </div>
          <p className="text-gray-600">Real iPhone EXIF extraction & cryptographic signing - FIXED</p>
        </div>

        <div className="mb-8 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSigning ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              ) : (
                <Shield className="w-5 h-5 text-blue-600" />
              )}
              <span className="font-medium text-gray-800">{status}</span>
            </div>
            
            {certificate && (
              <button
                onClick={exportPublicCertificate}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Certificate
              </button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Select iPhone Image</h2>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/jpeg,image/jpg,image/png"
                  className="hidden"
                />
                
                {!imagePreview ? (
                  <div>
                    <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Upload iPhone Image</h3>
                    <p className="text-gray-500 mb-6">JPEG or PNG files with real EXIF/GPS data</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Choose Image
                    </button>
                  </div>
                ) : (
                  <div>
                    <img 
                      src={imagePreview} 
                      alt="Selected" 
                      className="max-w-full max-h-64 mx-auto rounded-lg shadow-md mb-4"
                    />
                    <div className="text-sm text-gray-600 mb-4">
                      <p className="font-medium">{image?.name}</p>
                      <p>{image?.type} • {(image?.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      Choose Different Image
                    </button>
                  </div>
                )}
              </div>
            </div>

            {imagePreview && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Image Description</h2>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the image content, context, location, and any relevant details..."
                  className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-2">
                  This description will be cryptographically signed with the image
                </p>
              </div>
            )}

            {imagePreview && certificate && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Certification</h2>
                
                <button
                  onClick={embedSignatureInImage}
                  disabled={isSigning || !canSign}
                  className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3 mb-4"
                >
                  {isSigning ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Signing Image...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Sign & Certify Image
                    </>
                  )}
                </button>

                {!description.trim() && imagePreview && (
                  <p className="text-sm text-amber-600 mb-4">⚠️ Description required for certification</p>
                )}

                {certifiedImageBlob && (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Real Certificate Embedded</span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        ECDSA signature embedded in image metadata
                      </p>
                    </div>

                    <button
                      onClick={downloadCertifiedImage}
                      className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      <Save className="w-4 h-4" />
                      Download Certified Image
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {certificate && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Active Certificate</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subject:</span>
                    <span className="font-medium text-gray-800">{certificate.subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="font-medium text-gray-800">{certificate.certificateType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valid Until:</span>
                    <span className="font-medium text-gray-800">{new Date(certificate.validTo).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            )}

            {exifData && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Real iPhone EXIF Data</h2>
                
                <div className="space-y-4">
                  <div>
                    <span className="text-sm text-gray-600">Camera:</span>
                    <p className="font-medium text-gray-800">{exifData.camera || 'Camera info not available'}</p>
                    {exifData.lens && <p className="text-sm text-gray-700">{exifData.lens}</p>}
                  </div>
                  
                  {(exifData.focalLengthString || exifData.apertureString) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-gray-600">Focal Length:</span>
                        <p className="font-medium text-gray-800">{exifData.focalLengthString || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Aperture:</span>
                        <p className="font-medium text-gray-800">{exifData.apertureString || 'N/A'}</p>
                      </div>
                    </div>
                  )}

                  {(exifData.shutterSpeedString || exifData.iso) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-gray-600">Shutter:</span>
                        <p className="font-medium text-gray-800">{exifData.shutterSpeedString || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">ISO:</span>
                        <p className="font-medium text-gray-800">{exifData.iso || 'N/A'}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-sm text-gray-600">Orientation:</span>
                    <p className="font-medium text-gray-800">{getOrientationDescription(exifData.orientation)}</p>
                  </div>

                  {exifData.gps ? (
                    <div>
                      <span className="text-sm text-gray-600">iPhone GPS Location:</span>
                      <div className="mt-1 p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm font-mono text-green-800">Lat: {exifData.gps.latitude.toFixed(6)}</p>
                        <p className="text-sm font-mono text-green-800">Lng: {exifData.gps.longitude.toFixed(6)}</p>
                        <p className="text-sm font-mono text-green-800">Alt: {exifData.gps.altitude.toFixed(1)}m</p>
                        <a
                          href={`https://www.google.com/maps?q=${exifData.gps.latitude},${exifData.gps.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-xs mt-2 inline-block"
                        >
                          📍 View on Maps
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-sm text-gray-600">GPS Location:</span>
                      <p className="font-medium text-gray-700">No GPS data found in iPhone image</p>
                      <p className="text-xs text-gray-500 mt-1">Enable location services when taking photos to include GPS data</p>
                    </div>
                  )}

                  <div>
                    <span className="text-sm text-gray-600">Captured:</span>
                    <p className="font-medium text-gray-800">{new Date(exifData.captureTime).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-800 mb-2">iPhone Fixes Applied ✅</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <p>• Real iPhone EXIF extraction</p>
                    <p>• Fixed GPS IFD parsing for iPhone GPS</p>
                    <p>• Fixed orientation reading</p>
                    <p>• Fixed download functionality</p>
                    <p>• Real cryptographic signatures</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
