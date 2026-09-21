"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./core/config/swagger");
const AppError_1 = require("./core/errors/AppError");
const databaseError_1 = require("./core/errors/databaseError");
const errorHandler_1 = require("./core/errors/errorHandler");
const seed_platform_owner_1 = require("./bootstrap/seed-platform-owner");
const socket_1 = require("./infrastructure/socket");
const prisma_1 = require("./infrastructure/prisma/prisma");
const runtime_1 = require("./core/config/runtime");
const requestMetrics_1 = require("./core/middleware/requestMetrics");
const storage_1 = require("./core/storage");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const onboarding_routes_1 = __importDefault(require("./modules/onboarding/onboarding.routes"));
const platform_routes_1 = __importDefault(require("./modules/platform/platform.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const branches_routes_1 = __importDefault(require("./modules/branches/branches.routes"));
const admins_routes_1 = __importDefault(require("./modules/admins/admins.routes"));
const products_routes_1 = __importDefault(require("./modules/products/products.routes"));
const inventory_routes_1 = __importDefault(require("./modules/inventory/inventory.routes"));
const customers_routes_1 = __importDefault(require("./modules/customers/customers.routes"));
const sales_routes_1 = __importDefault(require("./modules/sales/sales.routes"));
const expenses_routes_1 = __importDefault(require("./modules/expenses/expenses.routes"));
const transfers_routes_1 = __importDefault(require("./modules/transfers/transfers.routes"));
const analytics_routes_1 = __importDefault(require("./modules/analytics/analytics.routes"));
const billing_routes_1 = __importDefault(require("./modules/billing/billing.routes"));
const media_routes_1 = __importDefault(require("./modules/media/media.routes"));
const product_image_files_routes_1 = __importDefault(require("./modules/products/images/product-image-files.routes"));
const app = (0, express_1.default)();
let shuttingDown = false;
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
    //
    app.set("trust proxy", 1);
}
app.use(requestMetrics_1.requestMetrics);
app.use((_req, res, next) => {
    if (shuttingDown) {
        res.setHeader("Connection", "close");
        res.status(503).json({ success: false, message: "Server is shutting down" });
        return;
    }
    next();
});
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const isOriginAllowed = (origin) => {
    //
    if (!origin)
        return true;
    if (extraOrigins.includes(origin))
        return true;
    if (process.env.NODE_ENV !== "production") {
        if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
            return true;
        if (/^http:\/\/\[::1\]:\d+$/.test(origin))
            return true;
    }
    return false;
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin))
            return callback(null, true);
        return callback(new AppError_1.AppError(403, "CORS origin is not allowed"));
    },
    credentials: true,
}));
const securityHeaders = (0, helmet_1.default)();
app.use((req, res, next) => {
    //
    if (req.path.startsWith("/docs") || req.path.startsWith("/api/docs"))
        return next();
    return securityHeaders(req, res, next);
});
morgan_1.default.token("route", (req) => (0, requestMetrics_1.requestRoute)(req));
app.use((0, morgan_1.default)(":method :route :status :response-time ms", {
    skip: (req, res) => (req.url === "/health" || req.url === "/api/health") && res.statusCode < 400,
}));
const standardJson = express_1.default.json({ limit: "1mb" });
const receiptJson = express_1.default.json({ limit: "6mb" });
app.use((req, res, next) => {
    //
    // This larger body is parsed by bounded middleware after authentication.
    if (req.method === "PUT" && /^(?:\/api)?\/auth\/profile\/photo\/?$/.test(req.path))
        return next();
    const parser = req.method === "POST" && /^(?:\/api)?\/billing\/payments\/?$/.test(req.path)
        ? receiptJson : standardJson;
    parser(req, res, next);
});
const apiRouter = express_1.default.Router();
apiRouter.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
apiRouter.get("/openapi.json", (_req, res) => {
    res.json(swagger_1.swaggerSpec);
});
apiRouter.use("/public", onboarding_routes_1.default);
apiRouter.use("/auth", auth_routes_1.default);
apiRouter.use("/platform", platform_routes_1.default);
apiRouter.use("/users", users_routes_1.default);
apiRouter.use("/branches", branches_routes_1.default);
apiRouter.use("/admins", admins_routes_1.default);
apiRouter.use("/products", products_routes_1.default);
apiRouter.use("/inventory", inventory_routes_1.default);
apiRouter.use("/customers", customers_routes_1.default);
apiRouter.use("/sales", sales_routes_1.default);
apiRouter.use("/expenses", expenses_routes_1.default);
apiRouter.use("/transfers", transfers_routes_1.default);
apiRouter.use("/analytics", analytics_routes_1.default);
apiRouter.use("/billing", billing_routes_1.default);
apiRouter.use("/media", media_routes_1.default);
apiRouter.use("/uploads", product_image_files_routes_1.default);
apiRouter.get("/", (_, res) => {
    res.json({ message: "Store Management API Running" });
});
apiRouter.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
app.use("/", apiRouter);
app.use("/api", apiRouter);
// Must be last — global error handler
app.use(errorHandler_1.errorHandler);
const PORT = (0, runtime_1.positiveIntegerEnv)("PORT", 3000);
if (PORT > 65535)
    throw new Error("PORT must be between 1 and 65535");
const server = http_1.default.createServer(app);
server.requestTimeout = (0, runtime_1.positiveIntegerEnv)("HTTP_REQUEST_TIMEOUT_MS", 120000);
server.headersTimeout = Math.min(server.requestTimeout, (0, runtime_1.positiveIntegerEnv)("HTTP_HEADERS_TIMEOUT_MS", 60000));
server.keepAliveTimeout = (0, runtime_1.positiveIntegerEnv)("HTTP_KEEP_ALIVE_TIMEOUT_MS", 5000);
(0, socket_1.initSocketServer)(server, isOriginAllowed);
let shutdownPromise;
function shutdown(reason, exitCode = 0) {
    if (exitCode)
        process.exitCode = exitCode;
    if (shutdownPromise)
        return shutdownPromise;
    shuttingDown = true;
    console.log(JSON.stringify({ event: "shutdown", reason }));
    const deadline = setTimeout(() => {
        //
        console.error(JSON.stringify({ event: "shutdown_timeout" }));
        server.closeAllConnections();
        process.exit(1);
    }, (0, runtime_1.positiveIntegerEnv)("SHUTDOWN_TIMEOUT_MS", 75000));
    deadline.unref();
    shutdownPromise = (async () => {
        //
        const drained = new Promise((resolve, reject) => {
            server.close((error) => {
                if (error && !("code" in error && error.code === "ERR_SERVER_NOT_RUNNING"))
                    reject(error);
                else
                    resolve();
            });
            server.closeIdleConnections();
        });
        try {
            //
            await Promise.all([drained, (0, socket_1.closeSocketServer)()]);
        }
        finally {
            storage_1.r2FileStorage?.close();
            // The adapter disposes its owned PostgreSQL pool here.
            await prisma_1.prisma.$disconnect();
            clearTimeout(deadline);
        }
    })();
    return shutdownPromise;
}
const stop = (reason, exitCode = 0) => {
    void shutdown(reason, exitCode).catch(() => {
        //
        console.error(JSON.stringify({ event: "shutdown_failed" }));
        process.exit(1);
    });
};
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));
function fatal(reason, error) {
    const systemError = error instanceof Error
        ? error
        : undefined;
    console.error(JSON.stringify({
        event: reason,
        errorType: error instanceof Error ? error.name : typeof error,
        errorCode: typeof systemError?.code === "string" ? systemError.code : undefined,
        syscall: typeof systemError?.syscall === "string" ? systemError.syscall : undefined,
        address: typeof systemError?.address === "string" ? systemError.address : undefined,
        port: typeof systemError?.port === "number" ? systemError.port : undefined,
        stack: error instanceof Error ? error.stack?.split("\n").filter((line) => /^\s+at /.test(line)).join("\n") : undefined,
    }));
    stop(reason, 1);
}
process.once("uncaughtException", (error) => fatal("uncaughtException", error));
process.once("unhandledRejection", (error) => fatal("unhandledRejection", error));
function assertRuntimeSecurityConfig() {
    //
    const secret = process.env.JWT_SECRET;
    const minimumLength = process.env.NODE_ENV === "production" ? 32 : 16;
    if (!secret || secret.length < minimumLength) {
        //
        throw new Error(`JWT_SECRET must be at least ${minimumLength} characters`);
    }
}
async function startServer() {
    //
    assertRuntimeSecurityConfig();
    await (0, databaseError_1.withTransientDatabaseRetry)(() => (0, seed_platform_owner_1.seedPlatformOwner)(), {
        maxAttempts: 3,
        delayMs: 500,
        onRetry: (error, nextAttempt) => console.warn(JSON.stringify({
            event: "database_operation_retry",
            operation: "startup_seed",
            errorCode: (0, databaseError_1.databaseErrorCode)(error),
            attempt: nextAttempt,
        })),
    });
    if (shuttingDown)
        return;
    await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
        };
        const onListening = () => {
            server.off("error", onError);
            resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(PORT);
    });
    console.log(`SERVER RUNNING ON ${PORT}`);
}
startServer().catch((error) => fatal("startup_failed", error));
