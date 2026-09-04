import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
function databaseSsl(value) {
  const explicit = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (["false", "0", "disable"].includes(explicit)) return false;
  if (["true", "1", "require"].includes(explicit)) return "require";
  try {
    const url = new URL(value);
    if (url.searchParams.get("sslmode") === "disable") return false;
    if (["localhost", "127.0.0.1", "db"].includes(url.hostname)) return false;
  } catch {}
  return "require";
}
const sql = postgres(connectionString, { max: 1, prepare: false, ssl: databaseSsl(connectionString) });
try {
  const directory = new URL("../db/migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  for (const migration of migrations) {
    await sql.unsafe(await readFile(new URL(migration, directory), "utf8"));
    console.log(`Applied migration ${migration.replace(/\.sql$/, "")}`);
  }
} finally {
  await sql.end();
}
