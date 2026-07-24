"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRANCH_SCOPED_ROLES = exports.STORE_MANAGER_ROLES = exports.STORE_OWNER_ROLES = exports.PLATFORM_ROLES = void 0;
exports.isPlatformRole = isPlatformRole;
exports.isStoreOwnerRole = isStoreOwnerRole;
exports.isStoreManagerRole = isStoreManagerRole;
exports.isBranchScopedRole = isBranchScopedRole;
exports.isStoreRole = isStoreRole;
exports.toClientRole = toClientRole;
exports.PLATFORM_ROLES = ["PLATFORM_OWNER"];
exports.STORE_OWNER_ROLES = ["STORE_OWNER", "SUPER_ADMIN"];
exports.STORE_MANAGER_ROLES = ["STORE_OWNER", "STORE_ADMIN", "SUPER_ADMIN"];
exports.BRANCH_SCOPED_ROLES = ["BRANCH_ADMIN", "CASHIER", "ADMIN"];
function isPlatformRole(role) {
    return exports.PLATFORM_ROLES.includes(role);
}
function isStoreOwnerRole(role) {
    return exports.STORE_OWNER_ROLES.includes(role);
}
function isStoreManagerRole(role) {
    return exports.STORE_MANAGER_ROLES.includes(role);
}
function isBranchScopedRole(role) {
    return exports.BRANCH_SCOPED_ROLES.includes(role);
}
function isStoreRole(role) {
    return isStoreOwnerRole(role) || isStoreManagerRole(role) || isBranchScopedRole(role);
}
function toClientRole(role) {
    if (role === "PLATFORM_OWNER")
        return "platform_owner";
    if (isStoreOwnerRole(role))
        return "super_admin";
    return "branch_admin";
}
