import React, { memo } from 'react';
import { Shield, Download, RefreshCw } from 'lucide-react';

const CertificateInfo = memo(({ certificate, onExport, onGenerateNew }) => {
  if (!certificate) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Certificate</h2>
          <Shield className="w-5 h-5 text-gray-400" />
        </div>
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No certificate generated yet</p>
          {onGenerateNew && (
            <button
              onClick={onGenerateNew}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 mx-auto"
            >
              <Shield className="w-4 h-4" />
              Generate Certificate
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Active Certificate</h2>
        <Shield className="w-5 h-5 text-blue-600" />
      </div>
      
      <div className="space-y-3">
        <div>
          <span className="text-xs text-gray-500 uppercase">Distinguished Name</span>
          <p className="font-mono text-sm text-gray-800 mt-1 break-all">
            {certificate.tbsCertificate?.subject?.string || 'N/A'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-gray-500 uppercase">Serial</span>
            <p className="font-mono text-xs text-gray-800 truncate">
              {certificate.tbsCertificate?.serialNumber?.substring(0, 16)}...
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Algorithm</span>
            <p className="font-mono text-xs text-gray-800">
              {certificate.signatureAlgorithm?.algorithm || 'ES384'}
            </p>
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">SHA-256 Fingerprint</span>
          <p className="font-mono text-xs text-gray-700 break-all">
            {certificate.fingerprint?.sha256?.substring(0, 47)}...
          </p>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Valid Until:</span>
          <span className="font-medium text-gray-800">
            {new Date(certificate.tbsCertificate?.validity?.notAfter || Date.now()).toLocaleDateString()}
          </span>
        </div>
        <div className="text-xs text-center pt-2 border-t">
          <span className={`px-2 py-1 rounded ${
            certificate.isSelfSigned 
              ? 'bg-amber-100 text-amber-700' 
              : 'bg-green-100 text-green-700'
          }`}>
            {certificate.isSelfSigned ? 'Self-Signed Development' : 'Verified'}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {onExport && (
          <button
            onClick={onExport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Public Certificate
          </button>
        )}
        {onGenerateNew && (
          <button
            onClick={onGenerateNew}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 rounded-lg text-sm font-medium text-amber-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Generate New Certificate
          </button>
        )}
      </div>
    </div>
  );
});

CertificateInfo.displayName = 'CertificateInfo';

export default CertificateInfo;