import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { positiveIntegerEnv } from "../config/runtime";

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
const slowRequestMs = positiveIntegerEnv("SLOW_REQUEST_MS", 1000);

export function requestRoute(req: Request): string {
    return req.route?.path ? `${req.baseUrl}${req.route.path}` : "(unmatched)";
}

export function requestMetrics(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const startedAt = performance.now();
    res.setHeader("X-Request-Id", requestId);
    res.once("close", () => {
        const durationMs = Math.round(performance.now() - startedAt);
        if (durationMs >= slowRequestMs || res.statusCode >= 500 || !res.writableFinished) {
            console.warn(JSON.stringify({
                event: "http_request", requestId, method: req.method, route: requestRoute(req),
                status: res.statusCode, durationMs, aborted: !res.writableFinished,
            }));
        }
    });
    requestContext.run({ requestId }, next);
}
