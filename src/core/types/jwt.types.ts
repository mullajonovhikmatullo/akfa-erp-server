export type JwtPayload = {
    id: string;
    role:
        | "PLATFORM_OWNER"
        | "STORE_OWNER"
        | "STORE_ADMIN"
        | "BRANCH_ADMIN"
        | "CASHIER"
        | "SUPER_ADMIN"
        | "ADMIN";
    storeId: string | null;
    branchId: string | null;
};
