import { z } from "zod";
import { updateAdminSchema } from "../validations/admin.validation";

export type UpdateAdminDto = z.infer<typeof updateAdminSchema>;
