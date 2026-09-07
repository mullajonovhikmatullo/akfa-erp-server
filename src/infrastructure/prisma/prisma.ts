import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { positiveIntegerEnv } from "../../core/config/runtime";
import { requestContext } from "../../core/middleware/requestMetrics";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is required");
}

const slowQueryMs = positiveIntegerEnv("SLOW_QUERY_MS", 500);
const reportConnectionError = () => console.error(JSON.stringify({ event: "database_connection_error" }));
// PrismaPg owns this pool and ends it when prisma.$disconnect() disposes the
// adapter. Keep pg's default of ten connections unless deployment overrides it.
const adapter = new PrismaPg({
    connectionString,
    max: positiveIntegerEnv("DB_POOL_MAX", 10),
    idleTimeoutMillis: positiveIntegerEnv("DB_IDLE_TIMEOUT_MS", 10000),
    connectionTimeoutMillis: positiveIntegerEnv("DB_CONNECTION_TIMEOUT_MS", 5000),
    statement_timeout: positiveIntegerEnv("DB_STATEMENT_TIMEOUT_MS", 30000),
    lock_timeout: positiveIntegerEnv("DB_LOCK_TIMEOUT_MS", 5000),
    idle_in_transaction_session_timeout: positiveIntegerEnv("DB_IDLE_TRANSACTION_TIMEOUT_MS", 60000),
}, { onPoolError: reportConnectionError, onConnectionError: reportConnectionError });

export const prisma = new PrismaClient({ adapter, log: [{ level: "query", emit: "event" }] });
prisma.$on("query", (event) => {
    if (event.duration >= slowQueryMs) {
        const table = event.query.match(/(?:FROM|UPDATE|INTO)\s+(?:"public"\.)?"([A-Za-z][A-Za-z0-9]*)"/i)?.[1];
        console.warn(JSON.stringify({
            event: "slow_database_query", durationMs: event.duration, table,
            requestId: requestContext.getStore()?.requestId,
            // Never log SQL text or parameters, which can contain secrets.
        }));
    }
});

export const transactionOptions = {
    maxWait: positiveIntegerEnv("DB_TRANSACTION_MAX_WAIT_MS", 10000),
    timeout: positiveIntegerEnv("DB_TRANSACTION_TIMEOUT_MS", 60000),
};
