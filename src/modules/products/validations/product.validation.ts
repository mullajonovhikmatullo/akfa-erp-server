import { z } from "zod";

const ACTIVE_PRODUCT_UNITS = ["KG", "PIECE"] as const;
const activeProductUnitSchema = z.enum(ACTIVE_PRODUCT_UNITS);

const priceField = z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.01, "Price must have at most 2 decimal places");

export const createProductSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    sku: z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: activeProductUnitSchema,
    categoryId: z.string().uuid("categoryId must be a valid UUID").optional(),
    branchId: z.string().uuid("branchId must be a valid UUID").optional(),
    lowStockThreshold: z
        .number()
        .nonnegative("Low-stock threshold cannot be negative")
        .multipleOf(0.0001, "Low-stock threshold supports up to 4 decimal places")
        .nullable()
        .optional(),
    costPriceUzs: priceField,
    retailPriceUzs: priceField,
    wholesalePriceUzs: priceField,
    costPriceUsd: priceField.optional(),
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
}).refine(
    (d) => d.wholesalePriceUzs <= d.retailPriceUzs,
    { message: "Wholesale price cannot exceed retail price", path: ["wholesalePriceUzs"] }
).refine(
    (d) => d.costPriceUzs <= d.wholesalePriceUzs,
    { message: "Cost price cannot exceed wholesale price", path: ["costPriceUzs"] }
).refine(
    (d) =>
        d.wholesalePriceUsd === undefined ||
        d.retailPriceUsd === undefined ||
        d.wholesalePriceUsd <= d.retailPriceUsd,
    { message: "Wholesale price cannot exceed retail price", path: ["wholesalePriceUsd"] }
).refine(
    (d) =>
        d.costPriceUsd === undefined ||
        d.wholesalePriceUsd === undefined ||
        d.costPriceUsd <= d.wholesalePriceUsd,
    { message: "Cost price cannot exceed wholesale price", path: ["costPriceUsd"] }
);

export const updateProductSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).optional(),
    sku: z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: activeProductUnitSchema.optional(),
    categoryId: z.string().uuid("categoryId must be a valid UUID").optional(),
    lowStockThreshold: z
        .number()
        .nonnegative("Low-stock threshold cannot be negative")
        .multipleOf(0.0001, "Low-stock threshold supports up to 4 decimal places")
        .nullable()
        .optional(),
    costPriceUzs: priceField.optional(),
    retailPriceUzs: priceField.optional(),
    wholesalePriceUzs: priceField.optional(),
    costPriceUsd: priceField.optional(),
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
    isActive: z.boolean().optional(),
});

export const listProductsSchema = z.object({
    categoryId: z.string().uuid().optional(),
    unit: activeProductUnitSchema.optional(),
    priceCurrency: z.enum(["UZS", "USD"]).optional(),
    isActive: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    search: z.string().max(100).optional(),
});
