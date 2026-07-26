import { NextFunction, Request, Response } from "express";
import { MediaService } from "../services/media.service";

export const MediaController = {
    async download(req: Request, res: Response, next: NextFunction) {
        try {
            const media = await MediaService.download(req.params.id as string, req.user!);
            const fallback = media.mimeType === "application/pdf" ? "receipt.pdf" : "receipt";
            const fileName = encodeURIComponent(media.fileName || fallback);

            res.setHeader("Content-Type", media.mimeType);
            res.setHeader("Content-Length", String(media.sizeBytes));
            res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${fileName}`);
            res.setHeader("Cache-Control", "private, max-age=300, no-transform");
            res.setHeader("X-Content-Type-Options", "nosniff");
            return res.send(media.content);
        } catch (error) {
            return next(error);
        }
    },
};
