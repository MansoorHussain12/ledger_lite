import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit globs this path internally, which requires forward slashes
  // even on Windows — path.join alone produces backslashes there and silently
  // matches no schema files.
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
