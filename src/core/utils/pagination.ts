import { z } from "zod";

// Keep existing array responses; callers can traverse them with limit/offset.
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;

export function queryInteger(fallback: number, maximum: number, minimum = 1) {
    return z.string().regex(/^\d+$/, "Must be an integer")
        .transform(Number)
        .pipe(z.number().int().min(minimum).max(maximum))
        .optional().transform((value) => value ?? fallback);
}

export const listWindowSchema = z.object({
    limit: queryInteger(DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT),
    offset: queryInteger(0, 1_000_000, 0),
});

export const paginationSchema = z.object({
    page: queryInteger(1, 1_000_000),
    pageSize: queryInteger(10, 100),
});

export type ListWindow = z.infer<typeof listWindowSchema>;
