import { Router } from "express";
import { sensitiveActionRateLimit } from "../../core/middleware/rateLimit";
import { validate } from "../../core/middleware/validate";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { roleMiddleware } from "../auth/middleware/role.middleware";
import { BillingController } from "./controllers/billing.controller";
import { submitTenantPaymentSchema } from "./validations/billing.validation";

const router = Router();

router.use(
    authMiddleware,
    roleMiddleware("STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN")
);

router.get("/", BillingController.summary);
router.get("/payments", BillingController.listPayments);
router.post(
    "/payments",
    sensitiveActionRateLimit,
    validate(submitTenantPaymentSchema),
    BillingController.submitPayment
);

export default router;
