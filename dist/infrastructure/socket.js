"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.closeSocketServer = closeSocketServer;
exports.disconnectStoreSockets = disconnectStoreSockets;
exports.disconnectUserSockets = disconnectUserSockets;
exports.emitTransferChanged = emitTransferChanged;
const socket_io_1 = require("socket.io");
const auth_identity_service_1 = require("../core/services/auth-identity.service");
const billing_state_service_1 = require("../core/services/billing-state.service");
const role_access_1 = require("../core/utils/role-access");
let io = null;
const platformOwnersRoom = "role:PLATFORM_OWNER";
const tenantLifecycleRoom = (storeId) => `tenant-lifecycle:${storeId}`;
const storeManagersRoom = (storeId) => `store-managers:${storeId}`;
const branchRoom = (storeId, branchId) => `store:${storeId}:branch:${branchId}`;
const userRoom = (userId) => `user:${userId}`;
function initSocketServer(server, isOriginAllowed) {
    if (io)
        throw new Error("Socket server is already initialized");
    io = new socket_io_1.Server(server, {
        path: process.env.SOCKET_IO_PATH || "/api/socket.io",
        maxHttpBufferSize: 64 * 1024,
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
        if (!token || typeof token !== "string" || token.length > 8192 || !secret) {
            return next(new Error("Unauthorized"));
        }
        try {
            const { user, expiresAt } = await (0, auth_identity_service_1.authenticateToken)(token);
            if (user.mustChangePassword) {
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
            socket.data.expiresAt = expiresAt;
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
        // Expired JWTs must not keep receiving events through a long-lived socket.
        let expiryTimer;
        const expire = () => {
            const expiresAt = socket.data.expiresAt;
            if (expiresAt === undefined)
                return;
            const remaining = expiresAt - Date.now();
            if (remaining <= 0)
                return void socket.disconnect(true);
            expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
            expiryTimer.unref();
        };
        expire();
        socket.once("disconnect", () => { if (expiryTimer)
            clearTimeout(expiryTimer); });
        void (async () => {
            const { user } = await (0, auth_identity_service_1.authenticateToken)(socket.handshake.auth.token);
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
            if (user.storeId && user.branchId) {
                socket.join(branchRoom(user.storeId, user.branchId));
            }
        })().catch(() => socket.disconnect(true));
    });
    return io;
}
async function closeSocketServer() {
    const current = io;
    io = null;
    if (current)
        await new Promise((resolve) => current.close(() => resolve()));
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
        .to(branchRoom(payload.storeId, payload.fromBranchId))
        .to(branchRoom(payload.storeId, payload.toBranchId))
        .emit("transfer:changed", payload);
}
