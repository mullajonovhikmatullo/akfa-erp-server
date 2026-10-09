import { listWindowSchema, paginationSchema, queryInteger } from "../../../core/utils/pagination";
import { z } from "zod";
import { StockMovementType } from "@prisma/client";

const quantityField = z
    .number()
    .positive("Quantity must be greater than 0")
    .multipleOf(0.0001, "Quantity supports up to 4 decimal places");

const salePriceUzsField = z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.01, "Price must have at most 2 decimal places")
    .optional();

const salePriceUsdField = z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.0001, "Price supports up to 4 decimal places")
    .optional();

// Sale prices are optional; when sent they become the product's current prices.
// costPriceUsd marks a USD-priced product, so its sale prices must be sent in USD.
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
    retailPriceUzs: salePriceUzsField,
    wholesalePriceUzs: salePriceUzsField,
    retailPriceUsd: salePriceUsdField,
    wholesalePriceUsd: salePriceUsdField,
    usdToUzsRate: z.number().positive("Exchange rate must be positive").optional(),
    supplierNote: z.string().max(500).optional(),
}).superRefine((d, ctx) => {
    const usd = d.costPriceUsd !== undefined;
    if (usd && d.usdToUzsRate === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "usdToUzsRate is required for USD cost prices",
            path: ["usdToUzsRate"],
        });
        return;
    }
    const [cost, wholesale, retail] = usd
        ? [d.costPriceUsd!, d.wholesalePriceUsd, d.retailPriceUsd]
        : [d.costPriceUzs, d.wholesalePriceUzs, d.retailPriceUzs];
    const suffix = usd ? "Usd" : "Uzs";
    const otherCurrencySent = usd
        ? d.retailPriceUzs !== undefined || d.wholesalePriceUzs !== undefined
        : d.retailPriceUsd !== undefined || d.wholesalePriceUsd !== undefined;

    if (otherCurrencySent) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Sale prices must be in the same currency as the cost price (${suffix.toUpperCase()})`,
            path: [`retailPrice${suffix}`],
        });
        return;
    }
    if ((wholesale === undefined) !== (retail === undefined)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Retail and wholesale prices must be sent together",
            path: [wholesale === undefined ? `wholesalePrice${suffix}` : `retailPrice${suffix}`],
        });
        return;
    }
    if (wholesale === undefined || retail === undefined) return;
    if (wholesale > retail) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Wholesale price cannot exceed retail price",
            path: [`wholesalePrice${suffix}`],
        });
    }
    if (cost > wholesale) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cost price cannot exceed wholesale price",
            path: [`costPrice${suffix}`],
        });
    }
});

export const stockInBatchSchema = z
    .array(stockInSchema)
    .min(1, "At least one stock-in item is required")
    .max(100, "A maximum of 100 stock-in items can be registered at once");

export const adjustmentSchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid(),
    newQuantity: z
        .number()
        .nonnegative("Adjusted quantity cannot be negative")
        .multipleOf(0.0001),
    reason: z.string().min(3, "Reason is required").max(500),
});

export const inventoryQuerySchema = listWindowSchema.extend({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    lowStock: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});

export const STOCK_LEVEL_FILTERS = ["all", "out", "low", "available"] as const;

export const stockLevelQuerySchema = paginationSchema.extend({
    branchId: z.string().uuid().optional(),
    search: z.string().trim().max(100).optional(),
    quantity: z.enum(STOCK_LEVEL_FILTERS).default("all"),
});

export const movementQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    type: z.nativeEnum(StockMovementType).optional(),
    from: z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    limit: queryInteger(100, 500),
});

export const batchQuerySchema = listWindowSchema.extend({
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    from: z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    depleted: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
