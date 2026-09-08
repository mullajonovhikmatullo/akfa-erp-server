"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../../../core/errors/AppError");
const auth_identity_service_1 = require("../../../core/services/auth-identity.service");
const billing_state_service_1 = require("../../../core/services/billing-state.service");
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
function isAuthSelfServicePath(path) {
    return ["/profile", "/change-password", "/me", "/auth/profile", "/auth/change-password", "/auth/me"].some((prefix) => path.startsWith(prefix));
}
function isBillingRecoveryPath(req) {
    return req.method === "POST" && /^(?:\/api)?\/billing\/payments\/?$/.test(req.originalUrl.split("?")[0] ?? "");
}
async function authMiddleware(req, res, next) {
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Authorization");
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError_1.AppError(401, "Unauthorized");
        }
        const { user } = await (0, auth_identity_service_1.authenticateToken)(authHeader.slice(7));
        if (user.mustChangePassword && !isAuthSelfServicePath(req.path)) {
            throw new AppError_1.AppError(403, "Password change is required");
        }
        if (user.storeId) {
            const billingState = await (0, billing_state_service_1.refreshStoreBillingState)(user.storeId);
            (0, billing_state_service_1.assertStoreReadable)(billingState);
            if (!READ_METHODS.has(req.method) &&
                !isAuthSelfServicePath(req.path) &&
                !isBillingRecoveryPath(req)) {
                (0, billing_state_service_1.assertStoreWritable)(billingState);
            }
        }
        req.user = {
            id: user.id,
            role: user.role,
            storeId: user.storeId,
            branchId: user.branchId,
            authVersion: user.authVersion,
        };
        next();
    }
    catch (error) {
        if (error instanceof AppError_1.AppError)
            return next(error);
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return next(new AppError_1.AppError(401, "Invalid or expired token"));
        }
        next(error);
    }
}
