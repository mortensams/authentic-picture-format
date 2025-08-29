export class ExifExtractor {
  static EXIF_TAGS = {
    ORIENTATION: 0x0112,
    CAMERA_MAKE: 0x010F,
    CAMERA_MODEL: 0x0110,
    ISO: 0x8827,
    DATETIME: 0x0132,
    EXPOSURE_TIME: 0x829A,
    F_NUMBER: 0x829D,
    FOCAL_LENGTH: 0x920A,
    GPS_IFD: 0x8825,
    LENS_MAKE: 0xA433,
    LENS_MODEL: 0xA434
  };

  static GPS_TAGS = {
    LAT_REF: 0x0001,
    LATITUDE: 0x0002,
    LNG_REF: 0x0003,
    LONGITUDE: 0x0004,
    ALT_REF: 0x0005,
    ALTITUDE: 0x0006
  };

  static async extractFromFile(imageFile) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const dataView = new DataView(arrayBuffer);
          const exifData = this.parseExif(dataView);
          resolve(exifData);
        } catch (error) {
          resolve(this.getDefaultExifData(imageFile));
        }
      };
      reader.onerror = () => resolve(this.getDefaultExifData(imageFile));
      reader.readAsArrayBuffer(imageFile);
    });
  }

  static getDefaultExifData(file) {
    return {
      camera: null,
      lens: null,
      orientation: 1,
      captureTime: new Date(file.lastModified).toISOString(),
      gps: null,
      iso: null,
      aperture: null,
      shutterSpeed: null,
      focalLength: null
    };
  }

  static parseExif(dataView) {
    const exifData = this.getDefaultExifData({ lastModified: Date.now() });

    try {
      const exifOffset = this.findExifOffset(dataView);
      if (exifOffset === -1) return exifData;

      const tiffOffset = exifOffset + 6;
      const byteOrder = dataView.getUint16(tiffOffset, false);
      const littleEndian = byteOrder === 0x4949;
      
      if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) {
        return exifData;
      }

      const ifdOffset = dataView.getUint32(tiffOffset + 4, littleEndian);
      const ifdData = this.parseIFD(dataView, tiffOffset + ifdOffset, littleEndian, tiffOffset);
      
      return this.formatExifData(ifdData);
    } catch (error) {
      return exifData;
    }
  }

  static findExifOffset(dataView) {
    let offset = 2;
    
    while (offset < dataView.byteLength - 4) {
      if (dataView.getUint8(offset) === 0xFF && dataView.getUint8(offset + 1) === 0xE1) {
        const exifHeaderOffset = offset + 4;
        
        if (exifHeaderOffset + 6 < dataView.byteLength) {
          const exifHeader = String.fromCharCode(
            dataView.getUint8(exifHeaderOffset),
            dataView.getUint8(exifHeaderOffset + 1),
            dataView.getUint8(exifHeaderOffset + 2),
            dataView.getUint8(exifHeaderOffset + 3)
          );
          
          if (exifHeader === 'Exif') {
            return exifHeaderOffset;
          }
        }
      }
      offset += 2;
    }
    
    return -1;
  }

  static parseIFD(dataView, ifdOffset, littleEndian, tiffOffset) {
    const data = {};
    
    if (ifdOffset >= dataView.byteLength - 2) {
      return data;
    }

    const entryCount = dataView.getUint16(ifdOffset, littleEndian);
    
    for (let i = 0; i < Math.min(entryCount, 100); i++) {
      const entryOffset = ifdOffset + 2 + (i * 12);
      
      if (entryOffset + 12 > dataView.byteLength) break;
      
      const tag = dataView.getUint16(entryOffset, littleEndian);
      const type = dataView.getUint16(entryOffset + 2, littleEndian);
      const count = dataView.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;
      
      try {
        const value = this.readTagValue(dataView, tag, type, count, valueOffset, littleEndian, tiffOffset);
        if (value !== null) {
          data[tag] = value;
        }
      } catch (error) {
        continue;
      }
    }
    
    return data;
  }

  static readTagValue(dataView, tag, type, count, valueOffset, littleEndian, tiffOffset) {
    switch (tag) {
      case this.EXIF_TAGS.ORIENTATION:
        if (type === 3 && count === 1) {
          return dataView.getUint16(valueOffset, littleEndian);
        }
        break;
        
      case this.EXIF_TAGS.CAMERA_MAKE:
      case this.EXIF_TAGS.CAMERA_MODEL:
      case this.EXIF_TAGS.DATETIME:
      case this.EXIF_TAGS.LENS_MAKE:
      case this.EXIF_TAGS.LENS_MODEL:
        return this.readString(dataView, valueOffset, count, littleEndian, tiffOffset);
        
      case this.EXIF_TAGS.ISO:
        if (type === 3) {
          return dataView.getUint16(valueOffset, littleEndian);
        } else if (type === 4) {
          return dataView.getUint32(valueOffset, littleEndian);
        }
        break;
        
      case this.EXIF_TAGS.EXPOSURE_TIME:
      case this.EXIF_TAGS.F_NUMBER:
      case this.EXIF_TAGS.FOCAL_LENGTH:
        return this.readRational(dataView, valueOffset, littleEndian, tiffOffset);
        
      case this.EXIF_TAGS.GPS_IFD:
        if (type === 4 && count === 1) {
          const gpsIfdOffset = dataView.getUint32(valueOffset, littleEndian);
          if (tiffOffset + gpsIfdOffset < dataView.byteLength - 2) {
            return this.parseGPSIFD(dataView, tiffOffset + gpsIfdOffset, littleEndian, tiffOffset);
          }
        }
        break;
      default:
        return null;
    }
    
    return null;
  }

  static parseGPSIFD(dataView, gpsIfdOffset, littleEndian, tiffOffset) {
    try {
      const gpsEntryCount = dataView.getUint16(gpsIfdOffset, littleEndian);
      const gpsData = {};
      
      for (let i = 0; i < Math.min(gpsEntryCount, 20); i++) {
        const entryOffset = gpsIfdOffset + 2 + (i * 12);
        
        if (entryOffset + 12 > dataView.byteLength) break;
        
        const tag = dataView.getUint16(entryOffset, littleEndian);
        const type = dataView.getUint16(entryOffset + 2, littleEndian);
        const count = dataView.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = entryOffset + 8;
        
        switch (tag) {
          case this.GPS_TAGS.LAT_REF:
            gpsData.latRef = String.fromCharCode(dataView.getUint8(valueOffset));
            break;
          case this.GPS_TAGS.LATITUDE:
            gpsData.latitude = this.readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset);
            break;
          case this.GPS_TAGS.LNG_REF:
            gpsData.lngRef = String.fromCharCode(dataView.getUint8(valueOffset));
            break;
          case this.GPS_TAGS.LONGITUDE:
            gpsData.longitude = this.readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset);
            break;
          case this.GPS_TAGS.ALT_REF:
            gpsData.altRef = dataView.getUint8(valueOffset);
            break;
          case this.GPS_TAGS.ALTITUDE:
            gpsData.altitude = this.readRational(dataView, valueOffset, littleEndian, tiffOffset);
            break;
          default:
            break;
        }
      }
      
      if (gpsData.latitude && gpsData.longitude && gpsData.latRef && gpsData.lngRef) {
        return {
          latitude: this.dmsToDecimal(gpsData.latitude, gpsData.latRef),
          longitude: this.dmsToDecimal(gpsData.longitude, gpsData.lngRef),
          altitude: gpsData.altitude || 0
        };
      }
    } catch (error) {
      return null;
    }
    
    return null;
  }

  static readGPSCoordinate(dataView, valueOffset, count, type, littleEndian, tiffOffset) {
    if (type === 5 && count === 3) {
      const coordArrayOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
      
      if (coordArrayOffset + 24 > dataView.byteLength) {
        return [0, 0, 0];
      }
      
      const degrees = this.readRationalAt(dataView, coordArrayOffset, littleEndian);
      const minutes = this.readRationalAt(dataView, coordArrayOffset + 8, littleEndian);
      const seconds = this.readRationalAt(dataView, coordArrayOffset + 16, littleEndian);
      
      return [degrees, minutes, seconds];
    }
    
    return [0, 0, 0];
  }

  static readString(dataView, valueOffset, count, littleEndian, tiffOffset) {
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

  static readRational(dataView, valueOffset, littleEndian, tiffOffset) {
    try {
      let rationalOffset = valueOffset;
      if (valueOffset < tiffOffset + 8) {
        rationalOffset = tiffOffset + dataView.getUint32(valueOffset, littleEndian);
      }
      
      if (rationalOffset + 8 > dataView.byteLength) {
        return null;
      }
      
      return this.readRationalAt(dataView, rationalOffset, littleEndian);
    } catch (error) {
      return null;
    }
  }

  static readRationalAt(dataView, offset, littleEndian) {
    if (offset + 8 > dataView.byteLength) return 0;
    
    const numerator = dataView.getUint32(offset, littleEndian);
    const denominator = dataView.getUint32(offset + 4, littleEndian);
    
    return denominator !== 0 ? numerator / denominator : 0;
  }

  static dmsToDecimal(dmsArray, ref) {
    const [degrees, minutes, seconds] = dmsArray;
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    
    if (ref === 'S' || ref === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  }

  static formatExifData(ifdData) {
    const formatted = {
      camera: null,
      lens: null,
      orientation: ifdData[this.EXIF_TAGS.ORIENTATION] || 1,
      captureTime: null,
      gps: ifdData[this.EXIF_TAGS.GPS_IFD] || null,
      iso: ifdData[this.EXIF_TAGS.ISO] || null,
      aperture: null,
      shutterSpeed: null,
      focalLength: null
    };

    // Format camera info
    const make = ifdData[this.EXIF_TAGS.CAMERA_MAKE];
    const model = ifdData[this.EXIF_TAGS.CAMERA_MODEL];
    if (make || model) {
      formatted.camera = [make, model].filter(Boolean).join(' ').trim();
    }

    // Format lens info
    const lensMake = ifdData[this.EXIF_TAGS.LENS_MAKE];
    const lensModel = ifdData[this.EXIF_TAGS.LENS_MODEL];
    if (lensMake || lensModel) {
      formatted.lens = [lensMake, lensModel].filter(Boolean).join(' ').trim();
    }

    // Format capture time
    const dateTime = ifdData[this.EXIF_TAGS.DATETIME];
    if (dateTime) {
      try {
        const exifDate = dateTime.replace(/:/g, '-').replace(' ', 'T') + 'Z';
        formatted.captureTime = new Date(exifDate).toISOString();
      } catch (error) {
        formatted.captureTime = new Date().toISOString();
      }
    } else {
      formatted.captureTime = new Date().toISOString();
    }

    // Format aperture
    const aperture = ifdData[this.EXIF_TAGS.F_NUMBER];
    if (aperture) {
      formatted.aperture = aperture;
      formatted.apertureString = `f/${aperture.toFixed(1)}`;
    }

    // Format shutter speed
    const shutterSpeed = ifdData[this.EXIF_TAGS.EXPOSURE_TIME];
    if (shutterSpeed) {
      formatted.shutterSpeed = shutterSpeed;
      if (shutterSpeed < 1) {
        formatted.shutterSpeedString = `1/${Math.round(1/shutterSpeed)}`;
      } else {
        formatted.shutterSpeedString = `${shutterSpeed}s`;
      }
    }

    // Format focal length
    const focalLength = ifdData[this.EXIF_TAGS.FOCAL_LENGTH];
    if (focalLength) {
      formatted.focalLength = focalLength;
      formatted.focalLengthString = `${Math.round(focalLength)}mm`;
    }

    return formatted;
  }

  static getOrientationDescription(orientation) {
    const orientations = {
      1: 'Normal',
      2: 'Flip horizontal',
      3: 'Rotate 180°',
      4: 'Flip vertical',
      5: 'Rotate 90° CW + flip horizontal',
      6: 'Rotate 90° CW',
      7: 'Rotate 90° CCW + flip horizontal',
      8: 'Rotate 90° CCW'
    };
    return orientations[orientation] || `Unknown (${orientation})`;
  }
}