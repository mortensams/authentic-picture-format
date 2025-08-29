import { ExifExtractor } from './ExifExtractor';

describe('ExifExtractor', () => {
  describe('getDefaultExifData', () => {
    it('should return default structure with provided file', () => {
      const file = { lastModified: Date.now() };
      const result = ExifExtractor.getDefaultExifData(file);
      
      expect(result).toHaveProperty('camera', null);
      expect(result).toHaveProperty('orientation', 1);
      expect(result).toHaveProperty('captureTime');
      expect(result).toHaveProperty('gps', null);
    });
  });

  describe('getOrientationDescription', () => {
    it('should return correct orientation descriptions', () => {
      expect(ExifExtractor.getOrientationDescription(1)).toBe('Normal');
      expect(ExifExtractor.getOrientationDescription(3)).toBe('Rotate 180°');
      expect(ExifExtractor.getOrientationDescription(6)).toBe('Rotate 90° CW');
      expect(ExifExtractor.getOrientationDescription(8)).toBe('Rotate 90° CCW');
      expect(ExifExtractor.getOrientationDescription(99)).toContain('Unknown');
    });
  });

  describe('dmsToDecimal', () => {
    it('should convert DMS to decimal degrees correctly', () => {
      // 40° 42' 51" N = 40.714167
      const dms = [40, 42, 51];
      const result = ExifExtractor.dmsToDecimal(dms, 'N');
      expect(result).toBeCloseTo(40.714167, 5);
    });

    it('should handle negative directions', () => {
      const dms = [74, 0, 23];
      const result = ExifExtractor.dmsToDecimal(dms, 'W');
      expect(result).toBeCloseTo(-74.006389, 5);
    });
  });

  describe('readRationalAt', () => {
    it('should read rational values correctly', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 100, true); // numerator
      view.setUint32(4, 25, true);  // denominator
      
      const result = ExifExtractor.readRationalAt(view, 0, true);
      expect(result).toBe(4); // 100/25 = 4
    });

    it('should handle zero denominator', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 100, true);
      view.setUint32(4, 0, true);
      
      const result = ExifExtractor.readRationalAt(view, 0, true);
      expect(result).toBe(0);
    });
  });

  describe('findExifOffset', () => {
    it('should find EXIF marker in valid JPEG', () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      
      // JPEG SOI
      view.setUint8(0, 0xFF);
      view.setUint8(1, 0xD8);
      
      // APP1 marker
      view.setUint8(2, 0xFF);
      view.setUint8(3, 0xE1);
      
      // Length (not used in this test)
      view.setUint16(4, 0x0010, false);
      
      // EXIF header
      view.setUint8(6, 0x45); // E
      view.setUint8(7, 0x78); // x
      view.setUint8(8, 0x69); // i
      view.setUint8(9, 0x66); // f
      
      const offset = ExifExtractor.findExifOffset(view);
      expect(offset).toBe(6);
    });

    it('should return -1 when no EXIF found', () => {
      const buffer = new ArrayBuffer(10);
      const view = new DataView(buffer);
      
      const offset = ExifExtractor.findExifOffset(view);
      expect(offset).toBe(-1);
    });
  });

  describe('formatExifData', () => {
    it('should format camera info correctly', () => {
      const ifdData = {
        [ExifExtractor.EXIF_TAGS.CAMERA_MAKE]: 'Apple',
        [ExifExtractor.EXIF_TAGS.CAMERA_MODEL]: 'iPhone 14 Pro'
      };
      
      const result = ExifExtractor.formatExifData(ifdData);
      expect(result.camera).toBe('Apple iPhone 14 Pro');
    });

    it('should format aperture correctly', () => {
      const ifdData = {
        [ExifExtractor.EXIF_TAGS.F_NUMBER]: 2.8
      };
      
      const result = ExifExtractor.formatExifData(ifdData);
      expect(result.apertureString).toBe('f/2.8');
    });

    it('should format fast shutter speed correctly', () => {
      const ifdData = {
        [ExifExtractor.EXIF_TAGS.EXPOSURE_TIME]: 0.001
      };
      
      const result = ExifExtractor.formatExifData(ifdData);
      expect(result.shutterSpeedString).toBe('1/1000');
    });

    it('should format slow shutter speed correctly', () => {
      const ifdData = {
        [ExifExtractor.EXIF_TAGS.EXPOSURE_TIME]: 2
      };
      
      const result = ExifExtractor.formatExifData(ifdData);
      expect(result.shutterSpeedString).toBe('2s');
    });
  });
});