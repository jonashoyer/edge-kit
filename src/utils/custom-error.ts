/**
 * Base class for typed custom errors.
 * Allows defining a specific error code for better error handling and categorization.
 */
export class CustomError<T extends string = string> extends Error {
  readonly code: T;

  constructor(message: string, code: T) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
