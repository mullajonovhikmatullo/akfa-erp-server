"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingService = void 0;
const tenant_provisioning_service_1 = require("./tenant-provisioning.service");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
exports.OnboardingService = {
    async listPublicPlans() {
        const plans = await prisma_1.prisma.plan.findMany({
            where: { isActive: true, isPublic: true },
            select: {
                code: true,
                name: true,
                monthlyPriceUzs: true,
                maxBranches: true,
                maxUsers: true,
                maxProducts: true,
            },
            orderBy: { monthlyPriceUzs: "asc" },
        });
        return plans.map((plan) => ({
            ...plan,
            monthlyPriceUzs: Number(plan.monthlyPriceUzs),
        }));
    },
    async registerStore(input) {
        const { confirmPassword: _confirmPassword, ...provisionInput } = input;
        const result = await tenant_provisioning_service_1.TenantProvisioningService.registerPublic(provisionInput);
        return {
            handoffCode: result.handoff.code,
            handoffExpiresAt: result.handoff.expiresAt,
            user: result.owner,
            store: result.store,
            branch: result.branch,
            subscription: result.subscription,
        };
    },
};
