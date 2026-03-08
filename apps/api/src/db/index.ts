import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://sentineldao:sentineldao_dev_password@localhost:5432/sentineldao";

// Create postgres connection
const queryClient = postgres(DATABASE_URL);

export const db = drizzle(queryClient, { schema });
export { schema };
