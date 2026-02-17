/**
 * Represents a signed value with metadata
 */
export interface SignedValue<T> {
  /** Algorithm used for signing */
  algorithm: string;
  /** The original value (stored as-is, not stringified) */
  value: T;
  /** The signature for this value */
  signature: string;
}

/**
 * Abstract interface for signing and verifying values
 */
export abstract class AbstractSignedValue {
  /**
   * Sign a value with a secret
   * @param value - The value to sign (any type)
   * @param secret - The secret used for signing
   * @returns A SignedValue object containing the algorithm, value, and signature
   */
  abstract sign<T>(value: T, secret: string): Promise<SignedValue<T>>;

  /**
   * Verify a signed value
   * @param signedValue - The SignedValue object to verify
   * @param secret - The secret used for signing
   * @returns True if the signature is valid, false otherwise
   */
  abstract verify<T>(
    signedValue: SignedValue<T>,
    secret: string
  ): Promise<boolean>;
}
