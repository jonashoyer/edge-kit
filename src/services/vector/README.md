---
provenance: Unvetted Synthetic
---

# SQLite vector storage

`DrizzleSqliteVectorDatabase` accepts a real Drizzle table and database backed by
`better-sqlite3`. Its base table must use a composite primary key on `namespace`
and `id`. An `id`-only primary key cannot store the same document ID in two
namespaces. Upserts now use `ON CONFLICT(namespace, id)`.

Existing consumers with an `id`-only primary key need a schema migration before
using this implementation. Rebuild the base table with the composite key and
copy its rows while preserving the embedding BLOB and metadata JSON. Remove the
old `id`-only uniqueness constraint; adding a composite unique index alone still
prevents duplicate IDs across namespaces. The service does not migrate tables.
Data previously overwritten across namespaces cannot be recovered from the base
table; reindex affected documents from their source.

The sqlite-vec virtual table cannot have ordinary SQLite indexes and does not
support replacement inserts. Updates delete the existing vector and insert its
replacement within the same transaction as the base-table update.

Integration tests resolve the extension with `getLoadablePath()` from
`sqlite-vec`, which selects the installed platform package. Consumers can pass
that path as `extensionPath`, or use the loader's system-library defaults.
