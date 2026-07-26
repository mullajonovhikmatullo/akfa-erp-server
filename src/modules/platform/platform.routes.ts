import { Router } from "express";
import { roleMiddleware } from "../auth/middleware/role.middleware";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { PlatformController } from "./controllers/platform.controller";
import { validate } from "../../core/middleware/validate";
import { loginRateLimit, sensitiveActionRateLimit } from "../../core/middleware/rateLimit";
import { loginSchema } from "../auth/validations/auth.validation";
import {
    createPaymentSchema,
    createPlanSchema,
    deletePlanSchema,
    provisionStoreSchema,
    regenerateOwnerSetupSchema,
    updateStoreStatusSchema,
    updatePlanSchema,
} from "./validations/platform.validation";

const router = Router();

router.post("/auth/login", loginRateLimit, validate(loginSchema), PlatformController.login);

router.use(authMiddleware, roleMiddleware("PLATFORM_OWNER"));

router.get("/auth/me", PlatformController.me);
router.get("/dashboard", PlatformController.dashboard);
router.get("/plans", PlatformController.listPlans);
router.get("/plans/manage", PlatformController.listManagedPlans);
router.post(
    "/plans",
    sensitiveActionRateLimit,
    validate(createPlanSchema),
    PlatformController.createPlan
);
router.patch(
    "/plans/:id",
    sensitiveActionRateLimit,
    validate(updatePlanSchema),
    PlatformController.updatePlan
);
router.delete(
    "/plans/:id",
    sensitiveActionRateLimit,
    validate(deletePlanSchema),
    PlatformController.deletePlan
);

router.get("/stores", PlatformController.listStores);
router.post("/stores", validate(provisionStoreSchema), PlatformController.provisionStore);
router.get("/stores/:id", PlatformController.findStoreById);
router.patch(
    "/stores/:id/status",
    sensitiveActionRateLimit,
    validate(updateStoreStatusSchema),
    PlatformController.updateStoreStatus
);
router.post(
    "/stores/:id/owner/setup-link",
    sensitiveActionRateLimit,
    validate(regenerateOwnerSetupSchema),
    PlatformController.regenerateOwnerSetup
);

router.get("/payments", PlatformController.listPayments);
router.post("/payments", validate(createPaymentSchema), PlatformController.createPayment);
router.patch("/payments/:id/approve", PlatformController.approvePayment);
router.patch("/payments/:id/reject", PlatformController.rejectPayment);

export default router;
