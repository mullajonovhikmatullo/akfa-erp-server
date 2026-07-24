"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../../../core/errors/AppError");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const role_access_1 = require("../../../core/utils/role-access");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
function isAuthSelfServicePath(path) {
    return ["/profile", "/change-password", "/me", "/auth/profile", "/auth/change-password", "/auth/me"].some((prefix) => path.startsWith(prefix));
}
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError_1.AppError(401, "Unauthorized");
        }
        const token = authHeader.split(" ")[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, branchId: true, storeId: true, isActive: true },
        });
        if (!user || !user.isActive) {
            throw new AppError_1.AppError(401, "Unauthorized");
        }
        if (!(0, role_access_1.isPlatformRole)(user.role) && !user.storeId) {
            throw new AppError_1.AppError(403, "Your account is not assigned to any store");
        }
        if (user.storeId) {
            const billingState = await (0, billing_state_service_1.refreshStoreBillingState)(user.storeId);
            (0, billing_state_service_1.assertStoreReadable)(billingState);
            if (!READ_METHODS.has(req.method) && !isAuthSelfServicePath(req.path)) {
                (0, billing_state_service_1.assertStoreWritable)(billingState);
            }
        }
        req.user = {
            id: user.id,
            role: user.role,
            storeId: user.storeId,
            branchId: user.branchId,
        };
        next();
    }
    catch (error) {
        if (error instanceof AppError_1.AppError)
            return next(error);
        next(new AppError_1.AppError(401, "Invalid or expired token"));
    }
}
