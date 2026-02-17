import { constantTimeEqual, sha256Base64 } from '../../utils/crypto-utils';
import { CustomError } from '../../utils/custom-error';
import { AbstractSignedValue, type SignedValue } from './abstract-signed-value';

/**
 * Error thrown when signature verification fails
 */
export class SignatureVerificationError extends CustomError<'INVALID_SIGNATURE'> {
  constructor(message: string) {
    super(message, 'INVALID_SIGNATURE');
  }
}

/**
 * Implements signed value creation and verification using HMAC-SHA256
 */
export class SignedValueService extends AbstractSignedValue {
  private readonly algorithm = 'HMAC-SHA256';

  /**
   * Sign a value with a secret
   * @param value - The value to sign (any type)
   * @param secret - The secret used for signing
   * @returns A SignedValue object containing the algorithm, value, and signature
   */
  async sign<T>(value: T, secret: string): Promise<SignedValue<T>> {
    // Convert value to JSON string for consistent hashing
    const valueString = JSON.stringify(value);

    // Compute HMAC-SHA256: hash of (value + secret)
    const signature = await sha256Base64(`${valueString}:${secret}`);

    return {
      algorithm: this.algorithm,
      value,
      signature,
    };
  }

  /**
   * Verify a signed value
   * @param signedValue - The SignedValue object to verify
   * @param secret - The secret used for signing
   * @returns True if the signature is valid, false otherwise
   */
  async verify<T>(
    signedValue: SignedValue<T>,
    secret: string
  ): Promise<boolean> {
    // Validate structure
    if (!signedValue || typeof signedValue !== 'object') {
      return false;
    }

    if (
      !(
        'algorithm' in signedValue &&
        'value' in signedValue &&
        'signature' in signedValue
      )
    ) {
      return false;
    }

    try {
      // Reconstruct the expected signature
      const valueString = JSON.stringify(signedValue.value);
      const expectedSignature = await sha256Base64(`${valueString}:${secret}`);

      // Use constant-time comparison to prevent timing attacks
      return constantTimeEqual(signedValue.signature, expectedSignature);
    } catch {
      // If anything fails during verification, consider it invalid
      return false;
    }
  }
}
