"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.emitTransferChanged = emitTransferChanged;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
let io = null;
const superAdminsRoom = "role:SUPER_ADMIN";
const branchRoom = (branchId) => `branch:${branchId}`;
function initSocketServer(server, isOriginAllowed) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin))
                    return callback(null, true);
                return callback(new Error(`Socket CORS: origin ${origin} not allowed`));
            },
            credentials: true,
        },
    });
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== "string")
            return next(new Error("Unauthorized"));
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "dev-secret");
            socket.data.user = decoded;
            return next();
        }
        catch {
            return next(new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const user = socket.data.user;
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
function emitTransferChanged(payload) {
    io
        ?.to(superAdminsRoom)
        .to(branchRoom(payload.fromBranchId))
        .to(branchRoom(payload.toBranchId))
        .emit("transfer:changed", payload);
}
