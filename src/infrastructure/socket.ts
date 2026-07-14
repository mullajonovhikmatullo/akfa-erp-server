import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { JwtPayload } from "../core/types/jwt.types";

type TransferChangedPayload = {
    transferId: string;
    status: "PENDING" | "COMPLETED" | "CANCELLED";
    fromBranchId: string;
    toBranchId: string;
};

let io: Server | null = null;

const superAdminsRoom = "role:SUPER_ADMIN";
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
        if (user?.role === "SUPER_ADMIN") {
            socket.join(superAdminsRoom);
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
        ?.to(superAdminsRoom)
        .to(branchRoom(payload.fromBranchId))
        .to(branchRoom(payload.toBranchId))
        .emit("transfer:changed", payload);
}
