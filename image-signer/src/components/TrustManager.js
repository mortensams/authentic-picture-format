import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Upload, Trash2, CheckCircle, XCircle, AlertCircle, Key } from 'lucide-react';
import { TrustStore } from '../utils/storage/TrustStore';
import { PEMParser } from '../utils/certificates/PEMParser';

function TrustManager({ onClose }) {
  const [trustedCerts, setTrustedCerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Load trusted certificates on mount
  useEffect(() => {
    loadTrustedCertificates();
  }, []);

  const loadTrustedCertificates = async () => {
    try {
      setIsLoading(true);
      const certs = await TrustStore.getTrustedCertificates();
      setTrustedCerts(certs);
    } catch (err) {
      setError('Failed to load trusted certificates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError(null);
    setImportStatus('importing');

    try {
      // More lenient file extension check
      const validExtensions = ['.pem', '.crt', '.cer', '.cert', '.key', '.txt'];
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      
      // If no valid extension, just warn but continue (file might still be valid PEM)
      if (!hasValidExtension) {
        console.warn('File may not be a certificate file, attempting to parse anyway...');
      }

      // Parse the certificate
      console.log('Attempting to parse certificate file:', file.name, 'Type:', file.type);
      const certificate = await PEMParser.importFromFile(file);
      console.log('Certificate parsed successfully:', certificate);
      
      // Get certificate info for display
      const certInfo = PEMParser.getCertificateInfo(certificate);
      console.log('Certificate info:', certInfo);
      
      // Check if already trusted
      const isAlreadyTrusted = await TrustStore.isCertificateTrusted(certificate);
      if (isAlreadyTrusted) {
        setImportStatus('already-trusted');
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }

      // Import to trust store
      await TrustStore.importTrustedCertificate(certificate);
      
      setImportStatus('success');
      setTimeout(() => setImportStatus(null), 3000);
      
      // Reload certificates
      await loadTrustedCertificates();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err.message);
      setImportStatus('error');
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const handleRemoveCertificate = async (fingerprint) => {
    if (!window.confirm('Remove this certificate from trust store?')) return;

    try {
      await TrustStore.removeTrustedCertificate(fingerprint);
      await loadTrustedCertificates();
    } catch (err) {
      setError('Failed to remove certificate');
    }
  };

  const formatFingerprint = (fingerprint) => {
    if (!fingerprint) return 'N/A';
    // Show first 32 chars of fingerprint
    return fingerprint.substring(0, 32) + '...';
  };

  const getCertificateStatus = (cert) => {
    const now = new Date();
    const validFrom = cert.tbsCertificate?.validity?.notBefore ? new Date(cert.tbsCertificate.validity.notBefore) : null;
    const validTo = cert.tbsCertificate?.validity?.notAfter ? new Date(cert.tbsCertificate.validity.notAfter) : null;

    if (validTo && now > validTo) {
      return { status: 'expired', color: 'text-red-600', icon: XCircle };
    }
    if (validFrom && now < validFrom) {
      return { status: 'not-yet-valid', color: 'text-amber-600', icon: AlertCircle };
    }
    return { status: 'valid', color: 'text-green-600', icon: CheckCircle };
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">Certificate Trust Store</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Import and manage trusted certificates for image verification
          </p>
        </div>

        <div className="p-6">
          {/* Import Section */}
          <div className="mb-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                className="hidden"
              />
              
              <Key className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Import Certificate</h3>
              <p className="text-sm text-gray-500 mb-4">
                Import certificate files (.pem, .crt, .cer) exported from the signing app
              </p>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Select Certificate File
              </button>

              {importStatus === 'importing' && (
                <div className="mt-4 text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto"></div>
                  <span className="text-sm">Importing certificate...</span>
                </div>
              )}

              {importStatus === 'success' && (
                <div className="mt-4 text-green-600 flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Certificate imported successfully</span>
                </div>
              )}

              {importStatus === 'already-trusted' && (
                <div className="mt-4 text-amber-600 flex items-center justify-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">Certificate already in trust store</span>
                </div>
              )}

              {importStatus === 'error' && error && (
                <div className="mt-4 text-red-600 flex items-center justify-center gap-2">
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Trusted Certificates List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Trusted Certificates ({trustedCerts.length})
            </h3>

            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : trustedCerts.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No trusted certificates</p>
                <p className="text-sm text-gray-400 mt-1">Import certificates to verify signed images</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {trustedCerts.map((cert) => {
                  const certInfo = PEMParser.getCertificateInfo(cert);
                  const certStatus = getCertificateStatus(cert);
                  const StatusIcon = certStatus.icon;

                  return (
                    <div
                      key={cert.fingerprint?.sha256 || cert.tbsCertificate?.serialNumber}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <StatusIcon className={`w-5 h-5 ${certStatus.color}`} />
                            <span className="font-medium text-gray-800">
                              {certInfo.subject}
                            </span>
                            {cert.isSelfSigned && (
                              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                                Self-Signed
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                              <span className="text-gray-500">Issuer:</span> {certInfo.issuer}
                            </div>
                            <div>
                              <span className="text-gray-500">Serial:</span>{' '}
                              <span className="font-mono text-xs">
                                {certInfo.serialNumber?.substring(0, 16)}...
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Valid Until:</span>{' '}
                              {certInfo.validTo ? new Date(certInfo.validTo).toLocaleDateString() : 'N/A'}
                            </div>
                            <div>
                              <span className="text-gray-500">Imported:</span>{' '}
                              {cert.importedAt ? new Date(cert.importedAt).toLocaleDateString() : 'N/A'}
                            </div>
                          </div>
                          
                          <div className="mt-2">
                            <span className="text-xs text-gray-500">SHA-256:</span>
                            <p className="font-mono text-xs text-gray-600">
                              {formatFingerprint(cert.fingerprint?.sha256)}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveCertificate(cert.fingerprint?.sha256)}
                          className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from trust store"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">About Certificate Trust</p>
                <ul className="space-y-1 text-xs">
                  <li>• Imported certificates will be used to verify image signatures</li>
                  <li>• Self-signed certificates can be trusted for development/testing</li>
                  <li>• Expired certificates will be marked but remain in store for verification</li>
                  <li>• Export certificates from the signing app using "Export Certificate"</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrustManager;