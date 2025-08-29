# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm start        # Start development server on port 3000
npm run build    # Build production bundle
npm test         # Run tests with Jest in watch mode
```

## Architecture

This is a React application that simulates an Adobe-like image certification tool. The application demonstrates cryptographic signing of images with embedded metadata.

### Core Components

**AdobeMockClient.js** - Main application component that handles:
- Image upload and EXIF extraction from iPhone/camera images
- Cryptographic certificate generation using Web Crypto API (ECDSA P-384)
- Digital signature creation and embedding in image metadata
- Real JPEG/PNG metadata manipulation without external libraries

### Key Technical Implementation

The application uses browser-native Web Crypto API for all cryptographic operations:
- Certificate generation with ECDSA P-384 curve
- Image hashing with SHA-384
- Digital signatures embedded in image metadata

Image metadata handling:
- **JPEG**: Custom APP15 (0xFFEF) segment with "IMGTRUST" marker
- **PNG**: Custom "tRST" chunk with proper CRC32 calculation
- Real EXIF extraction including GPS data from iPhone images

Trust store uses IndexedDB for persistent certificate storage across sessions.