import express from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import { config } from "./config"
import routes from "./routes/download.route"
import { ensureTempDir } from "./utils/file"
import { startCleanupSchedule } from "./services/cleanup.service"
import { sendError } from "./utils/response"

const app = express()

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST"],
  })
)

app.use(express.json({ limit: "10kb" }))

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, "Server sedang sibuk", 429),
})
app.use(limiter)

app.use(routes)

app.use((_req, res) => {
  sendError(res, "Not found", 404)
})

ensureTempDir()
startCleanupSchedule()

app.listen(config.port, () => {
  console.log(`Backend is running on port ${config.port}`)
})

export default app
