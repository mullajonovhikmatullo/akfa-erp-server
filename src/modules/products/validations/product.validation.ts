import { z } from "zod";
import { ProductUnit } from "@prisma/client";

const priceField = z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.01, "Price must have at most 2 decimal places");

export const createProductSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    sku: z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: z.nativeEnum(ProductUnit),
    categoryId: z.string().uuid("categoryId must be a valid UUID").optional(),
    retailPriceUzs: priceField,
    wholesalePriceUzs: priceField,
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
}).refine(
    (d) => d.wholesalePriceUzs <= d.retailPriceUzs,
    { message: "Wholesale price cannot exceed retail price", path: ["wholesalePriceUzs"] }
);

export const updateProductSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    sku: z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: z.nativeEnum(ProductUnit).optional(),
    categoryId: z.string().uuid("categoryId must be a valid UUID").optional(),
    retailPriceUzs: priceField.optional(),
    wholesalePriceUzs: priceField.optional(),
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
    isActive: z.boolean().optional(),
});

export const listProductsSchema = z.object({
    categoryId: z.string().uuid().optional(),
    unit: z.nativeEnum(ProductUnit).optional(),
    isActive: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    search: z.string().max(100).optional(),
});
