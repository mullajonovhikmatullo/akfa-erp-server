import { TenantProvisioningService } from "./tenant-provisioning.service";
import { RegisterStoreInput } from "../validations/onboarding.validation";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { ListWindow, listWindowSchema } from "../../../core/utils/pagination";

export const OnboardingService = {
    async listPublicPlans(window: ListWindow = listWindowSchema.parse({})) {
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
            orderBy: [{ monthlyPriceUzs: "asc" }, { id: "asc" }],
            take: window.limit,
            skip: window.offset,
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
