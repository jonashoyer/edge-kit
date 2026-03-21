import { spawn } from 'node:child_process';

interface OpenExternalUrlCommand {
  args: string[];
  command: string;
}

/**
 * Builds the platform-specific command used to open a configured service URL in
 * the user's default browser.
 */
export const buildOpenExternalUrlCommand = (
  url: string,
  platform: NodeJS.Platform
): OpenExternalUrlCommand => {
  switch (platform) {
    case 'darwin':
      return {
        args: [url],
        command: 'open',
      };
    case 'win32':
      return {
        args: ['/c', 'start', '', url],
        command: 'cmd',
      };
    default:
      return {
        args: [url],
        command: 'xdg-open',
      };
  }
};

/**
 * Opens an external URL using the current platform's default browser.
 */
export const openExternalUrl = async (
  url: string,
  platform: NodeJS.Platform = process.platform
): Promise<void> => {
  const openCommand = buildOpenExternalUrlCommand(url, platform);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(openCommand.command, openCommand.args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', (error) => {
      reject(error);
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
};
