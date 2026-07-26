"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderProductImagesSchema = void 0;
const zod_1 = require("zod");
const uploads_1 = require("../../../../core/config/uploads");
exports.reorderProductImagesSchema = zod_1.z
    .object({
    imageIds: zod_1.z
        .array(zod_1.z.string().uuid())
        .min(1)
        .max(uploads_1.uploadConfig.productImageMaxCount),
})
    .strict()
    .refine((data) => new Set(data.imageIds).size === data.imageIds.length, {
    path: ["imageIds"],
    message: "Image IDs must be unique",
});
