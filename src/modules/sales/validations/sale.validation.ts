import { z } from "zod";
import { PaymentMethod, SaleType } from "@prisma/client";

const saleItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
});

export const setDebtDeadlineSchema = z.object({
    debtDueDate: z.string().datetime().nullable(),
});

export const createSaleSchema = z
    .object({
        branchId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        saleType: z.nativeEnum(SaleType),
        items: z.array(saleItemSchema).min(1, "Sale must have at least one item"),
        paidAmountUzs: z.number().nonnegative().default(0),
        paidAmountUsd: z.number().nonnegative().default(0),
        usdToUzsRate: z.number().positive("Exchange rate must be positive").optional(),
        paymentMethod: z.nativeEnum(PaymentMethod),
        debtDueDate: z.string().datetime().optional(),
        note: z.string().max(500).optional(),
    })
    .refine(
        (d) => d.paidAmountUsd === 0 || d.usdToUzsRate !== undefined,
        { message: "usdToUzsRate is required when paying in USD", path: ["usdToUzsRate"] }
    )
    .refine(
        (d) => {
            const uniqueProducts = new Set(d.items.map((i) => i.productId));
            return uniqueProducts.size === d.items.length;
        },
        { message: "Duplicate products in sale items", path: ["items"] }
    );

export const addPaymentSchema = z
    .object({
        amountUzs: z.number().nonnegative().default(0),
        amountUsd: z.number().nonnegative().default(0),
        usdToUzsRate: z.number().positive("Exchange rate must be positive").optional(),
        paymentMethod: z.nativeEnum(PaymentMethod),
        note: z.string().max(500).optional(),
    })
    .refine(
        (d) => d.amountUzs > 0 || d.amountUsd > 0,
        { message: "Payment must include at least one non-zero amount" }
    )
    .refine(
        (d) => d.amountUsd === 0 || d.usdToUzsRate !== undefined,
        { message: "usdToUzsRate is required when paying in USD", path: ["usdToUzsRate"] }
    );

export const saleQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    saleType: z.nativeEnum(SaleType).optional(),
    hasDebt: z
        .string()
        .optional()
        .transform((v) => v === "true"),
    overdue: z
        .string()
        .optional()
        .transform((v) => v === "true"),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
});

export const debtPaymentQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(10),
});
