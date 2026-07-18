import { execFileSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const envPath = path.join(repoRoot, "artifacts/api-server/.env");

loadEnv({ path: envPath, quiet: true });

if (!process.env.DATABASE_URL) {
  console.error(`DATABASE_URL not set. Add it to ${envPath} first.`);
  process.exit(1);
}

console.log("Pushing DB schema (non-interactive)...");
execFileSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query<{ id: number }>(
  "SELECT id FROM users WHERE username = $1",
  [ADMIN_USERNAME],
);

if (rows.length > 0) {
  console.log(`User "${ADMIN_USERNAME}" already exists — skipping creation.`);
} else {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    "INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)",
    ["Admin", ADMIN_USERNAME, passwordHash, "owner"],
  );
  console.log(`Created admin login → username: ${ADMIN_USERNAME}  password: ${ADMIN_PASSWORD}`);
}

await pool.end();
console.log("Local DB setup complete.");
