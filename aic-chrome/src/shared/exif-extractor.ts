// EXIF extractor with your iPhone fixes migrated to TypeScript

import { ExifData } from './types';

export class ExifExtractor {
  static async extractExifFromUrl(imageUrl: string): Promise<ExifData> {
    try {
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      return this.extractExifData(arrayBuffer);
    } catch (error) {
      console.warn('Failed to extract EXIF from URL:', error);
      return this.getDefaultExifData();
    }
  }

  static async extractExifData(imageBuffer: ArrayBuffer): Promise<ExifData> {
    const dataView = new DataView(imageBuffer);
    
    try {
      return this.parseRealExif(dataView);
    } catch (error) {
      console.warn('EXIF parsing failed:', error);
      return this.getDefaultExifData();
    }
  }

  private static getDefaultExifData(): ExifData {
    return {
      camera: 'EXIF data not available',
      orientation: 1,
      captureTime: new Date().toISOString()
    };
  }

  private static parseRealExif(dataView: DataView): ExifData {
    let exifData: ExifData = {
      orientation: 1,
      captureTime: new Date().toISOString()
    };

    try {
      // Look for EXIF APP1 segment (0xFFE1) - your working implementation
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

    return exifData;
  }

  private static parseExifIFD(dataView: DataView, tiffOffset: number): ExifData {
    const exifData: ExifData = {
      orientation: 1,
      captureTime: new Date().toISOString()
    };
    
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
              }
              break;
            case 0x010F: // Camera make
              const cameraMake = this.readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              if (cameraMake) exifData.cameraMake = cameraMake;
              break;
            case 0x0110: // Camera model
              const cameraModel = this.readExifString(dataView, valueOffset, count, type, littleEndian, tiffOffset);
              if (cameraModel) exifData.cameraModel = cameraModel;
              break;
            case 0x8825: // GPS Info IFD - FIXED for iPhone GPS
              if (type === 4 && count === 1) {
                try {
                  const gpsIfdOffset = dataView.getUint32(valueOffset, littleEndian);
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
        }
      }
      
      // Format extracted data
      if (exifData.cameraMake && exifData.cameraModel) {
        exifData.camera = `${exifData.cameraMake} ${exifData.cameraModel}`.trim();
      }

    } catch (error) {
      console.warn('EXIF IFD parsing error:', error);
    }

    return exifData;
  }

  // FIXED: Real GPS IFD parsing for iPhone GPS data  
  private static parseGPSIFD(dataView: DataView, gpsIfdOffset: number, littleEndian: boolean, tiffOffset: number): { latitude: number; longitude: number; altitude: number } | undefined {
    try {
      if (gpsIfdOffset + 2 >= dataView.byteLength) {
        return undefined;
      }

      const gpsEntryCount = dataView.getUint16(gpsIfdOffset, littleEndian);
      
      const gpsData: {
        latitude?: number[];
        longitude?: number[];
        latRef?: string;
        lngRef?: string;
        altitude?: number;
      } = {};
      
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
            case 0x0006: // GPSAltitude
              gpsData.altitude = this.readExifRational(dataView, valueOffset, littleEndian, tiffOffset) || 0;
              break;
          }
        } catch (gpsError) {
          console.warn(`GPS tag ${tag} parsing failed:`, gpsError);
        }
      }
      
      // Convert to decimal degrees
      if (gpsData.latitude && gpsData.longitude && gpsData.latRef && gpsData.lngRef) {
        const lat = this.dmsToDecimal(gpsData.latitude, gpsData.latRef);
        const lng = this.dmsToDecimal(gpsData.longitude, gpsData.lngRef);
        
        return {
          latitude: lat,
          longitude: lng,
          altitude: gpsData.altitude || 0
        };
      }
      
    } catch (error) {
      console.warn('GPS IFD parsing error:', error);
    }
    
    return undefined;
  }

  private static readGPSCoordinate(dataView: DataView, valueOffset: number, count: number, type: number, littleEndian: boolean, tiffOffset: number): number[] {
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

  private static readRationalAt(dataView: DataView, offset: number, littleEndian: boolean): number {
    try {
      if (offset + 8 > dataView.byteLength) return 0;
      
      const numerator = dataView.getUint32(offset, littleEndian);
      const denominator = dataView.getUint32(offset + 4, littleEndian);
      
      return denominator !== 0 ? numerator / denominator : 0;
    } catch (error) {
      return 0;
    }
  }

  private static dmsToDecimal(dmsArray: number[], ref: string): number {
    const [degrees, minutes, seconds] = dmsArray;
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    
    if (ref === 'S' || ref === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }

  private static readExifString(dataView: DataView, valueOffset: number, count: number, type: number, littleEndian: boolean, tiffOffset: number): string | null {
    try {
      let stringOffset = valueOffset;
      if (count > 4) {
        stringOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
      }
      
      if (stringOffset + count > dataView.byteLength) {
        return null;
      }
      
      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + stringOffset, Math.max(0, count - 1));
      return new TextDecoder().decode(bytes);
    } catch (error) {
      return null;
    }
  }

  private static readExifRational(dataView: DataView, valueOffset: number, littleEndian: boolean, tiffOffset: number): number | null {
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

export function getOrientationDescription(orientation: number): string {
  const orientations: { [key: number]: string } = {
    1: 'Normal', 2: 'Flip horizontal', 3: 'Rotate 180°', 4: 'Flip vertical',
    5: 'Rotate 90° CW + flip horizontal', 6: 'Rotate 90° CW', 
    7: 'Rotate 90° CCW + flip horizontal', 8: 'Rotate 90° CCW'
  };
  return orientations[orientation] || `Unknown (${orientation})`;
}

export function formatGPSCoordinate(decimal: number, isLatitude: boolean): string {
  const direction = isLatitude ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = ((absolute - degrees) * 60 - minutes) * 60;
  
  return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
}