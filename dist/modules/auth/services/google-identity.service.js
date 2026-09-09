"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleIdentityService = void 0;
const google_auth_library_1 = require("google-auth-library");
const AppError_1 = require("../../../core/errors/AppError");
const googleClient = new google_auth_library_1.OAuth2Client({
    issuers: ["accounts.google.com", "https://accounts.google.com"],
    transporterOptions: { timeout: 10000, retryConfig: { retry: 1 } },
});
exports.GoogleIdentityService = {
    getConfig() {
        //
        const value = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientId = value && /^[A-Za-z0-9.-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
        return { clientId };
    },
    async verifyCredential(credential) {
        //
        const { clientId } = exports.GoogleIdentityService.getConfig();
        if (!clientId)
            throw new AppError_1.AppError(503, "Google sign-in is unavailable");
        try {
            const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
            const payload = ticket.getPayload();
            if (!payload || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
                payload.email_verified !== true || typeof payload.email !== "string" ||
                !payload.email || payload.email.length > 320) {
                throw new AppError_1.AppError(401, "Invalid Google credential");
            }
            return { subject: payload.sub, email: payload.email };
        }
        catch (error) {
            if (error instanceof AppError_1.AppError)
                throw error;
            if (error instanceof Error && error.message.startsWith("Failed to retrieve verification certificates")) {
                throw new AppError_1.AppError(503, "Google sign-in is temporarily unavailable");
            }
            throw new AppError_1.AppError(401, "Invalid Google credential");
        }
    },
};
