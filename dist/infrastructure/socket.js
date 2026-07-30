"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.disconnectStoreSockets = disconnectStoreSockets;
exports.disconnectUserSockets = disconnectUserSockets;
exports.emitTransferChanged = emitTransferChanged;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const billing_state_service_1 = require("../core/services/billing-state.service");
const role_access_1 = require("../core/utils/role-access");
const prisma_1 = require("./prisma/prisma");
let io = null;
const platformOwnersRoom = "role:PLATFORM_OWNER";
const tenantLifecycleRoom = (storeId) => `tenant-lifecycle:${storeId}`;
const storeManagersRoom = (storeId) => `store-managers:${storeId}`;
const branchRoom = (branchId) => `branch:${branchId}`;
const userRoom = (userId) => `user:${userId}`;
function initSocketServer(server, isOriginAllowed) {
    io = new socket_io_1.Server(server, {
        path: process.env.SOCKET_IO_PATH || "/api/socket.io",
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin))
                    return callback(null, true);
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
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            const user = await prisma_1.prisma.user.findUnique({
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
            if (!user ||
                !user.isActive ||
                user.mustChangePassword ||
                decoded.authVersion !== user.authVersion) {
                return next(new Error("Unauthorized"));
            }
            if (!(0, role_access_1.isPlatformRole)(user.role)) {
                if (!user.storeId)
                    return next(new Error("Unauthorized"));
                const billingState = await (0, billing_state_service_1.refreshStoreBillingState)(user.storeId);
                (0, billing_state_service_1.assertStoreReadable)(billingState);
            }
            socket.data.user = {
                id: user.id,
                role: user.role,
                storeId: user.storeId,
                branchId: user.branchId,
                authVersion: user.authVersion,
            };
            return next();
        }
        catch {
            return next(new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const initialUser = socket.data.user;
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
            const user = await prisma_1.prisma.user.findUnique({
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
            if (!socket.connected ||
                !user ||
                !user.isActive ||
                user.mustChangePassword ||
                user.authVersion !== initialUser.authVersion ||
                user.storeId !== initialUser.storeId) {
                socket.disconnect(true);
                return;
            }
            if (!(0, role_access_1.isPlatformRole)(user.role)) {
                if (!user.storeId) {
                    socket.disconnect(true);
                    return;
                }
                try {
                    const billingState = await (0, billing_state_service_1.refreshStoreBillingState)(user.storeId);
                    (0, billing_state_service_1.assertStoreReadable)(billingState);
                }
                catch {
                    socket.disconnect(true);
                    return;
                }
            }
            if (!socket.connected)
                return;
            socket.data.user = user;
            if ((0, role_access_1.isPlatformRole)(user.role)) {
                socket.join(platformOwnersRoom);
            }
            if (user.storeId && (0, role_access_1.isStoreManagerRole)(user.role)) {
                socket.join(storeManagersRoom(user.storeId));
            }
            if (user.branchId) {
                socket.join(branchRoom(user.branchId));
            }
        })().catch(() => socket.disconnect(true));
    });
    return io;
}
function disconnectStoreSockets(storeId) {
    io?.in(tenantLifecycleRoom(storeId)).disconnectSockets(true);
}
function disconnectUserSockets(userId) {
    io?.in(userRoom(userId)).disconnectSockets(true);
}
function emitTransferChanged(payload) {
    io
        ?.to(platformOwnersRoom)
        .to(storeManagersRoom(payload.storeId))
        .to(branchRoom(payload.fromBranchId))
        .to(branchRoom(payload.toBranchId))
        .emit("transfer:changed", payload);
}
