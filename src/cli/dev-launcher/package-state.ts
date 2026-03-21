import fs from 'node:fs';
import path from 'node:path';
import { listWorkspacePackageDirectories } from './repo-utils';

const toRelativePath = (repoRoot: string, filePath: string): string => {
  const relativePath = path.relative(repoRoot, filePath);
  return relativePath.length > 0 ? relativePath : path.basename(filePath);
};

const getExistingFilePaths = (filePaths: string[]): string[] => {
  return filePaths.filter((filePath) => fs.existsSync(filePath));
};

export interface PnpmInstallState {
  installMarkerPath: string;
  needsInstall: boolean;
  newestInputPath?: string;
  reason: string;
}

/**
 * Determines whether a PNPM install is likely needed by comparing package
 * definition files against the root node_modules install marker.
 */
export const getPnpmInstallState = (repoRoot: string): PnpmInstallState => {
  const installMarkerPath = path.join(
    repoRoot,
    'node_modules',
    '.modules.yaml'
  );
  const packageJsonPaths = [
    path.join(repoRoot, 'package.json'),
    ...listWorkspacePackageDirectories(repoRoot).map((directoryPath) =>
      path.join(directoryPath, 'package.json')
    ),
  ];
  const inputs = getExistingFilePaths([
    ...packageJsonPaths,
    path.join(repoRoot, 'pnpm-lock.yaml'),
    path.join(repoRoot, 'pnpm-workspace.yaml'),
  ]);

  if (!fs.existsSync(installMarkerPath)) {
    return {
      installMarkerPath,
      needsInstall: true,
      reason: `${toRelativePath(repoRoot, installMarkerPath)} is missing.`,
    };
  }

  const installMarkerStat = fs.statSync(installMarkerPath);
  const newestInputPath = inputs.reduce<string | undefined>(
    (latestPath, filePath) => {
      const fileStat = fs.statSync(filePath);
      if (!latestPath) {
        return filePath;
      }

      return fs.statSync(latestPath).mtimeMs >= fileStat.mtimeMs
        ? latestPath
        : filePath;
    },
    undefined
  );

  if (!newestInputPath) {
    return {
      installMarkerPath,
      needsInstall: false,
      reason:
        'No package inputs were found to compare against the install marker.',
    };
  }

  const newestInputStat = fs.statSync(newestInputPath);
  if (newestInputStat.mtimeMs > installMarkerStat.mtimeMs) {
    return {
      installMarkerPath,
      needsInstall: true,
      newestInputPath,
      reason: `${toRelativePath(repoRoot, newestInputPath)} is newer than ${toRelativePath(repoRoot, installMarkerPath)}.`,
    };
  }

  return {
    installMarkerPath,
    needsInstall: false,
    newestInputPath,
    reason: 'Dependencies look current.',
  };
};
