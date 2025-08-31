export class ExifExtractor {
  static EXIF_TAGS = {
    ORIENTATION: 0x0112,
    CAMERA_MAKE: 0x010F,
    CAMERA_MODEL: 0x0110,
    ISO: 0x8827,
    DATETIME: 0x0132,
    DATETIME_ORIGINAL: 0x9003,  // DateTimeOriginal - when photo was taken
    DATETIME_DIGITIZED: 0x9004, // DateTimeDigitized
    EXPOSURE_TIME: 0x829A,
    F_NUMBER: 0x829D,
    FOCAL_LENGTH: 0x920A,
    GPS_IFD: 0x8825,
    LENS_MAKE: 0xA433,
    LENS_MODEL: 0xA434,
    IMAGE_WIDTH: 0x0100,
    IMAGE_HEIGHT: 0x0101,
    SOFTWARE: 0x0131,
    EXPOSURE_BIAS: 0x9204,  // Exposure compensation
    WHITE_BALANCE: 0x9208,
    EXIF_IFD: 0x8769  // Pointer to EXIF sub-IFD
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
    console.log('ExifExtractor: Extracting from file:', imageFile.name, imageFile.type);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const dataView = new DataView(arrayBuffer);
          
          // Check if it's a PNG file
          const isPNG = this.isPNGFile(dataView);
          
          if (isPNG) {
            console.log('ExifExtractor: PNG file detected, returning default data');
            // PNG files typically don't have EXIF data in the same way as JPEG
            // They may have metadata in tEXt/iTXt chunks, but that's different
            resolve(this.getDefaultExifData(imageFile));
          } else {
            const exifData = this.parseExif(dataView);
            console.log('ExifExtractor: Parsed EXIF data:', exifData);
            console.log('ExifExtractor: dateTaken:', exifData.dateTaken);
            resolve(exifData);
          }
        } catch (error) {
          console.error('ExifExtractor: Error parsing EXIF:', error);
          resolve(this.getDefaultExifData(imageFile));
        }
      };
      reader.onerror = () => {
        console.error('ExifExtractor: FileReader error');
        resolve(this.getDefaultExifData(imageFile));
      };
      reader.readAsArrayBuffer(imageFile);
    });
  }
  
  static isPNGFile(dataView) {
    // PNG signature: 137 80 78 71 13 10 26 10
    if (dataView.byteLength < 8) return false;
    return dataView.getUint8(0) === 137 &&
           dataView.getUint8(1) === 80 &&
           dataView.getUint8(2) === 78 &&
           dataView.getUint8(3) === 71 &&
           dataView.getUint8(4) === 13 &&
           dataView.getUint8(5) === 10 &&
           dataView.getUint8(6) === 26 &&
           dataView.getUint8(7) === 10;
  }

  static getDefaultExifData(file) {
    return {
      camera: null,
      lens: null,
      orientation: 1,
      dateTaken: new Date(file.lastModified).toISOString(),
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
      
      // Parse EXIF sub-IFD if present
      if (ifdData[this.EXIF_TAGS.EXIF_IFD]) {
        const exifSubIfdOffset = tiffOffset + ifdData[this.EXIF_TAGS.EXIF_IFD];
        const exifSubData = this.parseIFD(dataView, exifSubIfdOffset, littleEndian, tiffOffset);
        // Merge sub-IFD data into main data
        Object.assign(ifdData, exifSubData);
      }
      
      return this.formatExifData(ifdData);
    } catch (error) {
      return exifData;
    }
  }

  static findExifOffset(dataView) {
    // JPEG files start with SOI marker (0xFFD8)
    if (dataView.getUint8(0) !== 0xFF || dataView.getUint8(1) !== 0xD8) {
      console.log('ExifExtractor: Not a valid JPEG file');
      return -1;
    }
    
    let offset = 2;
    
    while (offset < dataView.byteLength - 4) {
      if (dataView.getUint8(offset) === 0xFF) {
        const marker = dataView.getUint8(offset + 1);
        
        // APP1 marker (0xE1) is where EXIF data is stored
        if (marker === 0xE1) {
          const segmentLength = (dataView.getUint8(offset + 2) << 8) | dataView.getUint8(offset + 3);
          const exifHeaderOffset = offset + 4;
          
          if (exifHeaderOffset + 6 < dataView.byteLength) {
            const exifHeader = String.fromCharCode(
              dataView.getUint8(exifHeaderOffset),
              dataView.getUint8(exifHeaderOffset + 1),
              dataView.getUint8(exifHeaderOffset + 2),
              dataView.getUint8(exifHeaderOffset + 3)
            );
            
            if (exifHeader === 'Exif') {
              console.log('ExifExtractor: Found EXIF at offset:', exifHeaderOffset);
              return exifHeaderOffset;
            }
          }
        } else if (marker >= 0xE0 && marker <= 0xEF) {
          // Skip other APP segments
          const segmentLength = (dataView.getUint8(offset + 2) << 8) | dataView.getUint8(offset + 3);
          offset += segmentLength + 2;
          continue;
        } else if (marker === 0xDB || marker === 0xC0 || marker === 0xC2 || 
                   marker === 0xC4 || marker === 0xDD || marker === 0xDA) {
          // We've reached image data, no EXIF found
          console.log('ExifExtractor: Reached image data without finding EXIF');
          return -1;
        }
      }
      offset++;
    }
    
    console.log('ExifExtractor: No EXIF data found in file');
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
      case this.EXIF_TAGS.DATETIME_ORIGINAL:
      case this.EXIF_TAGS.DATETIME_DIGITIZED:
      case this.EXIF_TAGS.SOFTWARE:
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
      case this.EXIF_TAGS.EXIF_IFD:
        if (type === 4 && count === 1) {
          // Return the offset value for IFD pointers
          if (tag === this.EXIF_TAGS.GPS_IFD) {
            const gpsIfdOffset = dataView.getUint32(valueOffset, littleEndian);
            if (tiffOffset + gpsIfdOffset < dataView.byteLength - 2) {
              return this.parseGPSIFD(dataView, tiffOffset + gpsIfdOffset, littleEndian, tiffOffset);
            }
          } else {
            // For EXIF_IFD, just return the offset value
            return dataView.getUint32(valueOffset, littleEndian);
          }
        }
        break;
        
      case this.EXIF_TAGS.IMAGE_WIDTH:
      case this.EXIF_TAGS.IMAGE_HEIGHT:
        if (type === 3) {
          return dataView.getUint16(valueOffset, littleEndian);
        } else if (type === 4) {
          return dataView.getUint32(valueOffset, littleEndian);
        }
        break;
        
      case this.EXIF_TAGS.EXPOSURE_BIAS:
        return this.readRational(dataView, valueOffset, littleEndian, tiffOffset);
        
      case this.EXIF_TAGS.WHITE_BALANCE:
        if (type === 3) {
          return dataView.getUint16(valueOffset, littleEndian);
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
      dateTaken: null,  // Changed from captureTime to dateTaken for consistency
      gps: ifdData[this.EXIF_TAGS.GPS_IFD] || null,
      iso: ifdData[this.EXIF_TAGS.ISO] || null,
      aperture: null,
      shutterSpeed: null,
      focalLength: null,
      // Additional fields for completeness
      width: null,
      height: null,
      software: null,
      exposureCompensation: null,
      whiteBalance: null
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

    // Format capture time - now as dateTaken
    // Try DateTimeOriginal first (when photo was taken), then DateTime (file modified), then DateTimeDigitized
    const dateTimeOriginal = ifdData[this.EXIF_TAGS.DATETIME_ORIGINAL];
    const dateTime = ifdData[this.EXIF_TAGS.DATETIME];
    const dateTimeDigitized = ifdData[this.EXIF_TAGS.DATETIME_DIGITIZED];
    
    const dateToUse = dateTimeOriginal || dateTime || dateTimeDigitized;
    if (dateToUse) {
      try {
        // EXIF date format is typically "YYYY:MM:DD HH:MM:SS"
        const exifDate = dateToUse.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        formatted.dateTaken = new Date(exifDate).toISOString();
      } catch (error) {
        formatted.dateTaken = null;  // Don't default to current date if parsing fails
      }
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

    // Add image dimensions
    const width = ifdData[this.EXIF_TAGS.IMAGE_WIDTH];
    const height = ifdData[this.EXIF_TAGS.IMAGE_HEIGHT];
    if (width) formatted.width = width;
    if (height) formatted.height = height;

    // Add software
    const software = ifdData[this.EXIF_TAGS.SOFTWARE];
    if (software) formatted.software = software;

    // Add exposure compensation
    const exposureBias = ifdData[this.EXIF_TAGS.EXPOSURE_BIAS];
    if (exposureBias !== undefined && exposureBias !== null) {
      formatted.exposureCompensation = exposureBias;
    }

    // Add white balance
    const whiteBalance = ifdData[this.EXIF_TAGS.WHITE_BALANCE];
    if (whiteBalance !== undefined) {
      formatted.whiteBalance = whiteBalance === 0 ? 'Auto' : 'Manual';
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