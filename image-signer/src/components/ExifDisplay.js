import React, { memo } from 'react';
import { MapPin, Camera, Settings } from 'lucide-react';
import { ExifExtractor } from '../utils/metadata/ExifExtractor';

const ExifDisplay = memo(({ exifData }) => {
  if (!exifData) return null;

  const hasLocationData = exifData.gps && exifData.gps.latitude && exifData.gps.longitude;
  const hasCameraSettings = exifData.focalLengthString || exifData.apertureString || 
                           exifData.shutterSpeedString || exifData.iso;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Image Metadata</h2>
        <Camera className="w-5 h-5 text-blue-600" />
      </div>
      
      <div className="space-y-4">
        {exifData.camera && (
          <div>
            <span className="text-sm text-gray-600">Camera:</span>
            <p className="font-medium text-gray-800">{exifData.camera}</p>
            {exifData.lens && <p className="text-sm text-gray-700">{exifData.lens}</p>}
          </div>
        )}
        
        {hasCameraSettings && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">Camera Settings:</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pl-6">
              {exifData.focalLengthString && (
                <div>
                  <span className="text-xs text-gray-500">Focal Length</span>
                  <p className="font-medium text-gray-800">{exifData.focalLengthString}</p>
                </div>
              )}
              {exifData.apertureString && (
                <div>
                  <span className="text-xs text-gray-500">Aperture</span>
                  <p className="font-medium text-gray-800">{exifData.apertureString}</p>
                </div>
              )}
              {exifData.shutterSpeedString && (
                <div>
                  <span className="text-xs text-gray-500">Shutter</span>
                  <p className="font-medium text-gray-800">{exifData.shutterSpeedString}</p>
                </div>
              )}
              {exifData.iso && (
                <div>
                  <span className="text-xs text-gray-500">ISO</span>
                  <p className="font-medium text-gray-800">{exifData.iso}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <span className="text-sm text-gray-600">Orientation:</span>
          <p className="font-medium text-gray-800">
            {ExifExtractor.getOrientationDescription(exifData.orientation)}
          </p>
        </div>

        {hasLocationData ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">GPS Location:</span>
            </div>
            <div className="mt-1 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-mono text-green-800">
                Lat: {exifData.gps.latitude.toFixed(6)}
              </p>
              <p className="text-sm font-mono text-green-800">
                Lng: {exifData.gps.longitude.toFixed(6)}
              </p>
              {exifData.gps.altitude !== undefined && (
                <p className="text-sm font-mono text-green-800">
                  Alt: {exifData.gps.altitude.toFixed(1)}m
                </p>
              )}
              <a
                href={`https://www.google.com/maps?q=${exifData.gps.latitude},${exifData.gps.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-xs mt-2 inline-block"
              >
                View on Maps →
              </a>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">GPS Location:</span>
            </div>
            <p className="text-sm text-gray-500 pl-6">No location data available</p>
          </div>
        )}

        {exifData.dateTaken && (
          <div>
            <span className="text-sm text-gray-600">Date Taken:</span>
            <p className="font-medium text-gray-800">
              {new Date(exifData.dateTaken).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

ExifDisplay.displayName = 'ExifDisplay';

export default ExifDisplay;