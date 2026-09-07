import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { swaggerSpec } from "./core/config/swagger";
import { AppError } from "./core/errors/AppError";
import { errorHandler } from "./core/errors/errorHandler";
import { seedPlatformOwner } from "./bootstrap/seed-platform-owner";
import { closeSocketServer, initSocketServer } from "./infrastructure/socket";
import { prisma } from "./infrastructure/prisma/prisma";
import { positiveIntegerEnv } from "./core/config/runtime";
import { requestMetrics, requestRoute } from "./core/middleware/requestMetrics";

import authRoutes from "./modules/auth/auth.routes";
import onboardingRoutes from "./modules/onboarding/onboarding.routes";
import platformRoutes from "./modules/platform/platform.routes";
import usersRoutes from "./modules/users/users.routes";
import branchesRoutes from "./modules/branches/branches.routes";
import adminsRoutes from "./modules/admins/admins.routes";
import productsRoutes from "./modules/products/products.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import customersRoutes from "./modules/customers/customers.routes";
import salesRoutes from "./modules/sales/sales.routes";
import expensesRoutes from "./modules/expenses/expenses.routes";
import transfersRoutes from "./modules/transfers/transfers.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import billingRoutes from "./modules/billing/billing.routes";
import mediaRoutes from "./modules/media/media.routes";
import productImageFilesRoutes from "./modules/products/images/product-image-files.routes";

const app = express();
let shuttingDown = false;

if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
    //
    app.set("trust proxy", 1);
}

app.use(requestMetrics);
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

const isOriginAllowed = (origin?: string) => {
    //
    if (!origin) return true;
    if (extraOrigins.includes(origin)) return true;
    if (process.env.NODE_ENV !== "production") {
        if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
        if (/^http:\/\/\[::1\]:\d+$/.test(origin)) return true;
    }
    return false;
};

app.use(
    cors({
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) return callback(null, true);

            return callback(new AppError(403, "CORS origin is not allowed"));
        },
        credentials: true,
    })
);
const securityHeaders = helmet();
app.use((req, res, next) => {
    //
    if (req.path.startsWith("/docs") || req.path.startsWith("/api/docs")) return next();
    return securityHeaders(req, res, next);
});
morgan.token("route", (req) => requestRoute(req as express.Request));
app.use(morgan(":method :route :status :response-time ms", {
    skip: (req, res) => (req.url === "/health" || req.url === "/api/health") && res.statusCode < 400,
}));
const standardJson = express.json({ limit: "1mb" });
const receiptJson = express.json({ limit: "6mb" });
app.use((req, res, next) => {
    //
    const parser = req.method === "POST" && /^(?:\/api)?\/billing\/payments\/?$/.test(req.path)
        ? receiptJson : standardJson;
    parser(req, res, next);
});

const apiRouter = express.Router();

apiRouter.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
apiRouter.get("/openapi.json", (_req, res) => {
    res.json(swaggerSpec);
});

apiRouter.use("/public", onboardingRoutes);
apiRouter.use("/auth", authRoutes);
apiRouter.use("/platform", platformRoutes);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/branches", branchesRoutes);
apiRouter.use("/admins", adminsRoutes);
apiRouter.use("/products", productsRoutes);
apiRouter.use("/inventory", inventoryRoutes);
apiRouter.use("/customers", customersRoutes);
apiRouter.use("/sales", salesRoutes);
apiRouter.use("/expenses", expensesRoutes);
apiRouter.use("/transfers", transfersRoutes);
apiRouter.use("/analytics", analyticsRoutes);
apiRouter.use("/billing", billingRoutes);
apiRouter.use("/media", mediaRoutes);
apiRouter.use("/uploads", productImageFilesRoutes);

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
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
server.requestTimeout = positiveIntegerEnv("HTTP_REQUEST_TIMEOUT_MS", 120000);
server.headersTimeout = Math.min(server.requestTimeout, positiveIntegerEnv("HTTP_HEADERS_TIMEOUT_MS", 60000));
server.keepAliveTimeout = positiveIntegerEnv("HTTP_KEEP_ALIVE_TIMEOUT_MS", 5000);
initSocketServer(server, isOriginAllowed);

let shutdownPromise: Promise<void> | undefined;
function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (exitCode) process.exitCode = exitCode;
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    console.log(JSON.stringify({ event: "shutdown", reason }));
    const deadline = setTimeout(() => {
        //
        console.error(JSON.stringify({ event: "shutdown_timeout" }));
        server.closeAllConnections();
        process.exit(1);
    }, positiveIntegerEnv("SHUTDOWN_TIMEOUT_MS", 75000));
    deadline.unref();
    shutdownPromise = (async () => {
        //
        const drained = new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error && !("code" in error && error.code === "ERR_SERVER_NOT_RUNNING")) reject(error);
                else resolve();
            });
            server.closeIdleConnections();
        });
        try {
            //
            await Promise.all([drained, closeSocketServer()]);
        } finally {
            // The adapter disposes its owned PostgreSQL pool here.
            await prisma.$disconnect();
            clearTimeout(deadline);
        }
    })();
    return shutdownPromise;
}

const stop = (reason: string, exitCode = 0) => {
    void shutdown(reason, exitCode).catch(() => {
        //
        console.error(JSON.stringify({ event: "shutdown_failed" }));
        process.exit(1);
    });
};
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));
function fatal(reason: string, error: unknown) {
    console.error(JSON.stringify({
        event: reason,
        errorType: error instanceof Error ? error.name : typeof error,
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
    await seedPlatformOwner();
    if (shuttingDown) return;
    server.listen(PORT, () => {
        console.log(`SERVER RUNNING ON ${PORT}`);
    });
}

startServer().catch((error) => fatal("startup_failed", error));
