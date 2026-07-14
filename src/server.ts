import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { swaggerSpec } from "./core/config/swagger";
import { errorHandler } from "./core/errors/errorHandler";
import { seedSuperAdmin } from "./bootstrap/seed-super-admin";
import { initSocketServer } from "./infrastructure/socket";

import authRoutes from "./modules/auth/auth.routes";
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

dotenv.config();

const app = express();

app.use(express.json());
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const isOriginAllowed = (origin?: string) => {
    if (!origin) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
    if (/^http:\/\/\[::1\]:\d+$/.test(origin)) return true;
    if (/\.vercel\.app$/.test(origin)) return true;
    if (extraOrigins.includes(origin)) return true;
    return false;
};

app.use(
    cors({
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) return callback(null, true);

            return callback(new Error(`CORS: origin ${origin} not allowed`));
        },
        credentials: true,
    })
);
app.use((req, res, next) => {
    if (req.path.startsWith("/docs")) return next();
    return helmet()(req, res, next);
});
app.use(morgan("dev"));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/auth", authRoutes);
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

app.get("/", (_, res) => {
    res.json({ message: "Retail ERP API Running" });
});

// Must be last — global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
initSocketServer(server, isOriginAllowed);

server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON ${PORT}`);
    seedSuperAdmin().catch((err) =>
        console.error("Failed to seed super admin:", err)
    );
});
