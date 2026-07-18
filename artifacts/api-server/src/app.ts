import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./middlewares/session";

const app: Express = express();

// Trust the first proxy hop so secure cookies work over HTTPS
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(sessionMiddleware);

app.use("/api", router);

// Serve the built frontend (artifacts/ledger's `pnpm run build` output) as a
// single deployable unit. A no-op in local dev, where that build doesn't
// exist — the frontend is served by its own Vite dev server instead.
// The regex excludes /api/* so an unmatched API route still 404s as JSON
// instead of falling through to the SPA's index.html.
const frontendDist = path.resolve(__dirname, "../../ledger/dist/public");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
