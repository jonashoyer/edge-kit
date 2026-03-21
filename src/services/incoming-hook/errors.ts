import { CustomError } from '../../utils/custom-error';

export class IncomingHookAuthError extends CustomError<'INCOMING_HOOK_AUTH'> {
  readonly status = 401;

  constructor(message: string) {
    super(message, 'INCOMING_HOOK_AUTH');
  }
}

export class IncomingHookPayloadError extends CustomError<'INCOMING_HOOK_PAYLOAD'> {
  readonly status = 400;

  constructor(message: string) {
    super(message, 'INCOMING_HOOK_PAYLOAD');
  }
}

export class IncomingHookMethodError extends CustomError<'INCOMING_HOOK_METHOD'> {
  readonly status = 405;

  constructor(message = 'Method not allowed') {
    super(message, 'INCOMING_HOOK_METHOD');
  }
}

export const isIncomingHookError = (
  error: unknown
): error is {
  status: number;
  message: string;
} => {
  return (
    error instanceof IncomingHookAuthError ||
    error instanceof IncomingHookPayloadError ||
    error instanceof IncomingHookMethodError
  );
};
