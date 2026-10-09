import bcrypt from "bcrypt";
import { AuditAction, ExchangeRateMode, Prisma, UserRole } from "@prisma/client";
import { AppError } from "../../../core/errors/AppError";
import { assertStoreWritableInTransaction } from "../../../core/services/billing-state.service";
import { JwtPayload } from "../../../core/types/jwt.types";
import { requireStoreId } from "../../../core/utils/branch-access";
import { prisma, transactionOptions } from "../../../infrastructure/prisma/prisma";
import { UpdateExchangeRateDto } from "../validations/exchange-rate.validation";

type Db = Prisma.TransactionClient | typeof prisma;

const CBU_SOURCE = "CBU";
const CBU_USD_URL = process.env.CBU_USD_RATE_URL ?? "https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/";
const CBU_REFRESH_MS = 60 * 60 * 1000;
const CBU_TIMEOUT_MS = 5000;

let inFlightRefresh: Promise<void> | null = null;

function parseCbuDate(value: string): Date {
    const [day, month, year] = value.split(".").map(Number);
    if (!day || !month || !year) throw new Error(`Unexpected CBU date: ${value}`);
    return new Date(Date.UTC(year, month - 1, day));
}

async function fetchCbuUsdRate(): Promise<{ rate: number; rateDate: Date }> {
    const response = await fetch(CBU_USD_URL, { signal: AbortSignal.timeout(CBU_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`CBU responded ${response.status}`);
    const body = (await response.json()) as Array<{ Ccy?: string; Rate?: string; Nominal?: string; Date?: string }>;
    const usd = body.find((row) => row.Ccy === "USD");
    const rate = Number(usd?.Rate) / Number(usd?.Nominal || 1);
    if (!usd?.Date || !Number.isFinite(rate) || rate <= 0) throw new Error("CBU response has no USD rate");
    return { rate: Number(rate.toFixed(2)), rateDate: parseCbuDate(usd.Date) };
}

async function refreshCbuUsdRate(): Promise<void> {
    const { rate, rateDate } = await fetchCbuUsdRate();
    await prisma.currencyRate.upsert({
        where: { source_currency_rateDate: { source: CBU_SOURCE, currency: "USD", rateDate } },
        create: { source: CBU_SOURCE, currency: "USD", rate, rateDate },
        update: { rate, fetchedAt: new Date() },
    });
}

function latestCbuUsdRate(db: Db = prisma) {
    return db.currencyRate.findFirst({
        where: { source: CBU_SOURCE, currency: "USD" },
        orderBy: { rateDate: "desc" },
    });
}

// Refreshes the cached Central Bank rate when it is older than an hour. A CBU outage
// keeps the last known rate; only a store that has never fetched one gets an error.
async function ensureFreshCbuUsdRate() {
    const latest = await latestCbuUsdRate();
    if (latest && Date.now() - latest.fetchedAt.getTime() < CBU_REFRESH_MS) return latest;

    inFlightRefresh ??= refreshCbuUsdRate().finally(() => {
        inFlightRefresh = null;
    });
    try {
        await inFlightRefresh;
    } catch (error) {
        console.warn(JSON.stringify({
            event: "cbu_rate_refresh_failed",
            message: error instanceof Error ? error.message : String(error),
        }));
    }
    return latestCbuUsdRate();
}

async function assertStoreOwnerPassword(storeId: string, password: string, db: Db) {
    const owners = await db.user.findMany({
        where: { storeId, role: UserRole.STORE_OWNER, isActive: true },
        select: { password: true },
    });
    for (const owner of owners) {
        if (await bcrypt.compare(password, owner.password)) return;
    }
    throw new AppError(403, "Store owner password is incorrect");
}

async function loadStoreRate(storeId: string, db: Db = prisma) {
    const store = await db.store.findUnique({
        where: { id: storeId },
        select: { usdRateMode: true, manualUsdToUzsRate: true, usdRateChangedAt: true, usdRateChangedById: true },
    });
    if (!store) throw new AppError(404, "Store not found");
    return store;
}

export const ExchangeRatesService = {
    async getCurrent(user: JwtPayload) {
        const storeId = requireStoreId(user);
        const [store, cbu] = await Promise.all([loadStoreRate(storeId), ensureFreshCbuUsdRate()]);
        const changedBy = store.usdRateChangedById
            ? await prisma.user.findUnique({ where: { id: store.usdRateChangedById }, select: { id: true, fullName: true } })
            : null;
        const manualRate = store.manualUsdToUzsRate == null ? null : Number(store.manualUsdToUzsRate);
        const cbuRate = cbu ? Number(cbu.rate) : null;
        const usdToUzsRate = store.usdRateMode === ExchangeRateMode.MANUAL ? manualRate : cbuRate;

        return {
            mode: store.usdRateMode,
            usdToUzsRate,
            manualRate,
            cbu: cbu ? { rate: cbuRate, rateDate: cbu.rateDate.toISOString().slice(0, 10), fetchedAt: cbu.fetchedAt.toISOString() } : null,
            changedAt: store.usdRateChangedAt?.toISOString() ?? null,
            changedBy,
        };
    },

    // The rate every server-side USD conversion must use. Reads the cache only, so it is
    // safe inside a transaction; clients keep the cache warm through getCurrent.
    async resolveUsdToUzsRate(storeId: string, db: Db = prisma): Promise<number> {
        const store = await loadStoreRate(storeId, db);
        if (store.usdRateMode === ExchangeRateMode.MANUAL && store.manualUsdToUzsRate != null) {
            return Number(store.manualUsdToUzsRate);
        }
        const cbu = await latestCbuUsdRate(db);
        if (!cbu) throw new AppError(503, "Exchange rate is not available yet");
        return Number(cbu.rate);
    },

    // Every USD amount converts at the store rate. The client sends the rate it showed, so
    // a rate change since then fails instead of silently saving a different so'm amount.
    async assertClientRate(storeId: string, clientRate: number | undefined, db: Db = prisma): Promise<number> {
        if (clientRate === undefined) {
            throw new AppError(400, "usdToUzsRate is required for USD amounts");
        }
        const rate = await this.resolveUsdToUzsRate(storeId, db);
        if (Math.abs(rate - clientRate) >= 0.005) {
            throw new AppError(409, "Exchange rate has changed. Reload the rate and confirm again.");
        }
        return rate;
    },

    async update(dto: UpdateExchangeRateDto, user: JwtPayload) {
        const storeId = requireStoreId(user);
        if (dto.mode === ExchangeRateMode.CBU) {
            const cbu = await ensureFreshCbuUsdRate();
            if (!cbu) throw new AppError(503, "Central Bank rate is not available, set the rate manually");
        }

        await prisma.$transaction(async (tx) => {
            await assertStoreWritableInTransaction(tx, storeId);
            await assertStoreOwnerPassword(storeId, dto.ownerPassword, tx);
            const previous = await loadStoreRate(storeId, tx);
            const changedAt = new Date();
            await tx.store.update({
                where: { id: storeId },
                data: {
                    usdRateMode: dto.mode,
                    ...(dto.mode === ExchangeRateMode.MANUAL && { manualUsdToUzsRate: dto.rate }),
                    usdRateChangedAt: changedAt,
                    usdRateChangedById: user.id,
                },
            });
            await tx.auditLog.create({
                data: {
                    storeId,
                    actorId: user.id,
                    action: AuditAction.EXCHANGE_RATE_CHANGED,
                    metadata: {
                        from: { mode: previous.usdRateMode, manualRate: previous.manualUsdToUzsRate?.toString() ?? null },
                        to: { mode: dto.mode, manualRate: dto.mode === ExchangeRateMode.MANUAL ? dto.rate : null },
                    },
                },
            });
        }, transactionOptions);

        return this.getCurrent(user);
    },
};
