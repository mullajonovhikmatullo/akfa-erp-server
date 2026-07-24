"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStoreId = requireStoreId;
exports.resolveBranchId = resolveBranchId;
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
 * ADMIN is always locked to their own branch — requestedBranchId is ignored.
 * SUPER_ADMIN must explicitly supply a branchId.
 *
 * This is the single enforcement point for branch isolation across all modules.
 */
function resolveBranchId(requestedBranchId, user) {
    requireStoreId(user);
    if (!(0, role_access_1.isBranchScopedRole)(user.role)) {
        if (!requestedBranchId) {
            throw new AppError_1.AppError(400, "branchId is required");
        }
        return requestedBranchId;
    }
    if (!user.branchId) {
        throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
    }
    return user.branchId;
}
/**
 * Builds a Prisma `where` clause fragment that enforces branch scope.
 * ADMIN sees only their branch; SUPER_ADMIN can filter by branchId or see all.
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
