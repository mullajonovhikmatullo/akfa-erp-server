import { z } from "zod";
import { uploadConfig } from "../../../../core/config/uploads";

export const reorderProductImagesSchema = z
    .object({
        imageIds: z
            .array(z.string().uuid())
            .min(1)
            .max(uploadConfig.productImageMaxCount),
    })
    .strict()
    .refine((data) => new Set(data.imageIds).size === data.imageIds.length, {
        path: ["imageIds"],
        message: "Image IDs must be unique",
    });

export type ReorderProductImagesInput = z.infer<
    typeof reorderProductImagesSchema
>;
