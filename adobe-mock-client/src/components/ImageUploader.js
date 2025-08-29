import React, { memo, useRef } from 'react';
import { Upload } from 'lucide-react';
import appConfig from '../config/appConfig';

const ImageUploader = memo(({ onImageSelect, imagePreview, image }) => {
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && onImageSelect) {
      onImageSelect(file);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Select Image</h2>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept={appConfig.ui.supportedFormats.join(',')}
          className="hidden"
        />
        
        {!imagePreview ? (
          <div>
            <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">Upload Image</h3>
            <p className="text-gray-500 mb-2">JPEG or PNG files with metadata</p>
            <p className="text-xs text-gray-400 mb-6">
              Maximum size: {appConfig.ui.maxImageSizeMB}MB
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Choose Image
            </button>
          </div>
        ) : (
          <div>
            <img 
              src={imagePreview} 
              alt="Selected" 
              className="max-w-full max-h-64 mx-auto rounded-lg shadow-md mb-4 object-contain"
            />
            <div className="text-sm text-gray-600 mb-4">
              <p className="font-medium truncate">{image?.name}</p>
              <p>{image?.type} • {formatFileSize(image?.size)}</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Choose Different Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

ImageUploader.displayName = 'ImageUploader';

export default ImageUploader;