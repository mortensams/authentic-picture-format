import { useState, useCallback, useRef, useEffect } from 'react';
import { ExifExtractor } from '../utils/metadata/ExifExtractor';
import { WebCryptoUtils } from '../utils/crypto/WebCryptoUtils';
import { JPEGEmbedder } from '../utils/metadata/JPEGEmbedder';
import { PNGEmbedder } from '../utils/metadata/PNGEmbedder';
import { C2PAManifest } from '../utils/c2pa/C2PAManifest';
import appConfig from '../config/appConfig';

export function useImageProcessor() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [exifData, setExifData] = useState(null);
  const [certifiedImageBlob, setCertifiedImageBlob] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const previewUrlRef = useRef(null);

  // Define getImageDimensions first to avoid circular dependency
  const getImageDimensions = useCallback((file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: null, height: null });
      };
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Cleanup preview URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const processImage = useCallback(async (file) => {
    if (!file) return;

    console.log('=== Processing new image ===');
    console.log('File:', file.name, file.type, file.size);

    // Validate file size
    const maxSize = appConfig.ui.maxImageSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`Image size exceeds ${appConfig.ui.maxImageSizeMB}MB limit`);
      return;
    }

    // Validate file type
    if (!appConfig.ui.supportedFormats.includes(file.type.toLowerCase())) {
      setError('Unsupported image format. Please use JPEG or PNG.');
      return;
    }

    // Clear previous certification when processing new image
    console.log('Clearing previous certification data...');
    setCertifiedImageBlob(null);
    setIsProcessing(true);
    setError(null);

    try {
      // Cleanup previous preview URL
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      // Create new preview
      const preview = URL.createObjectURL(file);
      previewUrlRef.current = preview;
      setImagePreview(preview);
      setImage(file);

      // Extract EXIF data
      const exif = await ExifExtractor.extractFromFile(file);
      setExifData(exif);

      return { file, exif };
    } catch (err) {
      setError(`Failed to process image: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const certifyImage = useCallback(async (certificate, description) => {
    console.log('=== Starting Image Certification ===');
    console.log('Certificate:', certificate ? 'Present' : 'Missing');
    console.log('Description:', description);
    console.log('Image:', image ? `${image.name} (${image.size} bytes)` : 'Missing');
    
    if (!image || !certificate || !description?.trim()) {
      setError('Missing required data for certification');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log('Step 1: Reading image buffer...');
      const originalBuffer = await image.arrayBuffer();
      console.log('Image buffer size:', originalBuffer.byteLength);
      
      console.log('Step 2: Hashing image data...');
      const imageHash = await WebCryptoUtils.hashImageData(originalBuffer);
      console.log('Image hash generated:', imageHash.length, 'bytes');

      // Create proper C2PA manifest
      const imageDataWithHash = {
        hash: Array.from(imageHash)
        // Note: Don't include the buffer itself in the manifest!
      };

      console.log('Step 3: Creating C2PA manifest...');
      // Create a clean certificate copy without keyPair for manifest
      const cleanCertificate = {
        tbsCertificate: certificate.tbsCertificate,
        signatureAlgorithm: certificate.signatureAlgorithm,
        signatureValue: certificate.signatureValue,
        fingerprint: certificate.fingerprint,
        isSelfSigned: certificate.isSelfSigned
      };
      
      let manifest = await C2PAManifest.createManifest(
        imageDataWithHash,
        cleanCertificate,
        description.trim(),
        exifData
      );
      console.log('Manifest created successfully');

      console.log('Step 4: Signing manifest...');
      // Pass the full certificate with keyPair for signing
      manifest = await C2PAManifest.signManifest(manifest, certificate);
      console.log('Manifest signed successfully');

      console.log('Step 5: Creating certification data...');
      // Create certification data including EXIF and all signed metadata
      const certificationData = {
        manifestId: manifest.active_manifest,
        signature: manifest.manifests[manifest.active_manifest].claim_signature.signature,
        timestamp: new Date().toISOString(),
        description: description.trim(),
        certFingerprint: certificate.fingerprint?.sha256 || 'unknown',
        // Include the EXIF data that was signed
        exifData: exifData || null,
        // Include image hash for integrity verification
        imageHash: Array.from(imageHash)
      };
      console.log('Certification data created:', certificationData);
      console.log('EXIF data included:', exifData ? 'Yes' : 'No');
      if (exifData) {
        console.log('EXIF dateTaken:', exifData.dateTaken);
        console.log('Full EXIF data:', JSON.stringify(exifData, null, 2));
      }

      console.log('Step 6: Embedding certification in image...');
      let certifiedImageBuffer;
      const imageType = image.type.toLowerCase();
      console.log('Image type:', imageType);
      
      if (imageType.includes('jpeg') || imageType.includes('jpg')) {
        console.log('Embedding in JPEG...');
        certifiedImageBuffer = await JPEGEmbedder.embedCertification(originalBuffer, certificationData);
      } else if (imageType.includes('png')) {
        console.log('Embedding in PNG...');
        certifiedImageBuffer = await PNGEmbedder.embedCertification(originalBuffer, certificationData);
      } else {
        throw new Error(`Unsupported format: ${imageType}`);
      }
      console.log('Certification embedded successfully');

      console.log('Step 7: Creating certified blob...');
      const certifiedBlob = new Blob([certifiedImageBuffer], { type: image.type });
      console.log('Certified blob size:', certifiedBlob.size);
      setCertifiedImageBlob(certifiedBlob);
      
      console.log('=== Certification Complete ===');
      console.log('Certified blob has been set in state');
      return certifiedBlob;
    } catch (err) {
      console.error('Certification error:', err);
      console.error('Error stack:', err.stack);
      setError(`Certification failed: ${err.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [image, exifData]);

  const downloadCertifiedImage = useCallback(() => {
    if (!certifiedImageBlob || !image) {
      setError('No certified image available for download');
      return;
    }

    try {
      const url = URL.createObjectURL(certifiedImageBlob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = `certified_${image.name}`;
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      return true;
    } catch (err) {
      setError(`Download failed: ${err.message}`);
      return false;
    }
  }, [certifiedImageBlob, image]);

  const reset = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setImage(null);
    setImagePreview(null);
    setExifData(null);
    setCertifiedImageBlob(null);
    setError(null);
  }, []);

  return {
    image,
    imagePreview,
    exifData,
    certifiedImageBlob,
    isProcessing,
    error,
    processImage,
    certifyImage,
    downloadCertifiedImage,
    reset
  };
}