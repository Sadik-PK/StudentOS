import express from "express"

import cors from "cors"

import { toNodeHandler } from "better-auth/node"

import { rateLimit } from "express-rate-limit"

import { auth } from "./auth.js"

import { env } from "./env.js"

import { prisma } from "./db.js"

import { closeFileStorage, filesRouter } from "./routes/files.js"

import { stateRouter } from "./routes/state.js"

const app = express()

app.set("trust proxy", 1)

app.use(cors({ origin: env.FRONTEND_ORIGINS, credentials: true }))

app.use(express.json({ limit: "2mb" }))

app.get("/api/health", (_req, res) => res.json({ status: "ok" }))

app.use(
  "/api/auth",

  rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 10,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    message: { error: "Too many authentication attempts. Try again later." },
  }),
)

app.all("/api/auth/{*path}", toNodeHandler(auth))

app.all("/api/auth", toNodeHandler(auth))

app.use("/api/state", stateRouter)

app.use("/api/files", filesRouter)

app.use((_req, res) => res.status(404).json({ error: "Not found." }))

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("API request failed:", error)

    res.status(500).json({ error: "An unexpected server error occurred." })
  },
)

const server = app.listen(env.PORT, () => {
  console.log(`StudentOS API listening on port ${env.PORT}`)
})

async function shutdown() {
  server.close()

  await closeFileStorage()
}

process.on("SIGINT", () => void shutdown())

process.on("SIGTERM", () => void shutdown())
