"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStoreId = requireStoreId;
exports.resolveBranchId = resolveBranchId;
exports.requireAssignedBranchId = requireAssignedBranchId;
exports.branchScope = branchScope;
exports.assertBranchInStore = assertBranchInStore;
exports.assertBranchesInStore = assertBranchesInStore;
exports.assertProductsInStore = assertProductsInStore;
const AppError_1 = require("../errors/AppError");
const role_access_1 = require("./role-access");
const prisma_1 = require("../../infrastructure/prisma/prisma");
function requireStoreId(user) {
    if ((0, role_access_1.isPlatformRole)(user.role)) {
        throw new AppError_1.AppError(403, "Platform accounts must use platform routes");
    }
    if (!user.storeId) {
        throw new AppError_1.AppError(403, "Your account is not assigned to any store");
    }
    return user.storeId;
}
/**
 * Resolves which branchId an operation targets.
 *
 * Users assigned to a branch operate in that branch by default.
 * Branch-scoped roles are always locked to their own branch — requestedBranchId is ignored.
 * Store manager roles may still target another branch explicitly for manager workflows.
 *
 * This is the single enforcement point for branch isolation across all modules.
 */
function resolveBranchId(requestedBranchId, user) {
    requireStoreId(user);
    if ((0, role_access_1.isBranchScopedRole)(user.role)) {
        if (!user.branchId) {
            throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
        }
        return user.branchId;
    }
    if (requestedBranchId) {
        return requestedBranchId;
    }
    if (user.branchId) {
        return user.branchId;
    }
    throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
}
function requireAssignedBranchId(user) {
    requireStoreId(user);
    if (!user.branchId) {
        throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
    }
    return user.branchId;
}
/**
 * Builds a Prisma `where` clause fragment that enforces branch scope.
 * ADMIN sees only their branch; STORE_OWNER can filter by branchId or see all.
 */
function branchScope(user, requestedBranchId) {
    const storeId = requireStoreId(user);
    if (!(0, role_access_1.isBranchScopedRole)(user.role)) {
        return requestedBranchId ? { storeId, branchId: requestedBranchId } : { storeId };
    }
    if (!user.branchId) {
        throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
    }
    return { storeId, branchId: user.branchId };
}
async function assertBranchInStore(branchId, storeId, tx) {
    const client = tx ?? prisma_1.prisma;
    const branch = await client.branch.findFirst({
        where: { id: branchId, storeId },
        select: { id: true },
    });
    if (!branch) {
        throw new AppError_1.AppError(404, "Branch not found in this store");
    }
}
async function assertBranchesInStore(branchIds, storeId, tx) {
    const uniqueIds = [...new Set(branchIds)];
    if (uniqueIds.length === 0)
        return;
    const client = tx ?? prisma_1.prisma;
    const branches = await client.branch.findMany({
        where: { id: { in: uniqueIds }, storeId },
        select: { id: true },
    });
    if (branches.length !== uniqueIds.length) {
        throw new AppError_1.AppError(404, "One or more branches were not found in this store");
    }
}
async function assertProductsInStore(productIds, storeId, tx) {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length === 0)
        return;
    const client = tx ?? prisma_1.prisma;
    const products = await client.product.findMany({
        where: { id: { in: uniqueIds }, storeId },
        select: { id: true },
    });
    if (products.length !== uniqueIds.length) {
        throw new AppError_1.AppError(404, "One or more products were not found in this store");
    }
}
