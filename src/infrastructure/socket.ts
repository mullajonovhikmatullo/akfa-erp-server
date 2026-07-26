import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import {
    assertStoreReadable,
    refreshStoreBillingState,
} from "../core/services/billing-state.service";
import { JwtPayload } from "../core/types/jwt.types";
import { isPlatformRole, isStoreManagerRole } from "../core/utils/role-access";
import { prisma } from "./prisma/prisma";

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
const branchRoom = (branchId: string) => `branch:${branchId}`;
const userRoom = (userId: string) => `user:${userId}`;

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

    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        const secret = process.env.JWT_SECRET;
        if (!token || typeof token !== "string" || !secret) {
            return next(new Error("Unauthorized"));
        }

        try {
            const decoded = jwt.verify(token, secret) as JwtPayload;
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    role: true,
                    storeId: true,
                    branchId: true,
                    isActive: true,
                    mustChangePassword: true,
                    authVersion: true,
                },
            });

            if (
                !user ||
                !user.isActive ||
                user.mustChangePassword ||
                decoded.authVersion !== user.authVersion
            ) {
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

        void (async () => {
            const user = await prisma.user.findUnique({
                where: { id: initialUser.id },
                select: {
                    id: true,
                    role: true,
                    storeId: true,
                    branchId: true,
                    isActive: true,
                    mustChangePassword: true,
                    authVersion: true,
                },
            });

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
            if (user.branchId) {
                socket.join(branchRoom(user.branchId));
            }
        })().catch(() => socket.disconnect(true));
    });

    return io;
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
        .to(branchRoom(payload.fromBranchId))
        .to(branchRoom(payload.toBranchId))
        .emit("transfer:changed", payload);
}
