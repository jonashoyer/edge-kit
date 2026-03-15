/** biome-ignore-all lint/suspicious/noConsole: CLI entrypoint output is intentional. */
import { Command } from 'commander';
import { createDevLauncherCommand } from '../src/cli/dev-launcher';

const program = new Command();

program
  .name('edge-kit-cli')
  .description('Edge Kit example CLI')
  .version('1.0.0');

program.addCommand(createDevLauncherCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
