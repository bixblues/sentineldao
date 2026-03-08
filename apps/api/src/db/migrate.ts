import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://sentineldao:sentineldao_dev_password@localhost:5432/sentineldao";

const migrationClient = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(migrationClient);

console.log("Running migrations...");
await migrate(db, {
  migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
});
console.log("Migrations complete.");

await migrationClient.end();
