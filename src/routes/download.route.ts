import { Router } from "express"
import {
  downloadVideo,
  getFormats,
  healthCheck,
  streamFile,
} from "../controllers/download.controller"

const router = Router()

router.get("/health", healthCheck)
router.post("/info", getFormats)
router.post("/download", downloadVideo)
router.get("/stream/:filename", streamFile)

export default router
