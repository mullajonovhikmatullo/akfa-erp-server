import { z } from "zod";
import { adjustmentSchema } from "../validations/inventory.validation";

export type AdjustmentDto = z.infer<typeof adjustmentSchema>;
