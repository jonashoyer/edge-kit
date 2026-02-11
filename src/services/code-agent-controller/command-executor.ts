import type { CommandResult } from "./types";

export interface ICommandExecutor {
  runScript(hostId: string, scriptLines: string[]): Promise<CommandResult>;
  runCommand(hostId: string, command: string): Promise<CommandResult>;
}
