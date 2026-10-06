"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchQuerySchema = exports.movementQuerySchema = exports.stockLevelQuerySchema = exports.STOCK_LEVEL_FILTERS = exports.inventoryQuerySchema = exports.adjustmentSchema = exports.stockInBatchSchema = exports.stockInSchema = void 0;
const pagination_1 = require("../../../core/utils/pagination");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const quantityField = zod_1.z
    .number()
    .positive("Quantity must be greater than 0")
    .multipleOf(0.0001, "Quantity supports up to 4 decimal places");
const salePriceUzsField = zod_1.z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.01, "Price must have at most 2 decimal places")
    .optional();
const salePriceUsdField = zod_1.z
    .number()
    .nonnegative("Price cannot be negative")
    .multipleOf(0.0001, "Price supports up to 4 decimal places")
    .optional();
// Sale prices are optional; when sent they become the product's current prices.
// costPriceUsd marks a USD-priced product, so its sale prices must be sent in USD.
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
    retailPriceUzs: salePriceUzsField,
    wholesalePriceUzs: salePriceUzsField,
    retailPriceUsd: salePriceUsdField,
    wholesalePriceUsd: salePriceUsdField,
    supplierNote: zod_1.z.string().max(500).optional(),
}).superRefine((d, ctx) => {
    const usd = d.costPriceUsd !== undefined;
    const [cost, wholesale, retail] = usd
        ? [d.costPriceUsd, d.wholesalePriceUsd, d.retailPriceUsd]
        : [d.costPriceUzs, d.wholesalePriceUzs, d.retailPriceUzs];
    const suffix = usd ? "Usd" : "Uzs";
    const otherCurrencySent = usd
        ? d.retailPriceUzs !== undefined || d.wholesalePriceUzs !== undefined
        : d.retailPriceUsd !== undefined || d.wholesalePriceUsd !== undefined;
    if (otherCurrencySent) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: `Sale prices must be in the same currency as the cost price (${suffix.toUpperCase()})`,
            path: [`retailPrice${suffix}`],
        });
        return;
    }
    if ((wholesale === undefined) !== (retail === undefined)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Retail and wholesale prices must be sent together",
            path: [wholesale === undefined ? `wholesalePrice${suffix}` : `retailPrice${suffix}`],
        });
        return;
    }
    if (wholesale === undefined || retail === undefined)
        return;
    if (wholesale > retail) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Wholesale price cannot exceed retail price",
            path: [`wholesalePrice${suffix}`],
        });
    }
    if (cost > wholesale) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Cost price cannot exceed wholesale price",
            path: [`costPrice${suffix}`],
        });
    }
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
exports.inventoryQuerySchema = pagination_1.listWindowSchema.extend({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid().optional(),
    lowStock: zod_1.z
        .string()
        .optional()
        .transform((v) => v === "true"),
});
exports.STOCK_LEVEL_FILTERS = ["all", "out", "low", "available"];
exports.stockLevelQuerySchema = pagination_1.paginationSchema.extend({
    branchId: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().trim().max(100).optional(),
    quantity: zod_1.z.enum(exports.STOCK_LEVEL_FILTERS).default("all"),
});
exports.movementQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    type: zod_1.z.nativeEnum(client_1.StockMovementType).optional(),
    from: zod_1.z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: zod_1.z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    limit: (0, pagination_1.queryInteger)(100, 500),
});
exports.batchQuerySchema = pagination_1.listWindowSchema.extend({
    branchId: zod_1.z.string().uuid().optional(),
    productId: zod_1.z.string().uuid().optional(),
    from: zod_1.z.string().datetime({ message: "from must be ISO datetime" }).optional(),
    to: zod_1.z.string().datetime({ message: "to must be ISO datetime" }).optional(),
    depleted: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
});
