import { AppError } from "../errors/AppError";
import { JwtPayload } from "../types/jwt.types";
import { isBranchScopedRole, isPlatformRole } from "./role-access";
import { prisma } from "../../infrastructure/prisma/prisma";
import { Prisma } from "@prisma/client";

export type StoreScopedWhere = {
    storeId: string;
    branchId?: string;
};

export function requireStoreId(user: JwtPayload): string {
    if (isPlatformRole(user.role)) {
        throw new AppError(403, "Platform accounts must use platform routes");
    }

    if (!user.storeId) {
        throw new AppError(403, "Your account is not assigned to any store");
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
export function resolveBranchId(
    requestedBranchId: string | undefined,
    user: JwtPayload
): string {
    requireStoreId(user);

    if (!isBranchScopedRole(user.role)) {
        if (!requestedBranchId) {
            throw new AppError(400, "branchId is required");
        }
        return requestedBranchId;
    }

    if (!user.branchId) {
        throw new AppError(403, "Your account is not assigned to any branch");
    }

    return user.branchId;
}

/**
 * Builds a Prisma `where` clause fragment that enforces branch scope.
 * ADMIN sees only their branch; SUPER_ADMIN can filter by branchId or see all.
 */
export function branchScope(
    user: JwtPayload,
    requestedBranchId?: string
): StoreScopedWhere {
    const storeId = requireStoreId(user);

    if (!isBranchScopedRole(user.role)) {
        return requestedBranchId ? { storeId, branchId: requestedBranchId } : { storeId };
    }

    if (!user.branchId) {
        throw new AppError(403, "Your account is not assigned to any branch");
    }

    return { storeId, branchId: user.branchId };
}

type Tx = Prisma.TransactionClient;

export async function assertBranchInStore(
    branchId: string,
    storeId: string,
    tx?: Tx
): Promise<void> {
    const client = tx ?? prisma;
    const branch = await client.branch.findFirst({
        where: { id: branchId, storeId },
        select: { id: true },
    });

    if (!branch) {
        throw new AppError(404, "Branch not found in this store");
    }
}

export async function assertBranchesInStore(
    branchIds: string[],
    storeId: string,
    tx?: Tx
): Promise<void> {
    const uniqueIds = [...new Set(branchIds)];
    if (uniqueIds.length === 0) return;

    const client = tx ?? prisma;
    const branches = await client.branch.findMany({
        where: { id: { in: uniqueIds }, storeId },
        select: { id: true },
    });

    if (branches.length !== uniqueIds.length) {
        throw new AppError(404, "One or more branches were not found in this store");
    }
}

export async function assertProductsInStore(
    productIds: string[],
    storeId: string,
    tx?: Tx
): Promise<void> {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length === 0) return;

    const client = tx ?? prisma;
    const products = await client.product.findMany({
        where: { id: { in: uniqueIds }, storeId },
        select: { id: true },
    });

    if (products.length !== uniqueIds.length) {
        throw new AppError(404, "One or more products were not found in this store");
    }
}
