import { z } from "zod";
import { createAdminSchema } from "../validations/admin.validation";

export type CreateAdminDto = z.infer<typeof createAdminSchema>;
