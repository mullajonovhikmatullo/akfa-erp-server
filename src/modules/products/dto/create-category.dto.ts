import { z } from "zod";
import { createCategorySchema } from "../validations/category.validation";

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
