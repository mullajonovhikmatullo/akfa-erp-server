import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { authenticateToken } from "../core/services/auth-identity.service";
import {
    assertStoreReadable,
    refreshStoreBillingState,
} from "../core/services/billing-state.service";
import { JwtPayload } from "../core/types/jwt.types";
import { isPlatformRole, isStoreManagerRole } from "../core/utils/role-access";

type TransferChangedPayload = {
    storeId: string;
    transferId: string;
    status: "PENDING" | "COMPLETED" | "CANCELLED";
    fromBranchId: string;
    toBranchId: string;
};

let io: Server | null = null;

const platformOwnersRoom = "role:PLATFORM_OWNER";
const tenantLifecycleRoom = (storeId: string) => `tenant-lifecycle:${storeId}`;
const storeManagersRoom = (storeId: string) => `store-managers:${storeId}`;
const branchRoom = (storeId: string, branchId: string) => `store:${storeId}:branch:${branchId}`;
const userRoom = (userId: string) => `user:${userId}`;

export function initSocketServer(
    server: HttpServer,
    isOriginAllowed: (origin?: string) => boolean
) {
    if (io) throw new Error("Socket server is already initialized");
    io = new Server(server, {
        path: process.env.SOCKET_IO_PATH || "/api/socket.io",
        maxHttpBufferSize: 64 * 1024,
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin)) return callback(null, true);
                return callback(new Error(`Socket CORS: origin ${origin} not allowed`));
            },
            credentials: true,
        },
    });

    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        const secret = process.env.JWT_SECRET;
        if (!token || typeof token !== "string" || token.length > 8192 || !secret) {
            return next(new Error("Unauthorized"));
        }

        try {
            const { user, expiresAt } = await authenticateToken(token);
            if (user.mustChangePassword) {
                return next(new Error("Unauthorized"));
            }

            if (!isPlatformRole(user.role)) {
                if (!user.storeId) return next(new Error("Unauthorized"));
                const billingState = await refreshStoreBillingState(user.storeId);
                assertStoreReadable(billingState);
            }

            socket.data.user = {
                id: user.id,
                role: user.role,
                storeId: user.storeId,
                branchId: user.branchId,
                authVersion: user.authVersion,
            } satisfies JwtPayload;
            socket.data.expiresAt = expiresAt;
            return next();
        } catch {
            return next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const initialUser = socket.data.user as JwtPayload | undefined;
        if (!initialUser) {
            socket.disconnect(true);
            return;
        }

        // Join revocation rooms before the final DB check so a concurrent
        // cancellation or disable cannot slip past the handshake.
        socket.join(userRoom(initialUser.id));
        if (initialUser.storeId) {
            socket.join(tenantLifecycleRoom(initialUser.storeId));
        }

        // Expired JWTs must not keep receiving events through a long-lived socket.
        let expiryTimer: NodeJS.Timeout | undefined;
        const expire = () => {
            const expiresAt = socket.data.expiresAt as number | undefined;
            if (expiresAt === undefined) return;
            const remaining = expiresAt - Date.now();
            if (remaining <= 0) return void socket.disconnect(true);
            expiryTimer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
            expiryTimer.unref();
        };
        expire();
        socket.once("disconnect", () => { if (expiryTimer) clearTimeout(expiryTimer); });

        void (async () => {
            const { user } = await authenticateToken(socket.handshake.auth.token);

            if (
                !socket.connected ||
                !user ||
                !user.isActive ||
                user.mustChangePassword ||
                user.authVersion !== initialUser.authVersion ||
                user.storeId !== initialUser.storeId
            ) {
                socket.disconnect(true);
                return;
            }

            if (!isPlatformRole(user.role)) {
                if (!user.storeId) {
                    socket.disconnect(true);
                    return;
                }

                try {
                    const billingState = await refreshStoreBillingState(user.storeId);
                    assertStoreReadable(billingState);
                } catch {
                    socket.disconnect(true);
                    return;
                }
            }

            if (!socket.connected) return;
            socket.data.user = user satisfies JwtPayload;

            if (isPlatformRole(user.role)) {
                socket.join(platformOwnersRoom);
            }
            if (user.storeId && isStoreManagerRole(user.role)) {
                socket.join(storeManagersRoom(user.storeId));
            }
            if (user.storeId && user.branchId) {
                socket.join(branchRoom(user.storeId, user.branchId));
            }
        })().catch(() => socket.disconnect(true));
    });

    return io;
}

export async function closeSocketServer(): Promise<void> {
    const current = io;
    io = null;
    if (current) await new Promise<void>((resolve) => current.close(() => resolve()));
}

export function disconnectStoreSockets(storeId: string): void {
    io?.in(tenantLifecycleRoom(storeId)).disconnectSockets(true);
}

export function disconnectUserSockets(userId: string): void {
    io?.in(userRoom(userId)).disconnectSockets(true);
}

export function emitTransferChanged(payload: TransferChangedPayload) {
    io
        ?.to(platformOwnersRoom)
        .to(storeManagersRoom(payload.storeId))
        .to(branchRoom(payload.storeId, payload.fromBranchId))
        .to(branchRoom(payload.storeId, payload.toBranchId))
        .emit("transfer:changed", payload);
}
