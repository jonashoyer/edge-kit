/**
 * Base error for CAC services.
 */
export class AgentControllerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Raised when an AgentBox cannot be leased.
 */
export class LeaseUnavailableError extends AgentControllerError {
  constructor(message = "Agent box is unavailable") {
    super("CAC_LEASE_UNAVAILABLE", message);
  }
}

/**
 * Raised when provisioning fails.
 */
export class ProvisioningError extends AgentControllerError {
  constructor(message: string) {
    super("CAC_PROVISIONING_FAILED", message);
  }
}

/**
 * Raised when VM operations fail.
 */
export class VmManagerError extends AgentControllerError {
  constructor(message: string) {
    super("CAC_VM_MANAGER_FAILED", message);
  }
}
