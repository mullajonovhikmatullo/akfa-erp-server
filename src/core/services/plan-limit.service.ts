import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { assertStoreWritableInTransaction } from "./billing-state.service";

export { lockStore } from "./store-lock.service";

type TransactionClient = Prisma.TransactionClient;
export type PlanResource = "branches" | "users" | "products";

const resourceConfig = {
    branches: {
        limitField: "maxBranches",
        label: "branch",
    },
    users: {
        limitField: "maxUsers",
        label: "active user",
    },
    products: {
        limitField: "maxProducts",
        label: "active product",
    },
} as const;

export async function assertPlanCapacity(
    tx: TransactionClient,
    storeId: string,
    resource: PlanResource,
    additional = 1
): Promise<void> {
    await assertStoreWritableInTransaction(tx, storeId);

    const store = await tx.store.findUnique({
        where: { id: storeId },
        select: {
            plan: {
                select: {
                    name: true,
                    maxBranches: true,
                    maxUsers: true,
                    maxProducts: true,
                },
            },
        },
    });

    if (!store?.plan) {
        throw new AppError(409, "Store does not have an active plan");
    }

    const config = resourceConfig[resource];
    const limit = store.plan[config.limitField];
    if (limit === null) return;

    let current: number;
    if (resource === "branches") {
        current = await tx.branch.count({ where: { storeId } });
    } else if (resource === "users") {
        current = await tx.user.count({ where: { storeId, isActive: true } });
    } else {
        current = await tx.product.count({ where: { storeId, isActive: true } });
    }

    if (current + additional > limit) {
        throw new AppError(409, `${store.plan.name} plan ${config.label} limit (${limit}) reached`);
    }
}
