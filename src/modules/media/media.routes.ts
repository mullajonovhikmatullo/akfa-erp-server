import { Router } from "express";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { MediaController } from "./controllers/media.controller";

const router = Router();

router.get("/:id", authMiddleware, MediaController.download);

export default router;
