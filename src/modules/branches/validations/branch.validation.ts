import { z } from "zod";

const branchFields = {
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(300).optional(),
    phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9\s\-()]{7,30}$/, "Invalid phone number format")
        .optional(),
};

export const createBranchSchema = z.object(branchFields).strict();

export const updateBranchSchema = z
    .object({
        name: branchFields.name.optional(),
        address: branchFields.address,
        phone: branchFields.phone,
    })
    .strict();
