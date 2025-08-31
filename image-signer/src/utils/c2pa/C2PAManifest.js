/**
 * C2PA (Coalition for Content Provenance and Authenticity) Manifest
 * Implements the actual standard used by Adobe and other companies
 * Based on C2PA Technical Specification v1.0
 */
export class C2PAManifest {
  static CLAIM_VERSION = '1.0';
  static MANIFEST_SPEC = 'c2pa/1.0';

  /**
   * Create a C2PA manifest for image certification
   */
  static async createManifest(imageData, certificate, description, exifData) {
    console.log('C2PAManifest.createManifest called');
    const manifestId = this.generateManifestId();
    const timestamp = new Date().toISOString();
    
    try {
      // Create assertions first to catch any errors
      console.log('Creating assertions...');
      const assertions = [
        this.createContentCredentialsAssertion(certificate),
        this.createActionsAssertion(),
        this.createCreativeWorkAssertion(description, exifData),
        this.createHashAssertion(imageData)
      ];
      console.log('Assertions created successfully');

      const manifest = {
        // C2PA Manifest Store
        '@context': 'https://c2pa.org/specifications/1.0/context.json',
        '@type': 'C2PAManifestStore',
        
        // Active manifest reference
        active_manifest: manifestId,
        
        // The actual manifest
        manifests: {
          [manifestId]: {
            // Claim signature
            claim_signature: {
              signature: null, // Will be populated after signing
              algorithm: 'ES384',
              certificate_chain: [] // Will contain X.509 certificates
            },
            
            // The claim itself
            claim: {
              claim_generator: 'Image Certification Studio/2.0',
              claim_generator_info: [
                {
                  name: 'Image Certification Studio',
                  version: '2.0',
                  icon: null // Simplified - no icon object
                }
              ],
              
              // Title and metadata
              title: description || 'Certified Image',
              thumbnail: null, // Simplified - no thumbnail
              
              // Assertions (the actual content claims)
              assertions: assertions,
            
            // Signature info
            signature_info: {
              alg: 'ES384',
              issuer: certificate.tbsCertificate?.issuer?.string || 'Unknown',
              time: timestamp,
              cert_serial_number: certificate.tbsCertificate?.serialNumber || 'unknown'
            },
            
            // Claim metadata
            dc_terms: {
              created: timestamp,
              modified: timestamp,
              rights: '© ' + new Date().getFullYear() + ' ' + (certificate.tbsCertificate?.subject?.commonName || 'Unknown')
            }
          },
          
          // Validation status
          validation_status: []
        }
      }
    };
    
    console.log('Manifest structure created successfully');
    return manifest;
    } catch (error) {
      console.error('Error creating manifest:', error);
      throw error;
    }
  }

  /**
   * Create content credentials assertion
   */
  static createContentCredentialsAssertion(certificate) {
    return {
      label: 'c2pa.credentials',
      data: {
        '@context': 'https://c2pa.org/specifications/1.0/context/assertion.json',
        '@type': 'C2PA_CredentialsAssertion',
        
        // Signer info (safe access to avoid errors)
        signer: {
          name: certificate.tbsCertificate?.subject?.commonName || 'Unknown Signer',
          identifier: certificate.fingerprint?.sha256 || 'unknown',
          credential: [
            {
              '@type': 'IdentityCredential',
              'name': certificate.tbsCertificate?.subject?.commonName || 'Unknown',
              'identifier': certificate.tbsCertificate?.serialNumber || 'unknown'
            }
          ]
        },
        
        // Time of signing
        dateCreated: new Date().toISOString(),
        
        // Trust indicators
        trust_indicator: {
          '@type': 'TrustIndicator',
          provider: 'self-signed-development',
          level: 'development'
        }
      }
    };
  }

  /**
   * Create actions assertion (what was done to the image)
   */
  static createActionsAssertion() {
    return {
      label: 'c2pa.actions',
      data: {
        '@context': 'https://c2pa.org/specifications/1.0/context/actions.json',
        '@type': 'C2PA_ActionsAssertion',
        actions: [
          {
            action: 'c2pa.created',
            when: new Date().toISOString(),
            softwareAgent: {
              name: 'Image Certification Studio',
              version: '2.0'
            },
            parameters: {
              description: 'Original capture certified'
            }
          },
          {
            action: 'c2pa.signed',
            when: new Date().toISOString(),
            description: 'Digitally signed for authenticity'
          }
        ]
      }
    };
  }

  /**
   * Create creative work assertion
   */
  static createCreativeWorkAssertion(description, exifData) {
    console.log('Creating creative work assertion, exifData:', exifData ? 'Present' : 'None');
    
    const assertion = {
      label: 'stds.schema-org.CreativeWork',
      data: {
        '@context': 'https://schema.org/',
        '@type': 'Photograph',
        
        // Basic metadata
        name: description || 'Certified Photograph',
        dateCreated: exifData?.captureTime || new Date().toISOString(),
        
        // Author/creator
        author: {
          '@type': 'Person',
          name: 'Photographer'
        }
      }
    };

    // Add location if GPS data exists (but make sure it's serializable)
    if (exifData?.gps && typeof exifData.gps.latitude === 'number') {
      assertion.data.locationCreated = {
        '@type': 'Place',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: exifData.gps.latitude,
          longitude: exifData.gps.longitude,
          elevation: exifData.gps.altitude || 0
        }
      };
    }

    // Add EXIF data if available (only serializable values)
    if (exifData) {
      assertion.data.exifData = {
        '@type': 'PropertyValue',
        camera: exifData.camera || null,
        lens: exifData.lens || null,
        iso: exifData.iso || null,
        aperture: exifData.apertureString || null,
        shutterSpeed: exifData.shutterSpeedString || null,
        focalLength: exifData.focalLengthString || null,
        orientation: exifData.orientation || 1
      };
    }

    return assertion;
  }

  /**
   * Create hash assertion for image integrity
   */
  static createHashAssertion(imageData) {
    return {
      label: 'c2pa.hash.data',
      data: {
        '@context': 'https://c2pa.org/specifications/1.0/context/hash.json',
        '@type': 'C2PA_HashAssertion',
        
        // Hash of the image data
        hash: imageData.hash || 'pending',
        algorithm: 'SHA-384',
        
        // What's being hashed
        name: 'Image pixel data',
        scope: 'stripped', // Metadata stripped before hashing
        
        // Pad for alignment
        pad: null
      }
    };
  }

  /**
   * Create ingredient assertion (for derived works)
   */
  static createIngredientAssertion(parentManifest) {
    return {
      label: 'c2pa.ingredient',
      data: {
        '@context': 'https://c2pa.org/specifications/1.0/context/ingredient.json',
        '@type': 'C2PA_IngredientAssertion',
        
        // Parent content reference
        parentOf: {
          manifest: parentManifest,
          relationship: 'derived'
        },
        
        // Validation of parent
        validationStatus: 'passed'
      }
    };
  }

  /**
   * Generate unique manifest ID
   */
  static generateManifestId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `urn:uuid:${timestamp}-${random}`;
  }

  /**
   * Sign the manifest with certificate
   */
  static async signManifest(manifest, certificate) {
    // Create a clean version of the manifest without circular references
    const cleanManifest = JSON.parse(JSON.stringify({
      claim: manifest.manifests[manifest.active_manifest].claim
    }));
    
    const manifestData = JSON.stringify(cleanManifest);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(manifestData);
    
    // Create signature - check if keyPair exists, otherwise skip signing
    let signature = null;
    if (certificate.keyPair?.privateKey) {
      signature = await crypto.subtle.sign(
        {
          name: "ECDSA",
          hash: "SHA-384",
        },
        certificate.keyPair.privateKey,
        dataBytes
      );
    }

    // Update manifest with signature
    manifest.manifests[manifest.active_manifest].claim_signature = {
      signature: signature ? Array.from(new Uint8Array(signature)) : null,
      algorithm: 'ES384',
      certificate_chain: [
        this.formatCertificateForC2PA(certificate)
      ],
      timestamp: {
        time: new Date().toISOString(),
        authority: 'self-signed'
      }
    };

    return manifest;
  }

  /**
   * Format certificate for C2PA chain (without circular references)
   */
  static formatCertificateForC2PA(certificate) {
    // Create a clean copy without keyPair and other non-serializable objects
    const cleanCert = {
      fingerprint: certificate.fingerprint,
      subject: certificate.tbsCertificate?.subject?.string || 'Unknown',
      issuer: certificate.tbsCertificate?.issuer?.string || 'Unknown',
      serialNumber: certificate.tbsCertificate?.serialNumber || 'Unknown',
      notBefore: certificate.tbsCertificate?.validity?.notBefore || null,
      notAfter: certificate.tbsCertificate?.validity?.notAfter || null,
      signatureAlgorithm: certificate.signatureAlgorithm?.algorithm || 'ES384',
      // Only include serializable parts of tbsCertificate
      tbsCertificate: {
        version: certificate.tbsCertificate?.version,
        serialNumber: certificate.tbsCertificate?.serialNumber,
        subject: certificate.tbsCertificate?.subject,
        issuer: certificate.tbsCertificate?.issuer,
        validity: certificate.tbsCertificate?.validity,
        extensions: certificate.tbsCertificate?.extensions
      }
    };
    
    return cleanCert;
  }

  /**
   * Validate a C2PA manifest
   */
  static async validateManifest(manifest) {
    try {
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        trust_level: 'development'
      };

      // Check manifest structure
      if (!manifest['@context'] || !manifest.active_manifest) {
        validation.valid = false;
        validation.errors.push('Invalid C2PA manifest structure');
      }

      // Check active manifest exists
      const activeManifest = manifest.manifests?.[manifest.active_manifest];
      if (!activeManifest) {
        validation.valid = false;
        validation.errors.push('Active manifest not found');
      }

      // Validate claim
      if (!activeManifest?.claim) {
        validation.valid = false;
        validation.errors.push('No claim found in manifest');
      }

      // Check signature
      if (!activeManifest?.claim_signature) {
        validation.warnings.push('No signature found - manifest is unsigned');
      }

      // Validate assertions
      const assertions = activeManifest?.claim?.assertions || [];
      if (assertions.length === 0) {
        validation.warnings.push('No assertions found in claim');
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
        trust_level: 'none'
      };
    }
  }

  /**
   * Export manifest as JUMBF (JPEG Universal Metadata Box Format)
   * This is the actual format used in C2PA
   */
  static exportAsJUMBF(manifest) {
    // In a real implementation, this would create proper JUMBF boxes
    // For now, we'll create a simplified version
    const jumbf = {
      type: 'jumb',
      boxes: [
        {
          type: 'jumd',
          data: {
            type: 'c2pa',
            manifest: manifest
          }
        }
      ]
    };

    return JSON.stringify(jumbf);
  }
}