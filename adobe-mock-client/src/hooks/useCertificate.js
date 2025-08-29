import { useState, useEffect, useCallback } from 'react';
import { X509Certificate } from '../utils/certificates/X509Certificate';
import { TrustStore } from '../utils/storage/TrustStore';
import appConfig from '../config/appConfig';

export function useCertificate(photographerName = null) {
  const [certificate, setCertificate] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const generateCertificate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Create proper subject info for X.509 certificate
      const subjectInfo = {
        commonName: photographerName || appConfig.certification.defaultSubject,
        name: photographerName || appConfig.certification.defaultSubject,
        organization: 'Independent Photographer',
        email: null,
        country: 'US'
      };

      // Generate real X.509-structured certificate
      const cert = await X509Certificate.generateCertificate(
        subjectInfo,
        null, // Self-signed
        {
          validityDays: appConfig.certification.validityDays,
          isCA: false,
          subjectAltNames: [
            { type: 'email', value: 'photographer@example.com' }
          ]
        }
      );

      await TrustStore.storeCertificate(cert);
      setCertificate(cert);
      
      return cert;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [photographerName]);

  const loadExistingCertificate = useCallback(async (certId) => {
    try {
      const cert = await TrustStore.getCertificate(certId);
      if (cert) {
        // Reconstruct the keyPair from stored data if needed
        // Note: In a real app, you'd need to reimport the keys
        setCertificate(cert);
        return cert;
      }
    } catch (err) {
      setError(err.message);
    }
    return null;
  }, []);

  const exportPublicCertificate = useCallback(() => {
    if (!certificate) return null;

    // Export in proper X.509 PEM format
    return X509Certificate.exportCertificate(certificate, false);
  }, [certificate]);

  useEffect(() => {
    // Auto-generate certificate on mount if none exists
    if (!certificate && !isGenerating) {
      generateCertificate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    certificate,
    isGenerating,
    error,
    generateCertificate,
    loadExistingCertificate,
    exportPublicCertificate
  };
}