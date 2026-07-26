"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaController = void 0;
const media_service_1 = require("../services/media.service");
exports.MediaController = {
    async download(req, res, next) {
        try {
            const media = await media_service_1.MediaService.download(req.params.id, req.user);
            const fallback = media.mimeType === "application/pdf" ? "receipt.pdf" : "receipt";
            const fileName = encodeURIComponent(media.fileName || fallback);
            res.setHeader("Content-Type", media.mimeType);
            res.setHeader("Content-Length", String(media.sizeBytes));
            res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${fileName}`);
            res.setHeader("Cache-Control", "private, max-age=300, no-transform");
            res.setHeader("X-Content-Type-Options", "nosniff");
            return res.send(media.content);
        }
        catch (error) {
            return next(error);
        }
    },
};
