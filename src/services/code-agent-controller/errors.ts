export class CacError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class CacProvisioningError extends CacError {
  constructor(message: string) {
    super("CAC_PROVISIONING_FAILED", message);
  }
}

export class CacExecutionError extends CacError {
  constructor(message: string) {
    super("CAC_EXECUTION_FAILED", message);
  }
}

export class CacNotFoundError extends CacError {
  constructor(message: string) {
    super("CAC_WORKSPACE_NOT_FOUND", message);
  }
}
