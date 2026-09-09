import { OAuth2Client } from "google-auth-library";
import { AppError } from "../../../core/errors/AppError";

const googleClient = new OAuth2Client({
    issuers: ["accounts.google.com", "https://accounts.google.com"],
    transporterOptions: { timeout: 10000, retryConfig: { retry: 1 } },
});

export const GoogleIdentityService = {
    getConfig() {
        //
        const value = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientId = value && /^[A-Za-z0-9.-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
        return { clientId };
    },

    async verifyCredential(credential: string) {
        //
        const { clientId } = GoogleIdentityService.getConfig();
        if (!clientId) throw new AppError(503, "Google sign-in is unavailable");

        try {
            const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
            const payload = ticket.getPayload();
            if (
                !payload || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
                payload.email_verified !== true || typeof payload.email !== "string" ||
                !payload.email || payload.email.length > 320
            ) {
                throw new AppError(401, "Invalid Google credential");
            }
            return { subject: payload.sub, email: payload.email };
        } catch (error) {
            if (error instanceof AppError) throw error;
            if (error instanceof Error && error.message.startsWith("Failed to retrieve verification certificates")) {
                throw new AppError(503, "Google sign-in is temporarily unavailable");
            }
            throw new AppError(401, "Invalid Google credential");
        }
    },
};
