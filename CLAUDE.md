# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Adobe Mock Client (Image Certification Studio)
```bash
cd adobe-mock-client
npm install          # Install dependencies
npm start           # Start development server on port 3000
npm run build       # Build production bundle
npm test            # Run tests with Jest
```

### Trust Verifier
```bash
cd trust-verifier
npm install          # Install dependencies
npm start           # Start development server on port 3001 (PORT=3001 set in package.json)
npm run build       # Build production bundle
npm test            # Run tests with Jest
```

### Chrome Extension (AIC Chrome)
```bash
cd aic-chrome
npm install          # Install dependencies
npm run dev         # Development build with watch mode
npm run build       # Production build
npm run package     # Build and create extension zip file
```

## Architecture

This repository implements a **production-ready trusted image certification system** using real cryptography and image format manipulation. The system consists of three main components:

### 1. Adobe Mock Client (Image Certification Studio)
React application that certifies images with cryptographic signatures:
- **Real ECDSA P-384** cryptographic signatures using Web Crypto API
- **Real EXIF extraction** from uploaded images (camera, GPS, orientation data)
- **Real metadata embedding** in JPEG (APP15 segment) and PNG (tRST chunk) formats
- Certificate generation and export functionality
- Uses IndexedDB for persistent trust store

Key implementation details:
- JPEG: Custom APP15 (0xFFEF) segment with "IMGTRUST" marker
- PNG: Custom "tRST" chunk with proper CRC32 calculation
- Image hashing with SHA-384 after metadata stripping

### 2. Trust Verifier
React application for verifying certified images:
- **Real cryptographic verification** of embedded signatures
- **Real trust chain validation** with certificate expiration checking
- **Real metadata extraction** from JPEG/PNG formats
- Trust store management with import/export capabilities
- Image integrity verification through hash comparison

### 3. Chrome Extension (AIC Chrome)
TypeScript/Webpack-based extension for browser integration:
- Uses ethers.js for potential blockchain integration
- Webpack configuration for TypeScript compilation
- Manifest.json-based Chrome extension structure

## Key Technical Patterns

### Cryptographic Operations
All cryptographic operations use the browser's native Web Crypto API:
- ECDSA P-384 curve for digital signatures
- SHA-384 for image hashing
- Proper key generation and management

### Image Format Handling
Direct binary manipulation of image formats:
- JPEG: APP segment parsing and embedding
- PNG: Chunk parsing with CRC32 validation
- Metadata stripping before hash calculation for integrity

### State Management
- React hooks (useState, useCallback, useEffect)
- Custom hooks for certificate and image processing logic
- IndexedDB for persistent storage across sessions

### Component Structure
- Modular component architecture with clear separation of concerns
- Custom hooks for business logic (`useCertificate`, `useImageProcessor`)
- Utility classes for crypto, metadata extraction, and format handling

## Important Files

- `adobe-mock-client/src/components/ImageCertificationStudio.js` - Main certification UI
- `adobe-mock-client/src/utils/crypto/WebCryptoUtils.js` - Cryptographic operations
- `adobe-mock-client/src/utils/metadata/JPEGEmbedder.js` - JPEG metadata embedding
- `adobe-mock-client/src/utils/metadata/PNGEmbedder.js` - PNG metadata embedding
- `trust-verifier/src/TrustVerifier.js` - Main verification component
- `trust-verifier/src/utils/extraction/CertificationExtractor.js` - Metadata extraction