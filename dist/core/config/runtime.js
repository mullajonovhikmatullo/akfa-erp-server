"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.positiveIntegerEnv = positiveIntegerEnv;
function positiveIntegerEnv(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === "")
        return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}
