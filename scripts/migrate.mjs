import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1, prepare: false, ssl: connectionString.includes("localhost") ? false : "require" });
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
