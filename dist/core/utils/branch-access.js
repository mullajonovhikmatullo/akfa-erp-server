"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBranchId = resolveBranchId;
exports.branchScope = branchScope;
const AppError_1 = require("../errors/AppError");
/**
 * Resolves which branchId an operation targets.
 *
 * ADMIN is always locked to their own branch — requestedBranchId is ignored.
 * SUPER_ADMIN must explicitly supply a branchId.
 *
 * This is the single enforcement point for branch isolation across all modules.
 */
function resolveBranchId(requestedBranchId, user) {
    if (user.role === "SUPER_ADMIN") {
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
    if (user.role === "SUPER_ADMIN") {
        return requestedBranchId ? { branchId: requestedBranchId } : {};
    }
    if (!user.branchId) {
        throw new AppError_1.AppError(403, "Your account is not assigned to any branch");
    }
    return { branchId: user.branchId };
}
