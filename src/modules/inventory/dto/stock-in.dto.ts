import { z } from "zod";
import { stockInBatchSchema, stockInSchema } from "../validations/inventory.validation";

export type StockInDto = z.infer<typeof stockInSchema>;
export type StockInBatchDto = z.infer<typeof stockInBatchSchema>;
