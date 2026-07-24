import { Router } from "express";
import { validate } from "../../core/middleware/validate";
import { OnboardingController } from "./controllers/onboarding.controller";
import { registerStoreSchema } from "./validations/onboarding.validation";

const router = Router();

router.post("/stores/register", validate(registerStoreSchema), OnboardingController.registerStore);

export default router;
