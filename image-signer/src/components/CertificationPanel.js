import React, { memo, useState, useEffect } from 'react';
import { Shield, Save, CheckCircle } from 'lucide-react';

const CertificationPanel = memo(({ 
  onCertify, 
  onDownload, 
  canCertify, 
  isCertifying, 
  hasCertified,
  image 
}) => {
  const [description, setDescription] = useState('');

  // Reset description when image changes
  useEffect(() => {
    setDescription('');
  }, [image]);

  const handleCertify = () => {
    console.log('CertificationPanel: handleCertify called');
    console.log('Description:', description);
    console.log('onCertify function:', onCertify ? 'Present' : 'Missing');
    
    if (onCertify && description.trim()) {
      console.log('Calling onCertify with description:', description);
      onCertify(description);
    } else {
      console.log('Cannot certify - missing onCertify or description');
    }
  };

  if (!image) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Image Certification</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Image Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the image content, context, location, and any relevant details..."
            className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={hasCertified}
          />
          <p className="text-xs text-gray-500 mt-1">
            This description will be cryptographically signed with the image
          </p>
        </div>

        {!hasCertified ? (
          <button
            onClick={handleCertify}
            disabled={isCertifying || !canCertify || !description.trim()}
            className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
          >
            {isCertifying ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Certifying Image...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Sign & Certify Image
              </>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Image Successfully Certified</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Digital signature embedded in image metadata
              </p>
            </div>

            <button
              onClick={onDownload}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Save className="w-4 h-4" />
              Download Certified Image
            </button>
          </div>
        )}

        {!description.trim() && image && !hasCertified && (
          <p className="text-sm text-amber-600 flex items-center gap-1">
            <span className="text-lg">⚠️</span>
            Description required for certification
          </p>
        )}
      </div>
    </div>
  );
});

CertificationPanel.displayName = 'CertificationPanel';

export default CertificationPanel;