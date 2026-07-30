export type JwtPayload = {
    id: string;
    role:
        | "PLATFORM_OWNER"
        | "STORE_OWNER"
        | "STORE_ADMIN"
        | "BRANCH_ADMIN"
        | "CASHIER"
        | "ADMIN";
    storeId: string | null;
    branchId: string | null;
    authVersion: number;
};
