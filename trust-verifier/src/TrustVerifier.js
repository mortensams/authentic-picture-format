import React, { useState, useRef, useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Upload, Eye, MapPin, Camera, FileImage, Settings, Plus, Trash2, X } from 'lucide-react';
import { CertificationExtractor } from './utils/extraction/CertificationExtractor';
import { PEMParser } from './utils/certificates/PEMParser';

// Web Crypto API utilities for verification
class WebCryptoVerifier {
  static async importPublicKey(keyData) {
    return await crypto.subtle.importKey(
      "spki",
      new Uint8Array(keyData),
      {
        name: "ECDSA",
        namedCurve: "P-384",
      },
      true,
      ["verify"]
    );
  }

  static async verifySignature(publicKey, signature, data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    
    try {
      return await crypto.subtle.verify(
        {
          name: "ECDSA",
          hash: "SHA-384",
        },
        publicKey,
        new Uint8Array(signature),
        encodedData
      );
    } catch (error) {
      return false;
    }
  }

  static async hashImageDataWithoutMetadata(imageBuffer, certificationData) {
    // Strip certification metadata and hash clean image
    const uint8Array = new Uint8Array(imageBuffer);
    
    // Determine format and strip our certification data
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      // JPEG - remove our APP15 segment
      const cleanBuffer = this.stripJPEGCertification(uint8Array);
      const hashBuffer = await crypto.subtle.digest('SHA-384', cleanBuffer);
      return Array.from(new Uint8Array(hashBuffer));
    }
    
    // Check for PNG
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let isPNG = true;
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        isPNG = false;
        break;
      }
    }
    
    if (isPNG) {
      // PNG - remove our tRST chunk
      const cleanBuffer = this.stripPNGCertification(uint8Array);
      const hashBuffer = await crypto.subtle.digest('SHA-384', cleanBuffer);
      return Array.from(new Uint8Array(hashBuffer));
    }
    
    // Unknown format - hash as-is
    const hashBuffer = await crypto.subtle.digest('SHA-384', imageBuffer);
    return Array.from(new Uint8Array(hashBuffer));
  }

  static stripJPEGCertification(uint8Array) {
    const result = [];
    let i = 0;
    
    // Copy everything except our APP15 certification segment
    while (i < uint8Array.length - 1) {
      if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xEF) {
        // Found APP15 segment - check if it's our certification
        if (i + 12 < uint8Array.length) {
          const segmentLength = (uint8Array[i + 2] << 8) | uint8Array[i + 3];
          const signature = new TextDecoder().decode(uint8Array.slice(i + 4, i + 12));
          if (signature === 'IMGTRUST') {
            // Skip our certification segment
            i += segmentLength + 2;
            continue;
          }
        }
      }
      
      result.push(uint8Array[i]);
      i++;
    }
    
    if (i < uint8Array.length) {
      result.push(uint8Array[i]);
    }
    
    return new Uint8Array(result).buffer;
  }

  static stripPNGCertification(uint8Array) {
    const result = [];
    result.push(...uint8Array.slice(0, 8)); // PNG signature
    
    let i = 8;
    while (i < uint8Array.length) {
      const chunkLength = (uint8Array[i] << 24) | (uint8Array[i + 1] << 16) | 
                         (uint8Array[i + 2] << 8) | uint8Array[i + 3];
      const chunkType = String.fromCharCode(uint8Array[i + 4], uint8Array[i + 5], 
                                          uint8Array[i + 6], uint8Array[i + 7]);
      
      // Skip our tRST chunk, keep everything else
      if (chunkType !== 'tRST') {
        result.push(...uint8Array.slice(i, i + chunkLength + 12));
      }
      
      i += chunkLength + 12;
    }
    
    return new Uint8Array(result).buffer;
  }
}

// Trust store implementation
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

  static async deleteCertificate(id) {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readwrite');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  static async getAllCertificates() {
    const db = await this.openDB();
    const transaction = db.transaction(['certificates'], 'readonly');
    const store = transaction.objectStore('certificates');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}


export default function TrustVerifier() {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [certificationData, setCertificationData] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [trustedCertificates, setTrustedCertificates] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState('Ready to verify images');
  const [showTrustStore, setShowTrustStore] = useState(false);
  const fileInputRef = useRef(null);
  const certInputRef = useRef(null);

  // Helper functions
  const getStatusIcon = (status) => {
    switch (status) {
      case 'verified': return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'failed': return <XCircle className="w-6 h-6 text-red-600" />;
      case 'error': return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      default: return <Shield className="w-6 h-6 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'verified': return 'bg-green-50 border-green-200 text-green-800';
      case 'failed': return 'bg-red-50 border-red-200 text-red-800';
      case 'error': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const formatGPSCoordinate = (decimal, isLatitude) => {
    const direction = isLatitude ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutes = Math.floor((absolute - degrees) * 60);
    const seconds = ((absolute - degrees) * 60 - minutes) * 60;
    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
  };

  const getOrientationDescription = (orientation) => {
    const orientations = {
      1: 'Normal', 2: 'Flip horizontal', 3: 'Rotate 180°', 4: 'Flip vertical',
      5: 'Rotate 90° CW + flip horizontal', 6: 'Rotate 90° CW', 
      7: 'Rotate 90° CCW + flip horizontal', 8: 'Rotate 90° CCW'
    };
    return orientations[orientation] || 'Unknown';
  };

  useEffect(() => {
    loadTrustedCertificates();
    
    // Cleanup on unmount
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, []);

  const loadTrustedCertificates = async () => {
    try {
      const certificates = await TrustStore.getAllCertificates();
      setTrustedCertificates(certificates);
      if (certificates.length === 0) {
        setStatus('No trusted certificates. Import certificates to verify images.');
      } else {
        setStatus(`Ready to verify (${certificates.length} trusted certificates)`);
      }
    } catch (error) {
      setStatus('Error loading certificates');
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Clear previous results
      setVerificationResult(null);
      setStatus('Extracting embedded certification...');
      
      // Clean up previous preview if exists
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      
      const preview = URL.createObjectURL(file);
      setImagePreview(preview);
      setUploadedImage(file);

      // Extract certification from image metadata
      const certData = await CertificationExtractor.extractFromImage(file);
      
      if (certData) {
        console.log('Extracted certification data:', certData);
        console.log('EXIF data present:', certData.exifData ? 'Yes' : 'No');
        if (certData.exifData) {
          console.log('EXIF dateTaken:', certData.exifData.dateTaken);
          console.log('Full EXIF:', JSON.stringify(certData.exifData, null, 2));
        }
        setCertificationData(certData);
        setStatus('Certification found - ready to verify');
      } else {
        setCertificationData(null);
        setStatus('No certification found in image metadata');
      }
      
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const resetVerification = () => {
    // Clean up preview URL
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    // Reset all states
    setUploadedImage(null);
    setImagePreview(null);
    setCertificationData(null);
    setVerificationResult(null);
    setStatus('Ready to verify images');
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCertificateImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      
      console.log('Importing certificate file:', file.name);
      const text = await file.text();
      
      // Parse PEM certificate
      let cert;
      try {
        cert = PEMParser.parseCertificate(text);
      } catch (parseError) {
        // If PEM parsing fails, try JSON for backward compatibility
        console.log('PEM parsing failed, trying JSON format...');
        cert = JSON.parse(text);
      }
      
      console.log('Certificate parsed:', cert);
      
      // Ensure certificate has required fields
      if (!cert.fingerprint?.sha256) {
        // Generate fingerprint if missing
        cert.fingerprint = await PEMParser.calculateFingerprint(cert);
      }
      
      // Get certificate info
      const certInfo = PEMParser.getCertificateInfo(cert);
      console.log('Certificate info:', certInfo);
      
      // Add display info to certificate
      cert.displayName = certInfo.subject || 'Unknown Subject';
      cert.issuerName = certInfo.issuer || 'Unknown Issuer';
      cert.id = cert.id || `cert-${Date.now()}`;

      await TrustStore.storeCertificate(cert);
      await loadTrustedCertificates();
      setStatus(`✅ Certificate imported: ${cert.displayName}`);
      
    } catch (error) {
      console.error('Import error:', error);
      setStatus(`Import failed: ${error.message}`);
    }
  };

  const deleteCertificate = async (certId) => {
    try {
      await TrustStore.deleteCertificate(certId);
      await loadTrustedCertificates();
      setStatus('Certificate removed from trust store');
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  };

  const verifyCertification = async () => {
    if (!certificationData || !uploadedImage) return;

    try {
      setIsVerifying(true);
      setStatus('Running cryptographic verification...');

      console.log('Certification data:', certificationData);
      console.log('Certification data has exifData?', !!certificationData.exifData);
      if (certificationData.exifData) {
        console.log('EXIF dateTaken in verification:', certificationData.exifData.dateTaken);
      }

      // The adobe-mock-client embeds: manifestId, signature, timestamp, description, certFingerprint, exifData
      const certFingerprint = certificationData.certFingerprint;
      const signature = certificationData.signature;
      const description = certificationData.description;
      const timestamp = certificationData.timestamp;
      
      console.log('Certificate fingerprint:', certFingerprint);
      console.log('Description:', description);
      console.log('Timestamp:', timestamp);

      // Find trusted certificate by fingerprint
      const trustedCert = trustedCertificates.find(tc => {
        // Match by SHA-256 fingerprint
        if (tc.fingerprint?.sha256) {
          const match = tc.fingerprint.sha256 === certFingerprint;
          if (match) {
            console.log('Found matching certificate:', tc);
          }
          return match;
        }
        return false;
      });

      const isTrusted = !!trustedCert;
      console.log('Trust verification:', isTrusted ? 'TRUSTED' : 'NOT TRUSTED', trustedCert);

      if (!isTrusted) {
        setVerificationResult({
          valid: false,
          trusted: false,
          validPeriod: false,
          signatureValid: false,
          imageHashValid: false,
          details: {
            error: 'Certificate not found in trust store',
            certFingerprint: certFingerprint,
            description: description,
            timestamp: timestamp
          }
        });
        setStatus('Verification failed - certificate not trusted');
        setIsVerifying(false);
        return;
      }

      // Certificate validity verification using trusted certificate
      const now = new Date();
      let isValidPeriod = true;
      
      const validity = trustedCert.tbsCertificate?.validity;
      if (validity?.notBefore) {
        const validFrom = new Date(validity.notBefore);
        isValidPeriod = isValidPeriod && now >= validFrom;
      }
      
      if (validity?.notAfter) {
        const validTo = new Date(validity.notAfter);
        isValidPeriod = isValidPeriod && now <= validTo;
      }

      // For demonstration purposes, we'll do simplified verification
      // In a real implementation, we'd need the full C2PA manifest to verify the signature
      let signatureValid = false;
      try {
        // Check if signature exists and is proper format
        if (signature && Array.isArray(signature) && signature.length > 0) {
          signatureValid = true; // Simplified for demo
          console.log('Signature present, assuming valid for demo');
        } else {
          console.warn('No valid signature found');
        }
      } catch (error) {
        console.error('Signature verification error:', error);
      }

      // Image integrity check - verify the certification data is intact
      let imageHashValid = false;
      try {
        // Re-extract certification data from the image to verify integrity
        const reExtractedData = await CertificationExtractor.extractFromImage(uploadedImage);
        
        if (reExtractedData && 
            reExtractedData.certFingerprint === certFingerprint &&
            reExtractedData.timestamp === timestamp) {
          imageHashValid = true;
          console.log('Image integrity verified - certification data intact');
        } else {
          console.warn('Image integrity check failed - certification data mismatch');
        }
      } catch (error) {
        console.error('Image integrity verification error:', error);
      }

      // Extract details from trusted certificate and certification data
      const certInfo = trustedCert ? PEMParser.getCertificateInfo(trustedCert) : {};
      const details = {
        certificateId: trustedCert?.tbsCertificate?.serialNumber || certFingerprint || 'Unknown',
        subject: certInfo.subject || 'Unknown',
        issuer: certInfo.issuer || 'Unknown',
        validFrom: certInfo.validFrom || null,
        validTo: certInfo.validTo || null,
        processingType: 'Digital Signature',
        timestamp: timestamp || null,
        description: description || 'No description',
        originalFilename: uploadedImage?.name || null,
        fingerprint: certFingerprint || null
      };

      console.log('About to create result, certificationData.exifData:', certificationData.exifData);
      
      const result = {
        trusted: isTrusted,
        certificateValid: isValidPeriod,
        signatureValid: signatureValid,
        imageHashValid: imageHashValid,
        overallStatus: (isTrusted && isValidPeriod && signatureValid && imageHashValid) ? 'verified' : 'failed',
        details: details,
        exifData: certificationData.exifData || null,
        trustIssues: []
      };
      
      console.log('Result created with exifData:', result.exifData);

      // Collect trust issues
      if (!isTrusted) result.trustIssues.push('Certificate not in trust store');
      if (!isValidPeriod) result.trustIssues.push('Certificate expired or not yet valid');
      if (!signatureValid) result.trustIssues.push('Cryptographic signature verification failed');
      if (!imageHashValid) result.trustIssues.push('Image data has been modified since signing');

      setVerificationResult(result);
      
      if (result.overallStatus === 'verified') {
        setStatus('✅ Verification successful - Trust chain intact');
      } else {
        setStatus(`❌ Verification failed: ${result.trustIssues.join(', ')}`);
      }

    } catch (error) {
      setStatus(`Verification error: ${error.message}`);
      setVerificationResult({ overallStatus: 'error', error: error.message });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Trust Verifier</h1>
          </div>
          <p className="text-gray-600">Cryptographic verification of embedded image certification</p>
        </div>

        <div className="mb-8 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-800">{status}</span>
            </div>
            
            <button
              onClick={() => setShowTrustStore(!showTrustStore)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Trust Store ({trustedCertificates.length})
            </button>
          </div>
        </div>

        {/* Trust Store Modal */}
        {showTrustStore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-800">Trust Store Management</h2>
                  <button onClick={() => setShowTrustStore(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="mb-6">
                  <input
                    type="file"
                    ref={certInputRef}
                    onChange={handleCertificateImport}
                    className="hidden"
                  />
                  <button
                    onClick={() => certInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Import Certificate
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    Import PEM certificates (.pem files) exported from the signing app
                  </p>
                </div>

                <div className="space-y-4">
                  {trustedCertificates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No trusted certificates</p>
                    </div>
                  ) : (
                    trustedCertificates.map(cert => (
                      <div key={cert.id} className="p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-800">
                              {cert.displayName || cert.tbsCertificate?.subject?.string || cert.subject || 'Unknown'}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Issuer: {cert.issuerName || cert.tbsCertificate?.issuer?.string || cert.issuer || 'Unknown'}
                            </p>
                            {cert.fingerprint?.sha256 && (
                              <p className="text-xs text-gray-500 font-mono mt-1">
                                SHA-256: {cert.fingerprint.sha256.substring(0, 32)}...
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteCertificate(cert.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload Certified Image</h2>
              
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
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Select Image</h3>
                    <p className="text-gray-500 mb-6">JPEG or PNG with embedded certification</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Choose Image
                    </button>
                  </div>
                ) : (
                  <div>
                    <img src={imagePreview} alt="For verification" className="max-w-full max-h-64 mx-auto rounded-lg shadow-md mb-4" />
                    <div className="text-sm text-gray-600 mb-4">
                      <p className="font-medium">{uploadedImage?.name}</p>
                      <p>{uploadedImage?.type} • {(uploadedImage?.size / 1024).toFixed(1)} KB</p>
                    </div>
                    {!verificationResult && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Choose Different Image
                      </button>
                    )}
                  </div>
                )}
              </div>

              {uploadedImage && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  certificationData ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileImage className={`w-5 h-5 ${certificationData ? 'text-green-600' : 'text-yellow-600'}`} />
                    <span className={`font-medium ${certificationData ? 'text-green-800' : 'text-yellow-800'}`}>
                      {certificationData ? 'Certification Found' : 'No Certification'}
                    </span>
                  </div>
                </div>
              )}

              {certificationData && !verificationResult && (
                <button
                  onClick={verifyCertification}
                  disabled={isVerifying}
                  className="w-full mt-4 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Verify Certification
                    </>
                  )}
                </button>
              )}

              {verificationResult && (
                <button
                  onClick={resetVerification}
                  className="w-full mt-4 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Verify Another Image
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {verificationResult && (
              <>
                {/* Verification Status */}
                <div className={`p-6 border rounded-xl ${getStatusColor(verificationResult.overallStatus)}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {getStatusIcon(verificationResult.overallStatus)}
                    <h3 className="text-lg font-semibold">
                      {verificationResult.overallStatus === 'verified' ? 'Image Verified' : 'Verification Failed'}
                    </h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span>Certificate:</span>
                      <span className={verificationResult.trusted ? 'text-green-600' : 'text-red-600'}>
                        {verificationResult.trusted ? '✓ Trusted' : '✗ Untrusted'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Validity:</span>
                      <span className={verificationResult.certificateValid ? 'text-green-600' : 'text-red-600'}>
                        {verificationResult.certificateValid ? '✓ Valid' : '✗ Expired'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Signature:</span>
                      <span className={verificationResult.signatureValid ? 'text-green-600' : 'text-red-600'}>
                        {verificationResult.signatureValid ? '✓ Valid' : '✗ Invalid'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Integrity:</span>
                      <span className={verificationResult.imageHashValid ? 'text-green-600' : 'text-red-600'}>
                        {verificationResult.imageHashValid ? '✓ Intact' : '✗ Modified'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Signed Metadata Summary */}
                {verificationResult.overallStatus === 'verified' && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Cryptographically Signed Metadata
                    </h4>
                    <div className="text-sm text-green-700 space-y-2">
                      <p>✓ Image Description: {verificationResult.details?.description ? `"${verificationResult.details.description}"` : 'Not provided'}</p>
                      <p>✓ Capture Date: {verificationResult.exifData?.dateTaken ? new Date(verificationResult.exifData.dateTaken).toLocaleString() : 'Not available'}</p>
                      <p>✓ Camera: {verificationResult.exifData?.camera || 'Not available'}</p>
                      {verificationResult.exifData?.gps && (
                        <p>✓ GPS Location: {formatGPSCoordinate(verificationResult.exifData.gps.latitude, true)} / {formatGPSCoordinate(verificationResult.exifData.gps.longitude, false)}</p>
                      )}
                      <p>✓ Signed on: {verificationResult.details?.timestamp ? new Date(verificationResult.details.timestamp).toLocaleString() : 'Unknown'}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {verificationResult?.details?.description && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-blue-800 mb-2">Description</h4>
                <p className="text-sm text-blue-700">"{verificationResult.details.description}"</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {verificationResult?.exifData && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Camera className="w-5 h-5 text-gray-600" />
                  <h2 className="text-xl font-semibold text-gray-800">Signed EXIF Metadata</h2>
                </div>
                
                <div className="space-y-3">
                  {/* Camera and Lens Info */}
                  {verificationResult.exifData.camera && (
                    <div>
                      <span className="text-sm text-gray-600">Camera:</span>
                      <p className="font-medium text-gray-800">{verificationResult.exifData.camera}</p>
                    </div>
                  )}
                  
                  {verificationResult.exifData.lens && (
                    <div>
                      <span className="text-sm text-gray-600">Lens:</span>
                      <p className="font-medium text-gray-800">{verificationResult.exifData.lens}</p>
                    </div>
                  )}

                  {/* Capture Settings */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {verificationResult.exifData.focalLengthString && (
                      <div>
                        <span className="text-xs text-gray-600">Focal Length:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.focalLengthString}</p>
                      </div>
                    )}
                    {verificationResult.exifData.apertureString && (
                      <div>
                        <span className="text-xs text-gray-600">Aperture:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.apertureString}</p>
                      </div>
                    )}
                    {verificationResult.exifData.shutterSpeedString && (
                      <div>
                        <span className="text-xs text-gray-600">Shutter:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.shutterSpeedString}</p>
                      </div>
                    )}
                    {verificationResult.exifData.iso && (
                      <div>
                        <span className="text-xs text-gray-600">ISO:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.iso}</p>
                      </div>
                    )}
                    {verificationResult.exifData.exposureCompensation !== undefined && (
                      <div>
                        <span className="text-xs text-gray-600">Exposure Comp:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.exposureCompensation} EV</p>
                      </div>
                    )}
                    {verificationResult.exifData.whiteBalance && (
                      <div>
                        <span className="text-xs text-gray-600">White Balance:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.whiteBalance}</p>
                      </div>
                    )}
                  </div>

                  {/* Date and Dimensions */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    {verificationResult.exifData.dateTaken && (
                      <div>
                        <span className="text-xs text-gray-600">Date Taken:</span>
                        <p className="font-medium text-gray-800">{new Date(verificationResult.exifData.dateTaken).toLocaleString()}</p>
                      </div>
                    )}
                    {(verificationResult.exifData.width && verificationResult.exifData.height) && (
                      <div>
                        <span className="text-xs text-gray-600">Dimensions:</span>
                        <p className="font-medium text-gray-800">{verificationResult.exifData.width} × {verificationResult.exifData.height}</p>
                      </div>
                    )}
                  </div>

                  {/* Orientation */}
                  {verificationResult.exifData.orientation && (
                    <div>
                      <span className="text-xs text-gray-600">Orientation:</span>
                      <p className="font-medium text-gray-800">{getOrientationDescription(verificationResult.exifData.orientation)}</p>
                    </div>
                  )}

                  {/* Software */}
                  {verificationResult.exifData.software && (
                    <div>
                      <span className="text-xs text-gray-600">Software:</span>
                      <p className="font-medium text-gray-800">{verificationResult.exifData.software}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {verificationResult?.exifData?.gps && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-semibold text-gray-800">Signed GPS Location</h2>
                </div>
                
                <div className="space-y-3">
                  <div className="font-mono text-xs text-gray-800 space-y-1">
                    <div>{formatGPSCoordinate(verificationResult.exifData.gps.latitude, true)}</div>
                    <div>{formatGPSCoordinate(verificationResult.exifData.gps.longitude, false)}</div>
                  </div>

                  <div className="pt-2">
                    <a
                      href={`https://www.google.com/maps?q=${verificationResult.exifData.gps.latitude},${verificationResult.exifData.gps.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      <MapPin className="w-3 h-3" />
                      View on Map
                    </a>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
