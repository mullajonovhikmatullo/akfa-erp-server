import { Router } from "express";
import { roleMiddleware } from "../auth/middleware/role.middleware";
import { authMiddleware } from "../auth/middleware/auth.middleware";
import { PlatformController } from "./controllers/platform.controller";

const router = Router();

router.use(authMiddleware, roleMiddleware("PLATFORM_OWNER"));

router.get("/dashboard", PlatformController.dashboard);

router.get("/stores", PlatformController.listStores);
router.get("/stores/:id", PlatformController.findStoreById);
router.patch("/stores/:id/status", PlatformController.updateStoreStatus);

router.get("/payments", PlatformController.listPayments);
router.post("/payments", PlatformController.createPayment);
router.patch("/payments/:id/approve", PlatformController.approvePayment);
router.patch("/payments/:id/reject", PlatformController.rejectPayment);

export default router;
