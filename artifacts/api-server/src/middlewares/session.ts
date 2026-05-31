import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
}

const PgStore = connectPgSimple(session);

const isProduction = process.env.NODE_ENV === "production";

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: "user_sessions",
    // Do NOT use createTableIfMissing — esbuild cannot bundle the required .sql file.
    // Table is created at startup via ensureSessionTable().
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

/** Must be called once at server startup before any requests are handled. */
export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
  `);
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
  }
}
