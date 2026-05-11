import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppError } from "../../../core/errors/AppError";
import { prisma } from "../../../infrastructure/prisma/prisma";

function normalizeRole(role: string) {
    return role === "SUPER_ADMIN" ? "super_admin" : "branch_admin";
}

export const AuthService = {
    async me(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, fullName: true, username: true, role: true, branchId: true, isActive: true },
        });
        if (!user || !user.isActive) throw new AppError(401, "Unauthorized");
        return {
            id: user.id,
            name: user.fullName,
            username: user.username,
            role: normalizeRole(user.role),
            branchId: user.branchId,
        };
    },

    async login(data: { username: string; password: string }) {
        const user = await prisma.user.findUnique({
            where: { username: data.username },
        });

        if (!user) {
            throw new AppError(401, "Invalid credentials");
        }

        if (!user.isActive) {
            throw new AppError(403, "Account is disabled");
        }

        const isMatch = await bcrypt.compare(data.password, user.password);
        if (!isMatch) {
            throw new AppError(401, "Invalid credentials");
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, branchId: user.branchId },
            process.env.JWT_SECRET as string,
            { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"] }
        );

        return {
            accessToken: token,
            user: {
                id: user.id,
                name: user.fullName,
                username: user.username,
                role: normalizeRole(user.role),
                branchId: user.branchId,
            },
        };
    },
};
