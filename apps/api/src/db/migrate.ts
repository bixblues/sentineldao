import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DB_PATH = resolve(import.meta.dir, "../../data/sentinel.db");
mkdirSync(resolve(import.meta.dir, "../../data"), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

const db = drizzle(sqlite);

console.log("Running migrations...");
migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
console.log("Migrations complete.");

sqlite.close();
