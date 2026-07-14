"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchQuerySchema = exports.movementQuerySchema = exports.inventoryQuerySchema = exports.adjustmentSchema = exports.stockInBatchSchema = exports.stockInSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const quantityField = zod_1.z
    .number()
    .positive("Quantity must be greater than 0")
    .multipleOf(0.0001, "Quantity supports up to 4 decimal places");
exports.stockInSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid(),
    quantity: quantityField,
    costPriceUzs: zod_1.z
        .number()
        .nonnegative("Cost price cannot be negative")
        .multipleOf(0.01),
    costPriceUsd: zod_1.z
        .number()
        .nonnegative("Cost price cannot be negative")
        .multipleOf(0.0001)
        .optional(),
    supplierNote: zod_1.z.string().max(500).optional(),
});
exports.stockInBatchSchema = zod_1.z
    .array(exports.stockInSchema)
    .min(1, "At least one stock-in item is required")
    .max(100, "A maximum of 100 stock-in items can be registered at once");
exports.adjustmentSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid(),
    newQuantity: zod_1.z
        .number()
        .nonnegative("Adjusted quantity cannot be negative")
        .multipleOf(0.0001),
    reason: zod_1.z.string().min(3, "Reason is required").max(500),
});
exports.inventoryQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid().optional(),
    lowStock: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
exports.movementQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    type: zod_1.z.nativeEnum(client_1.StockMovementType).optional(),
    from: zod_1.z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: zod_1.z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 500) : 100)),
});
exports.batchQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    from: zod_1.z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: zod_1.z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    depleted: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
