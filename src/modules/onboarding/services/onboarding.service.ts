import { TenantProvisioningService } from "./tenant-provisioning.service";
import { RegisterStoreInput } from "../validations/onboarding.validation";
import { prisma } from "../../../infrastructure/prisma/prisma";

export const OnboardingService = {
    async listPublicPlans() {
        const plans = await prisma.plan.findMany({
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

    async registerStore(input: RegisterStoreInput) {
        const { confirmPassword: _confirmPassword, ...provisionInput } = input;
        const result = await TenantProvisioningService.registerPublic(provisionInput);

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
