type ErrorRecord = Record<string, unknown>;

const TRANSIENT_DATABASE_CODES = new Set([
    "P1001", "P1002", "P1008", "P1017", "P2024", "P2037",
    "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE",
    "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
    "53300", "57P01", "57P02", "57P03",
]);

const TRANSIENT_DRIVER_KINDS = new Set([
    "DatabaseNotReachable", "ConnectionClosed", "SocketTimeout", "TooManyConnections",
]);

const TRANSIENT_DRIVER_MESSAGES = new Set([
    "timeout exceeded when trying to connect",
    "Connection terminated due to connection timeout",
]);

function asRecord(value: unknown): ErrorRecord | undefined {
    return typeof value === "object" && value !== null ? value as ErrorRecord : undefined;
}

function driverCause(error: unknown): ErrorRecord | undefined {
    const meta = asRecord(asRecord(error)?.meta);
    const driverAdapterError = asRecord(meta?.driverAdapterError);
    return asRecord(driverAdapterError?.cause);
}

export function databaseErrorCode(error: unknown): string | undefined {
    const directCode = asRecord(error)?.code;
    if (typeof directCode === "string") return directCode;

    const cause = driverCause(error);
    if (typeof cause?.originalCode === "string") return cause.originalCode;
    if (typeof cause?.code === "string") return cause.code;
    return undefined;
}

export function isTransientDatabaseError(error: unknown): boolean {
    const code = databaseErrorCode(error);
    if (code && TRANSIENT_DATABASE_CODES.has(code)) return true;

    const cause = driverCause(error);
    if (typeof cause?.kind === "string" && TRANSIENT_DRIVER_KINDS.has(cause.kind)) return true;
    return error instanceof Error && TRANSIENT_DRIVER_MESSAGES.has(error.message);
}

type RetryOptions = {
    maxAttempts?: number;
    delayMs?: number;
    onRetry?: (error: unknown, nextAttempt: number) => void;
};

export async function withTransientDatabaseRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    const delayMs = Math.max(0, options.delayMs ?? 100);

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= maxAttempts || !isTransientDatabaseError(error)) throw error;
            options.onRetry?.(error, attempt + 1);
            if (delayMs > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
}
