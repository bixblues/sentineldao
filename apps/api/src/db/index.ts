import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DB_PATH = resolve(import.meta.dir, "../../data/sentinel.db");

// Ensure data directory exists
mkdirSync(resolve(import.meta.dir, "../../data"), { recursive: true });

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
