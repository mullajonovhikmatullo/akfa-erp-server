import { z } from "zod";

export const loginSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(1).max(100),
}).strict();

export const exchangeHandoffSchema = z.object({
    handoffCode: z.string().min(32).max(200),
}).strict();

export const completeAccountSetupSchema = z.object({
    setupCode: z.string().min(32).max(200),
    newPassword: z.string().min(6).max(100),
    confirmPassword: z.string().min(1).max(100),
}).strict().refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ExchangeHandoffInput = z.infer<typeof exchangeHandoffSchema>;
export type CompleteAccountSetupInput = z.infer<typeof completeAccountSetupSchema>;
