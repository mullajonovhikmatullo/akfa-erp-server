"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProductsSchema = exports.updateProductSchema = exports.createProductSchema = void 0;
const zod_1 = require("zod");
const ACTIVE_PRODUCT_UNITS = ["KG", "PIECE"];
const activeProductUnitSchema = zod_1.z.enum(ACTIVE_PRODUCT_UNITS);
const priceField = zod_1.z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.01, "Price must have at most 2 decimal places");
exports.createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(1000).optional(),
    sku: zod_1.z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: activeProductUnitSchema,
    categoryId: zod_1.z.string().uuid("categoryId must be a valid UUID").optional(),
    branchId: zod_1.z.string().uuid("branchId must be a valid UUID").optional(),
    costPriceUzs: priceField,
    retailPriceUzs: priceField,
    wholesalePriceUzs: priceField,
    costPriceUsd: priceField.optional(),
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
}).refine((d) => d.wholesalePriceUzs <= d.retailPriceUzs, { message: "Wholesale price cannot exceed retail price", path: ["wholesalePriceUzs"] }).refine((d) => d.costPriceUzs <= d.wholesalePriceUzs, { message: "Cost price cannot exceed wholesale price", path: ["costPriceUzs"] }).refine((d) => d.wholesalePriceUsd === undefined ||
    d.retailPriceUsd === undefined ||
    d.wholesalePriceUsd <= d.retailPriceUsd, { message: "Wholesale price cannot exceed retail price", path: ["wholesalePriceUsd"] }).refine((d) => d.costPriceUsd === undefined ||
    d.wholesalePriceUsd === undefined ||
    d.costPriceUsd <= d.wholesalePriceUsd, { message: "Cost price cannot exceed wholesale price", path: ["costPriceUsd"] });
exports.updateProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(1000).optional(),
    sku: zod_1.z
        .string()
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/, "SKU may only contain letters, numbers, hyphens, and underscores")
        .optional(),
    unit: activeProductUnitSchema.optional(),
    categoryId: zod_1.z.string().uuid("categoryId must be a valid UUID").optional(),
    costPriceUzs: priceField.optional(),
    retailPriceUzs: priceField.optional(),
    wholesalePriceUzs: priceField.optional(),
    costPriceUsd: priceField.optional(),
    retailPriceUsd: priceField.optional(),
    wholesalePriceUsd: priceField.optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.listProductsSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid().optional(),
    unit: activeProductUnitSchema.optional(),
    isActive: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    search: zod_1.z.string().max(100).optional(),
});
