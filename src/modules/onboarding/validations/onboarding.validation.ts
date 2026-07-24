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
    password: z.string().min(6).max(100),
    planCode: z.enum(["START", "BUSINESS", "NETWORK"]).default("START"),
});

export type RegisterStoreInput = z.infer<typeof registerStoreSchema>;
