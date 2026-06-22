import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";

import authRoutes from "./routes/auth.routes";
import eventRoutes from "./routes/event.routes";
import adminRoutes from "./routes/admin.routes";
import { pollsRouter } from "./routes/poll.routes";
import { commentsRouter } from "./routes/comment.routes";
import { errorHandler } from "./middlewares/errorHandler";
import { dbDriver } from "./lib/db";

export function createApp() {
  const app = express();

  // Cabecalhos de seguranca + CORS + parsing
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // Limite de requisicoes no fluxo de autenticacao (mitiga brute force)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/auth", authLimiter);

  app.get("/health", (_req, res) =>
    res.json({ status: "ok", driver: dbDriver })
  );

  // API
  app.use("/auth", authRoutes);
  app.use("/events", eventRoutes);
  app.use("/polls", pollsRouter);
  app.use("/comments", commentsRouter);
  app.use("/admin", adminRoutes);

  // Console de demonstracao (conveniencia visual; toda autorizacao e no backend)
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Tratador de erros (sempre por ultimo)
  app.use(errorHandler);

  return app;
}
