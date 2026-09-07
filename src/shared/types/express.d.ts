import { JwtPayload } from "../../core/types/jwt.types";

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
            releaseImageUpload?: () => void;
        }
    }
}

export {};
