import { Router } from "express";
import { validate } from "../../core/middleware/validate";
import { OnboardingController } from "./controllers/onboarding.controller";
import { registerStoreSchema } from "./validations/onboarding.validation";
import { registrationRateLimit } from "../../core/middleware/rateLimit";

const router = Router();

router.get("/plans", OnboardingController.listPlans);
router.post(
    "/stores/register",
    registrationRateLimit,
    validate(registerStoreSchema),
    OnboardingController.registerStore
);

export default router;
