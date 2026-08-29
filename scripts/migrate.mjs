import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1, prepare: false, ssl: connectionString.includes("localhost") ? false : "require" });
try {
  await sql.unsafe(await readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8"));
  console.log("Applied migration 001_initial");
} finally {
  await sql.end();
}
