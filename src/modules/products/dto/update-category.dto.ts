import { z } from "zod";
import { updateCategorySchema } from "../validations/category.validation";

export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
