import { useState, useEffect, useCallback } from 'react';
import { X509Certificate } from '../utils/certificates/X509Certificate';
import { TrustStore } from '../utils/storage/TrustStore';
import appConfig from '../config/appConfig';

export function useCertificate(photographerName = null) {
  const [certificate, setCertificate] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const generateCertificate = useCallback(async (certDetails = null) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Use provided details or defaults
      const subjectInfo = certDetails ? {
        commonName: certDetails.commonName,
        name: certDetails.commonName,
        organization: certDetails.organization,
        organizationalUnit: certDetails.organizationalUnit,
        email: certDetails.email || null,
        country: certDetails.country || 'US',
        state: certDetails.state || null,
        locality: certDetails.locality || null
      } : {
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
          validityDays: certDetails?.validityDays || appConfig.certification.validityDays,
          isCA: false,
          subjectAltNames: certDetails?.email ? [
            { type: 'email', value: certDetails.email }
          ] : []
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
    // Try to load existing certificate from store first
    const loadOrGenerateCertificate = async () => {
      if (!certificate && !isGenerating) {
        try {
          // Check if we have any existing certificates
          const existingCerts = await TrustStore.getAllCertificates();
          
          if (existingCerts && existingCerts.length > 0) {
            // Use the first valid certificate found
            const validCert = existingCerts.find(cert => {
              // Check if certificate has required fields and keys
              return cert.keyPair && cert.tbsCertificate;
            });
            
            if (validCert) {
              console.log('Loading existing certificate:', validCert.tbsCertificate?.subject?.string);
              setCertificate(validCert);
              return;
            }
          }
          
          // No valid certificate found, generate a new one
          console.log('No existing certificate found, generating new one...');
          generateCertificate();
        } catch (err) {
          console.error('Error loading certificate:', err);
          generateCertificate();
        }
      }
    };
    
    loadOrGenerateCertificate();
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