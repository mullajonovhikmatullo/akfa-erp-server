import { z } from "zod";
import { createExpenseCategorySchema, updateExpenseCategorySchema } from "../validations/expense-category.validation";

export type CreateExpenseCategoryDto = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryDto = z.infer<typeof updateExpenseCategorySchema>;
