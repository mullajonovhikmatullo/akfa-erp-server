import { JwtPayload } from "../types/jwt.types";

export const PLATFORM_ROLES = ["PLATFORM_OWNER"] as const;
export const STORE_OWNER_ROLES = ["STORE_OWNER"] as const;
export const STORE_MANAGER_ROLES = ["STORE_OWNER", "STORE_ADMIN"] as const;
export const BRANCH_SCOPED_ROLES = ["BRANCH_ADMIN", "CASHIER", "ADMIN"] as const;

export function isPlatformRole(role: JwtPayload["role"]): boolean {
    return PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]);
}

export function isStoreOwnerRole(role: JwtPayload["role"]): boolean {
    return STORE_OWNER_ROLES.includes(role as (typeof STORE_OWNER_ROLES)[number]);
}

export function isStoreManagerRole(role: JwtPayload["role"]): boolean {
    return STORE_MANAGER_ROLES.includes(role as (typeof STORE_MANAGER_ROLES)[number]);
}

export function isBranchScopedRole(role: JwtPayload["role"]): boolean {
    return BRANCH_SCOPED_ROLES.includes(role as (typeof BRANCH_SCOPED_ROLES)[number]);
}

export function isStoreRole(role: JwtPayload["role"]): boolean {
    return isStoreOwnerRole(role) || isStoreManagerRole(role) || isBranchScopedRole(role);
}

export function toClientRole(role: JwtPayload["role"]): string {
    if (role === "PLATFORM_OWNER") return "platform_owner";
    if (isStoreOwnerRole(role)) return "store_owner";
    return "branch_admin";
}
