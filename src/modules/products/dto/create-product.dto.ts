import { z } from "zod";
import { createProductSchema } from "../validations/product.validation";

export type CreateProductDto = z.infer<typeof createProductSchema>;
