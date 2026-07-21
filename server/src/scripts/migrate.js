import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/database.js";

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../sql");
const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
await pool.query("CREATE TABLE IF NOT EXISTS nexus_schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
for (const filename of files) {
  const applied = await pool.query("SELECT 1 FROM nexus_schema_migrations WHERE filename = $1", [filename]);
  if (applied.rowCount) continue;
  await pool.query(await fs.readFile(path.join(directory, filename), "utf8"));
  await pool.query("INSERT INTO nexus_schema_migrations (filename) VALUES ($1)", [filename]);
  console.log(`Migração aplicada: ${filename}`);
}
await pool.end();

