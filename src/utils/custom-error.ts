export class CustomError<T extends string = string> extends Error {
  readonly code: T;

  constructor(message: string, code: T) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
