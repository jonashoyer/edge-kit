/** biome-ignore-all lint/suspicious/noConsole: CLI entrypoint output is intentional. */
import { Command } from 'commander';
import { createDevLauncherActionCommand } from '../src/cli/dev-launcher/action-command';
import { createDevLauncherCommand } from '../src/cli/dev-launcher/command';
import { createGitCommitReportCommand } from '../src/cli/git-commit-report/report-command';

const program = new Command();

program
  .name('edge-kit-cli')
  .description('Edge Kit example CLI')
  .version('1.0.0');

program.addCommand(createDevLauncherActionCommand());
program.addCommand(createDevLauncherCommand());
program.addCommand(createGitCommitReportCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
