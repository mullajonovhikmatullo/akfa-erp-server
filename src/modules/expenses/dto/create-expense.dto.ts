import { z } from "zod";
import { createExpenseSchema } from "../validations/expense.validation";

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
