import { z } from "zod";

const ownerPassword = z.string().min(1, "Store owner password is required").max(200);

export const updateExchangeRateSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("CBU"), ownerPassword }).strict(),
    z.object({
        mode: z.literal("MANUAL"),
        rate: z.number().positive().min(1000, "Rate looks wrong").max(1000000, "Rate looks wrong").multipleOf(0.01),
        ownerPassword,
    }).strict(),
]);

export type UpdateExchangeRateDto = z.infer<typeof updateExchangeRateSchema>;
