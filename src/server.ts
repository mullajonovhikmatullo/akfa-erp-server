import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { swaggerSpec } from "./core/config/swagger";
import { errorHandler } from "./core/errors/errorHandler";

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
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);

            // localhost
            if (/^http:\/\/localhost:\d+$/.test(origin)) {
                return callback(null, true);
            }

            // any vercel subdomain
            if (/\.vercel\.app$/.test(origin)) {
                return callback(null, true);
            }

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
app.listen(PORT, () => console.log(`SERVER RUNNING ON ${PORT}`));
