import { z } from "zod";
import { addPaymentSchema } from "../validations/sale.validation";

export type AddPaymentDto = z.infer<typeof addPaymentSchema>;
