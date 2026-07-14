"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleMiddleware = roleMiddleware;
const AppError_1 = require("../../../core/errors/AppError");
function roleMiddleware(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new AppError_1.AppError(401, "Unauthorized"));
        }
        if (!roles.includes(req.user.role)) {
            return next(new AppError_1.AppError(403, "Forbidden: insufficient permissions"));
        }
        next();
    };
}
