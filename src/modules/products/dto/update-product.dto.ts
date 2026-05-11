import { z } from "zod";
import { updateProductSchema } from "../validations/product.validation";

export type UpdateProductDto = z.infer<typeof updateProductSchema>;
