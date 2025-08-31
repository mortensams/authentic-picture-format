import React, { useState, useCallback, memo } from 'react';
import { Camera, Shield, AlertCircle, Key } from 'lucide-react';
import { useCertificate } from '../hooks/useCertificate';
import { useImageProcessor } from '../hooks/useImageProcessor';
import ImageUploader from './ImageUploader';
import CertificationPanel from './CertificationPanel';
import CertificateInfo from './CertificateInfo';
import ExifDisplay from './ExifDisplay';
import TrustManager from './TrustManager';
import CertificateGenerationForm from './CertificateGenerationForm';
import appConfig from '../config/appConfig';

const StatusBar = memo(({ status, isProcessing }) => (
  <div className="mb-8 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
    <div className="flex items-center gap-3">
      {isProcessing ? (
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
      ) : (
        <Shield className="w-5 h-5 text-blue-600" />
      )}
      <span className="font-medium text-gray-800">{status}</span>
    </div>
  </div>
));

StatusBar.displayName = 'StatusBar';

function ImageCertificationStudio() {
  const [status, setStatus] = useState('Initializing certificate...');
  const [photographerName, setPhotographerName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [showTrustManager, setShowTrustManager] = useState(false);
  const [showCertificateForm, setShowCertificateForm] = useState(false);

  const {
    certificate,
    isGenerating,
    error: certError,
    generateCertificate,
    exportPublicCertificate
  } = useCertificate(photographerName);

  const {
    image,
    imagePreview,
    exifData,
    certifiedImageBlob,
    isProcessing,
    error: imageError,
    processImage,
    certifyImage,
    downloadCertifiedImage
  } = useImageProcessor();

  const handleImageUpload = useCallback(async (file) => {
    setStatus('Processing image and extracting metadata...');
    const result = await processImage(file);
    
    if (result) {
      if (result.exif?.gps) {
        setStatus(`Image processed successfully with GPS data`);
      } else {
        setStatus('Image processed successfully (no GPS data found)');
      }
    } else {
      setStatus('Failed to process image');
    }
  }, [processImage]);

  const handleCertify = useCallback(async (description) => {
    console.log('ImageCertificationStudio: handleCertify called');
    console.log('Certificate available:', !!certificate);
    console.log('Description:', description);
    
    if (!certificate) {
      setStatus('No certificate available');
      return;
    }

    setStatus('Certifying image with digital signature...');
    console.log('Calling certifyImage...');
    
    try {
      const result = await certifyImage(certificate, description);
      console.log('certifyImage result:', result);
      
      if (result) {
        setStatus('Image certified successfully - ready for download');
        console.log('Certification successful, blob created');
      } else {
        setStatus('Certification failed');
        console.log('Certification failed - no result');
      }
    } catch (error) {
      console.error('Certification error in component:', error);
      setStatus(`Certification failed: ${error.message}`);
    }
  }, [certificate, certifyImage]);

  const handleDownload = useCallback(() => {
    const success = downloadCertifiedImage();
    if (success) {
      setStatus('Certified image downloaded successfully');
    }
  }, [downloadCertifiedImage]);

  const handleExportCertificate = useCallback(() => {
    const pemCertificate = exportPublicCertificate();
    if (!pemCertificate) return;

    // Export as proper PEM file
    const dataUri = 'data:application/x-pem-file;charset=utf-8,'+ encodeURIComponent(pemCertificate);
    
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', 'certificate.pem');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setStatus('X.509 certificate exported in PEM format');
  }, [exportPublicCertificate]);

  const handleSetPhotographerName = useCallback(() => {
    if (photographerName.trim()) {
      setShowNameInput(false);
      generateCertificate();
      setStatus('Certificate generated successfully');
    }
  }, [photographerName, generateCertificate]);

  const handleGenerateNewCertificate = useCallback(() => {
    setShowCertificateForm(true);
  }, []);

  const handleCertificateFormSubmit = useCallback(async (certDetails) => {
    try {
      await generateCertificate(certDetails);
      setStatus('New certificate generated successfully');
      setShowCertificateForm(false);
    } catch (error) {
      setStatus(`Failed to generate certificate: ${error.message}`);
    }
  }, [generateCertificate]);

  React.useEffect(() => {
    if (certificate && !photographerName) {
      setStatus('Ready to certify images');
      setShowNameInput(false);
    } else if (isGenerating) {
      setStatus('Generating certificate...');
    }
  }, [certificate, isGenerating, photographerName]);

  const error = certError || imageError;
  const canCertify = image && certificate && !certifiedImageBlob;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Camera className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">{appConfig.app.name}</h1>
          </div>
          <p className="text-gray-600">{appConfig.app.description}</p>
          
          {/* Trust Store Button */}
          <button
            onClick={() => setShowTrustManager(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            <Key className="w-4 h-4" />
            Manage Trust Store
          </button>
        </div>

        <StatusBar status={status} isProcessing={isProcessing || isGenerating} />

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <ImageUploader
              onImageSelect={handleImageUpload}
              imagePreview={imagePreview}
              image={image}
            />

            <CertificationPanel
              onCertify={handleCertify}
              onDownload={handleDownload}
              canCertify={canCertify}
              isCertifying={isProcessing}
              hasCertified={!!certifiedImageBlob}
              image={image}
            />
          </div>

          <div className="space-y-6">
            <CertificateInfo
              certificate={certificate}
              onExport={handleExportCertificate}
              onGenerateNew={handleGenerateNewCertificate}
            />

            {exifData && <ExifDisplay exifData={exifData} />}
          </div>
        </div>
      </div>

      {/* Trust Manager Modal */}
      {showTrustManager && (
        <TrustManager onClose={() => setShowTrustManager(false)} />
      )}

      {/* Certificate Generation Form Modal */}
      {showCertificateForm && (
        <CertificateGenerationForm
          onGenerate={handleCertificateFormSubmit}
          onClose={() => setShowCertificateForm(false)}
          isGenerating={isGenerating}
        />
      )}
    </div>
  );
}

export default ImageCertificationStudio;