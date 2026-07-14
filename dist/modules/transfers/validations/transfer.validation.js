"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferQuerySchema = exports.createTransferSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const transferItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantity: zod_1.z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
    unitCostUzs: zod_1.z
        .number()
        .nonnegative("Unit cost cannot be negative")
        .optional(),
});
exports.createTransferSchema = zod_1.z
    .object({
    fromBranchId: zod_1.z.string().uuid().optional(),
    toBranchId: zod_1.z.string().uuid(),
    items: zod_1.z
        .array(transferItemSchema)
        .min(1, "Transfer must include at least one item"),
    note: zod_1.z.string().max(500).optional(),
})
    .refine((d) => {
    const unique = new Set(d.items.map((i) => i.productId));
    return unique.size === d.items.length;
}, { message: "Duplicate products in transfer items", path: ["items"] });
exports.transferQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.nativeEnum(client_1.TransferStatus).optional(),
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
    limit: zod_1.z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
});
