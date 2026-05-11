import { z } from "zod";
import { updateCustomerSchema } from "../validations/customer.validation";

export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
