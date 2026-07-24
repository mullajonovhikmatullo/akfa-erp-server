import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/jwt.types";

export function signAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"],
    });
}
