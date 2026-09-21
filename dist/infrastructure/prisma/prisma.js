"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionOptions = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const runtime_1 = require("../../core/config/runtime");
const databaseError_1 = require("../../core/errors/databaseError");
const requestMetrics_1 = require("../../core/middleware/requestMetrics");
const configuredConnectionString = process.env.DATABASE_URL;
if (!configuredConnectionString) {
    throw new Error("DATABASE_URL is required");
}
function normalizeConnectionString(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
    }
    // pg currently treats these modes as verify-full and warns that their
    // meaning will change in the next major version. Preserve today's secure
    // behavior explicitly so upgrades do not silently weaken TLS validation.
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const useLibpqCompat = url.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";
    if (!useLibpqCompat && sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
        url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
}
const connectionString = normalizeConnectionString(configuredConnectionString);
const slowQueryMs = (0, runtime_1.positiveIntegerEnv)("SLOW_QUERY_MS", 500);
const reportConnectionError = (error) => console.error(JSON.stringify({
    event: "database_connection_error",
    errorCode: (0, databaseError_1.databaseErrorCode)(error),
}));
// PrismaPg owns this pool and ends it when prisma.$disconnect() disposes the
// adapter. Keep pg's default of ten connections unless deployment overrides it.
const adapter = new adapter_pg_1.PrismaPg({
    connectionString,
    max: (0, runtime_1.positiveIntegerEnv)("DB_POOL_MAX", 10),
    idleTimeoutMillis: (0, runtime_1.positiveIntegerEnv)("DB_IDLE_TIMEOUT_MS", 10000),
    connectionTimeoutMillis: (0, runtime_1.positiveIntegerEnv)("DB_CONNECTION_TIMEOUT_MS", 5000),
    statement_timeout: (0, runtime_1.positiveIntegerEnv)("DB_STATEMENT_TIMEOUT_MS", 30000),
    lock_timeout: (0, runtime_1.positiveIntegerEnv)("DB_LOCK_TIMEOUT_MS", 5000),
    idle_in_transaction_session_timeout: (0, runtime_1.positiveIntegerEnv)("DB_IDLE_TRANSACTION_TIMEOUT_MS", 60000),
}, { onPoolError: reportConnectionError, onConnectionError: reportConnectionError });
exports.prisma = new client_1.PrismaClient({ adapter, log: [{ level: "query", emit: "event" }] });
exports.prisma.$on("query", (event) => {
    if (event.duration >= slowQueryMs) {
        const table = event.query.match(/(?:FROM|UPDATE|INTO)\s+(?:"public"\.)?"([A-Za-z][A-Za-z0-9]*)"/i)?.[1];
        console.warn(JSON.stringify({
            event: "slow_database_query", durationMs: event.duration, table,
            requestId: requestMetrics_1.requestContext.getStore()?.requestId,
            // Never log SQL text or parameters, which can contain secrets.
        }));
    }
});
exports.transactionOptions = {
    maxWait: (0, runtime_1.positiveIntegerEnv)("DB_TRANSACTION_MAX_WAIT_MS", 10000),
    timeout: (0, runtime_1.positiveIntegerEnv)("DB_TRANSACTION_TIMEOUT_MS", 60000),
};
