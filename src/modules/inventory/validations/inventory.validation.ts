import { z } from "zod";
import { StockMovementType } from "@prisma/client";

const quantityField = z
    .number()
    .positive("Quantity must be greater than 0")
    .multipleOf(0.0001, "Quantity supports up to 4 decimal places");

export const stockInSchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid(),
    quantity: quantityField,
    costPriceUzs: z
        .number()
        .nonnegative("Cost price cannot be negative")
        .multipleOf(0.01),
    costPriceUsd: z
        .number()
        .nonnegative("Cost price cannot be negative")
        .multipleOf(0.0001)
        .optional(),
    supplierNote: z.string().max(500).optional(),
});

export const adjustmentSchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid(),
    newQuantity: z
        .number()
        .nonnegative("Adjusted quantity cannot be negative")
        .multipleOf(0.0001),
    reason: z.string().min(3, "Reason is required").max(500),
});

export const inventoryQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    lowStock: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});

export const movementQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    type: z.nativeEnum(StockMovementType).optional(),
    from: z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 500) : 100)),
});

export const batchQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    depleted: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
