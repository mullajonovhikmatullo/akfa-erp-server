import { z } from "zod";
import { createTransferSchema } from "../validations/transfer.validation";

export type CreateTransferDto = z.infer<typeof createTransferSchema>;
