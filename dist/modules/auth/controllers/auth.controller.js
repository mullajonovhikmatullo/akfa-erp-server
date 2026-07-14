"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const ApiResponse_1 = require("../../../core/response/ApiResponse");
const auth_service_1 = require("../services/auth.service");
const AppError_1 = require("../../../core/errors/AppError");
exports.AuthController = {
    async login(req, res, next) {
        try {
            const result = await auth_service_1.AuthService.login(req.body);
            return ApiResponse_1.ApiResponse.success(res, result, "Login successful");
        }
        catch (error) {
            next(error);
        }
    },
    async me(req, res, next) {
        try {
            const result = await auth_service_1.AuthService.me(req.user.id);
            return ApiResponse_1.ApiResponse.success(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    async updateProfile(req, res, next) {
        try {
            const parsed = auth_service_1.updateProfileSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new AppError_1.AppError(422, parsed.error.issues[0]?.message ?? "Validation error");
            }
            const result = await auth_service_1.AuthService.updateProfile(req.user.id, parsed.data);
            return ApiResponse_1.ApiResponse.success(res, result, "Profil yangilandi");
        }
        catch (error) {
            next(error);
        }
    },
    async changePassword(req, res, next) {
        try {
            const parsed = auth_service_1.changePasswordSchema.safeParse(req.body);
            if (!parsed.success) {
                throw new AppError_1.AppError(422, parsed.error.issues[0]?.message ?? "Validation error");
            }
            const result = await auth_service_1.AuthService.changePassword(req.user.id, parsed.data);
            return ApiResponse_1.ApiResponse.success(res, result, result.message);
        }
        catch (error) {
            next(error);
        }
    },
};
