import { z } from "zod";

export const registerStoreSchema = z.object({
    storeName: z.string().min(2).max(120),
    ownerName: z.string().min(2).max(100),
    phone: z.string().min(7).max(30),
    email: z.string().email().max(120).optional(),
    username: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    password: z.string().min(10).max(100),
    confirmPassword: z.string().min(1).max(100),
    planCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z0-9_]{1,29}$/)
        .default("START"),
}).strict().refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

export type RegisterStoreInput = z.infer<typeof registerStoreSchema>;
