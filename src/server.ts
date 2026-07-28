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
import { seedSuperAdmin } from "./bootstrap/seed-super-admin";
import { initSocketServer } from "./infrastructure/socket";

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
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(express.json({ limit: "6mb" }));
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const isOriginAllowed = (origin?: string) => {
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
    if (req.path.startsWith("/docs")) return next();
    return securityHeaders(req, res, next);
});
app.use(morgan("dev"));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (_req, res) => {
    res.json(swaggerSpec);
});

app.use("/public", onboardingRoutes);
app.use("/auth", authRoutes);
app.use("/platform", platformRoutes);
app.use("/users", usersRoutes);
app.use("/branches", branchesRoutes);
app.use("/admins", adminsRoutes);
app.use("/products", productsRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/customers", customersRoutes);
app.use("/sales", salesRoutes);
app.use("/expenses", expensesRoutes);
app.use("/transfers", transfersRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/billing", billingRoutes);
app.use("/media", mediaRoutes);
app.use("/uploads", productImageFilesRoutes);

app.get("/", (_, res) => {
    res.json({ message: "Store Management API Running" });
});

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// Must be last — global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
initSocketServer(server, isOriginAllowed);

function assertRuntimeSecurityConfig() {
    const secret = process.env.JWT_SECRET;
    const minimumLength = process.env.NODE_ENV === "production" ? 32 : 16;
    if (!secret || secret.length < minimumLength) {
        throw new Error(`JWT_SECRET must be at least ${minimumLength} characters`);
    }
}

async function startServer() {
    assertRuntimeSecurityConfig();
    await seedSuperAdmin();
    server.listen(PORT, () => {
        console.log(`SERVER RUNNING ON ${PORT}`);
    });
}

startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
});
