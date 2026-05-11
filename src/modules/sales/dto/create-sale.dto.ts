import { z } from "zod";
import { createSaleSchema } from "../validations/sale.validation";

export type CreateSaleDto = z.infer<typeof createSaleSchema>;
