"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockStore = void 0;
exports.assertPlanCapacity = assertPlanCapacity;
const AppError_1 = require("../errors/AppError");
const billing_state_service_1 = require("./billing-state.service");
var store_lock_service_1 = require("./store-lock.service");
Object.defineProperty(exports, "lockStore", { enumerable: true, get: function () { return store_lock_service_1.lockStore; } });
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
};
async function assertPlanCapacity(tx, storeId, resource, additional = 1) {
    await (0, billing_state_service_1.assertStoreWritableInTransaction)(tx, storeId);
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
        throw new AppError_1.AppError(409, "Store does not have an active plan");
    }
    const config = resourceConfig[resource];
    const limit = store.plan[config.limitField];
    if (limit === null)
        return;
    let current;
    if (resource === "branches") {
        current = await tx.branch.count({ where: { storeId } });
    }
    else if (resource === "users") {
        current = await tx.user.count({ where: { storeId, isActive: true } });
    }
    else {
        current = await tx.product.count({ where: { storeId, isActive: true } });
    }
    if (current + additional > limit) {
        throw new AppError_1.AppError(409, `${store.plan.name} plan ${config.label} limit (${limit}) reached`);
    }
}
