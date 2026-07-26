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
const errorHandler_1 = require("./core/errors/errorHandler");
const seed_super_admin_1 = require("./bootstrap/seed-super-admin");
const socket_1 = require("./infrastructure/socket");
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
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}
app.use(express_1.default.json({ limit: "6mb" }));
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const isOriginAllowed = (origin) => {
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
    if (req.path.startsWith("/docs"))
        return next();
    return securityHeaders(req, res, next);
});
app.use((0, morgan_1.default)("dev"));
app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
app.get("/openapi.json", (_req, res) => {
    res.json(swagger_1.swaggerSpec);
});
app.use("/public", onboarding_routes_1.default);
app.use("/auth", auth_routes_1.default);
app.use("/platform", platform_routes_1.default);
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
app.use("/billing", billing_routes_1.default);
app.use("/media", media_routes_1.default);
app.use("/uploads", product_image_files_routes_1.default);
app.get("/", (_, res) => {
    res.json({ message: "Store Management API Running" });
});
// Must be last — global error handler
app.use(errorHandler_1.errorHandler);
const PORT = process.env.PORT || 3000;
const server = http_1.default.createServer(app);
(0, socket_1.initSocketServer)(server, isOriginAllowed);
function assertRuntimeSecurityConfig() {
    const secret = process.env.JWT_SECRET;
    const minimumLength = process.env.NODE_ENV === "production" ? 32 : 16;
    if (!secret || secret.length < minimumLength) {
        throw new Error(`JWT_SECRET must be at least ${minimumLength} characters`);
    }
}
async function startServer() {
    assertRuntimeSecurityConfig();
    await (0, seed_super_admin_1.seedSuperAdmin)();
    server.listen(PORT, () => {
        console.log(`SERVER RUNNING ON ${PORT}`);
    });
}
startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
});
