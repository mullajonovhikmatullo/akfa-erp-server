import { z } from "zod";
import { stockInSchema } from "../validations/inventory.validation";

export type StockInDto = z.infer<typeof stockInSchema>;
