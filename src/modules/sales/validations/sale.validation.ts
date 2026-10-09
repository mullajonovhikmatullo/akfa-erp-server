import { queryInteger } from "../../../core/utils/pagination";
import { z } from "zod";
import { PaymentMethod, SaleType } from "@prisma/client";

const saleItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z
        .number()
        .positive("Quantity must be greater than 0")
        .multipleOf(0.0001, "Quantity supports up to 4 decimal places"),
});

// Sales and debt payments are settled in UZS only; USD prices are converted with usdToUzsRate.
const uzsOnlyPaymentMethod = z
    .nativeEnum(PaymentMethod)
    .refine((m) => m !== PaymentMethod.CASH_USD, { message: "Payments are accepted in UZS only" });
const zeroUsdAmount = z.literal(0, { message: "Payments are accepted in UZS only" }).default(0);

export const setDebtDeadlineSchema = z.object({
    debtDueDate: z.string().datetime().nullable(),
});

export const createSaleSchema = z
    .object({
        branchId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        saleType: z.nativeEnum(SaleType),
        items: z.array(saleItemSchema).min(1, "Sale must have at least one item").max(200),
        paidAmountUzs: z.number().nonnegative().default(0),
        paidAmountUsd: zeroUsdAmount,
        usdToUzsRate: z.number().positive("Exchange rate must be positive").optional(),
        paymentMethod: uzsOnlyPaymentMethod,
        debtDueDate: z.string().datetime().optional(),
        note: z.string().max(500).optional(),
    })
    .refine(
        (d) => {
            const uniqueProducts = new Set(d.items.map((i) => i.productId));
            return uniqueProducts.size === d.items.length;
        },
        { message: "Duplicate products in sale items", path: ["items"] }
    );

export const addPaymentSchema = z
    .object({
        amountUzs: z.number().positive("Payment must be greater than 0"),
        amountUsd: zeroUsdAmount,
        paymentMethod: uzsOnlyPaymentMethod,
        note: z.string().max(500).optional(),
    });

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
    limit: queryInteger(50, 200),
});

export const debtPaymentQuerySchema = z.object({
    branchId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: queryInteger(1, 1000000),
    pageSize: queryInteger(10, 100),
});
