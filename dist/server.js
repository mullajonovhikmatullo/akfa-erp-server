"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./core/config/swagger");
const errorHandler_1 = require("./core/errors/errorHandler");
const seed_super_admin_1 = require("./bootstrap/seed-super-admin");
const socket_1 = require("./infrastructure/socket");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
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
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const isOriginAllowed = (origin) => {
    if (!origin)
        return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
        return true;
    if (/^http:\/\/\[::1\]:\d+$/.test(origin))
        return true;
    if (/\.vercel\.app$/.test(origin))
        return true;
    if (extraOrigins.includes(origin))
        return true;
    return false;
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin))
            return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use((req, res, next) => {
    if (req.path.startsWith("/docs"))
        return next();
    return (0, helmet_1.default)()(req, res, next);
});
app.use((0, morgan_1.default)("dev"));
app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
app.use("/auth", auth_routes_1.default);
app.use("/users", users_routes_1.default);
app.use("/branches", branches_routes_1.default);
app.use("/admins", admins_routes_1.default);
app.use("/products", products_routes_1.default);
app.use("/inventory", inventory_routes_1.default);
app.use("/customers", customers_routes_1.default);
app.use("/sales", sales_routes_1.default);
app.use("/expenses", expenses_routes_1.default);
app.use("/transfers", transfers_routes_1.default);
app.use("/analytics", analytics_routes_1.default);
app.get("/", (_, res) => {
    res.json({ message: "Retail ERP API Running" });
});
// Must be last — global error handler
app.use(errorHandler_1.errorHandler);
const PORT = process.env.PORT || 3000;
const server = http_1.default.createServer(app);
(0, socket_1.initSocketServer)(server, isOriginAllowed);
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON ${PORT}`);
    (0, seed_super_admin_1.seedSuperAdmin)().catch((err) => console.error("Failed to seed super admin:", err));
});
