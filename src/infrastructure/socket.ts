import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { JwtPayload } from "../core/types/jwt.types";

type TransferChangedPayload = {
    storeId: string;
    transferId: string;
    status: "PENDING" | "COMPLETED" | "CANCELLED";
    fromBranchId: string;
    toBranchId: string;
};

let io: Server | null = null;

const platformOwnersRoom = "role:PLATFORM_OWNER";
const storeRoom = (storeId: string) => `store:${storeId}`;
const branchRoom = (branchId: string) => `branch:${branchId}`;

export function initSocketServer(
    server: HttpServer,
    isOriginAllowed: (origin?: string) => boolean
) {
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin)) return callback(null, true);
                return callback(new Error(`Socket CORS: origin ${origin} not allowed`));
            },
            credentials: true,
        },
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== "string") return next(new Error("Unauthorized"));

        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || "dev-secret"
            ) as JwtPayload;
            socket.data.user = decoded;
            return next();
        } catch {
            return next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const user = socket.data.user as JwtPayload | undefined;
        if (user?.role === "PLATFORM_OWNER") {
            socket.join(platformOwnersRoom);
        }
        if (user?.storeId) {
            socket.join(storeRoom(user.storeId));
        }
        if (user?.branchId) {
            socket.join(branchRoom(user.branchId));
        }

        socket.on("disconnect", () => undefined);
    });

    return io;
}

export function emitTransferChanged(payload: TransferChangedPayload) {
    io
        ?.to(platformOwnersRoom)
        .to(storeRoom(payload.storeId))
        .to(branchRoom(payload.fromBranchId))
        .to(branchRoom(payload.toBranchId))
        .emit("transfer:changed", payload);
}
