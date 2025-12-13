import Database from "better-sqlite3";

const sqlite = new Database(":memory:");
sqlite.loadExtension(
  "./node_modules/.pnpm/sqlite-vec-darwin-arm64@0.1.7-alpha.2/node_modules/sqlite-vec-darwin-arm64/vec0.dylib"
);

// Create virtual table
sqlite.exec(`
  CREATE VIRTUAL TABLE test USING vec0(
    id TEXT PRIMARY KEY,
    namespace TEXT,
    embedding float[1536]
  )
`);

try {
  // Create a 1536-dimensional vector
  const vector = new Array(1536).fill(0.1);

  // Insert first record
  sqlite.exec(
    `INSERT INTO test VALUES('test', 'ns', '${JSON.stringify(vector)}')`
  );
  console.log("First insert successful");

  // Try to insert same ID
  sqlite.exec(
    `INSERT INTO test VALUES('test', 'ns', '${JSON.stringify(vector)}')`
  );
  console.log("Second insert successful");
} catch (error) {
  console.log("Error:", error.message);
}

sqlite.close();
