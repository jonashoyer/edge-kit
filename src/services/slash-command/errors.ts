import { CustomError } from "../../utils/custom-error";

export class CommandNotFoundError extends CustomError<"COMMAND_NOT_FOUND"> {
  constructor(commandId: string) {
    super(`Command not found: ${commandId}`, "COMMAND_NOT_FOUND");
  }
}

export class CommandExecutionError extends CustomError<"COMMAND_EXECUTION_ERROR"> {
  constructor(commandId: string, message: string) {
    super(
      `Command execution failed (${commandId}): ${message}`,
      "COMMAND_EXECUTION_ERROR"
    );
  }
}

export class DuplicateCommandError extends CustomError<"DUPLICATE_COMMAND"> {
  constructor(requestId: string) {
    super(`Duplicate command request: ${requestId}`, "DUPLICATE_COMMAND");
  }
}
