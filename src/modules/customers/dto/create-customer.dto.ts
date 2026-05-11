import { z } from "zod";
import { createCustomerSchema } from "../validations/customer.validation";

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
