import React from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ImageCertificationStudio from './components/ImageCertificationStudio';

function App() {
  return (
    <ErrorBoundary>
      <ImageCertificationStudio />
    </ErrorBoundary>
  );
}

export default App;
