export type JwtPayload = {
    id: string;
    role: "SUPER_ADMIN" | "ADMIN";
    branchId: string | null;
};
