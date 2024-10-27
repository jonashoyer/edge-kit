export class CustomError<T extends string = string> extends Error {
  constructor(message: string, public code: T) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
