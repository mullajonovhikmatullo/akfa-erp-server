import { z } from "zod";
import { TransferStatus } from "@prisma/client";

const transferItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
    unitCostUzs: z
        .number()
        .nonnegative("Unit cost cannot be negative")
        .optional(),
});

export const createTransferSchema = z
    .object({
        fromBranchId: z.string().uuid().optional(),
        toBranchId: z.string().uuid(),
        items: z
            .array(transferItemSchema)
            .min(1, "Transfer must include at least one item"),
        note: z.string().max(500).optional(),
    })
    .refine(
        (d) => {
            const unique = new Set(d.items.map((i) => i.productId));
            return unique.size === d.items.length;
        },
        { message: "Duplicate products in transfer items", path: ["items"] }
    );

export const transferQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    status: z.nativeEnum(TransferStatus).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
});
