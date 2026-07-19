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
  // company_settings (raw-pool managed, see CLAUDE.md) and user_sessions
  // (created by ensureSessionTable()) intentionally have no Drizzle schema.
  // Without this, `push`/`push-force` treats them as drift and DROPS them
  // to match the schema files — this actually happened once during
  // development. Exclude them from the diff entirely so they're untouched
  // no matter what schema changes get pushed.
  tablesFilter: ["!company_settings", "!user_sessions"],
});
