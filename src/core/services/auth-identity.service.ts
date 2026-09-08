import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError";
import { isPlatformRole } from "../utils/role-access";
import { prisma } from "../../infrastructure/prisma/prisma";

// Resolve identity afresh for each HTTP request/socket verification. Never cache it.
export async function authenticateToken(token: string) {
    if (!token || token.length > 8192) throw new AppError(401, "Unauthorized");
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ["HS256"] });
    if (typeof decoded !== "object" || typeof decoded.id !== "string" || !decoded.id ||
        !Number.isSafeInteger(decoded.authVersion) || decoded.authVersion < 0) {
        throw new AppError(401, "Unauthorized");
    }
    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
            id: true, role: true, storeId: true, branchId: true, isActive: true,
            mustChangePassword: true, authVersion: true,
            branch: { select: { storeId: true } },
        },
    });
    if (!user?.isActive || decoded.authVersion !== user.authVersion) {
        throw new AppError(401, "Unauthorized");
    }
    if (!isPlatformRole(user.role) && (!user.storeId ||
        (user.branchId !== null && user.branch?.storeId !== user.storeId))) {
        throw new AppError(403, "Your account has no valid store assignment");
    }
    const { branch: _branch, ...identity } = user;
    return { user: identity, expiresAt: decoded.exp === undefined ? undefined : decoded.exp * 1000 };
}
