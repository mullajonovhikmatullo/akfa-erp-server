"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_1 = require("../../core/middleware/validate");
const onboarding_controller_1 = require("./controllers/onboarding.controller");
const onboarding_validation_1 = require("./validations/onboarding.validation");
const router = (0, express_1.Router)();
router.post("/stores/register", (0, validate_1.validate)(onboarding_validation_1.registerStoreSchema), onboarding_controller_1.OnboardingController.registerStore);
exports.default = router;
