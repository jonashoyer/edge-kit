import type Database from "better-sqlite3";

export interface SqliteVecLoaderOptions {
  extensionPath?: string;
  trustedSchema?: boolean;
}

export function loadSqliteVec(
  db: Database.Database,
  options: SqliteVecLoaderOptions = {}
): void {
  const { extensionPath, trustedSchema = true } = options;

  try {
    if (trustedSchema) {
      db.pragma("trusted_schema=ON");
    }

    if (extensionPath) {
      db.loadExtension(extensionPath);
    } else {
      const paths = getDefaultExtensionPaths();
      let loaded = false;

      for (const path of paths) {
        try {
          db.loadExtension(path);
          loaded = true;
          break;
        } catch {
          // try next path
        }
      }

      if (!loaded) {
        throw new Error(
          "Failed to load sqlite-vec extension. Please provide explicit extensionPath."
        );
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to load sqlite-vec extension: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function getDefaultExtensionPaths(): string[] {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return [
        "/usr/local/lib/sqlite-vec.dylib",
        "/opt/homebrew/lib/sqlite-vec.dylib",
        "./sqlite-vec.dylib",
      ];
    case "linux":
      return [
        "/usr/local/lib/sqlite-vec.so",
        "/usr/lib/sqlite-vec.so",
        "./sqlite-vec.so",
      ];
    case "win32":
      return ["C:\\sqlite-vec\\sqlite-vec.dll", ".\\sqlite-vec.dll"];
    default:
      return ["./sqlite-vec"];
  }
}





