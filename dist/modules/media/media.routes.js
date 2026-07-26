"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../auth/middleware/auth.middleware");
const media_controller_1 = require("./controllers/media.controller");
const router = (0, express_1.Router)();
router.get("/:id", auth_middleware_1.authMiddleware, media_controller_1.MediaController.download);
exports.default = router;
