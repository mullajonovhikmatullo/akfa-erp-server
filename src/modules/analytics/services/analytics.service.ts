import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/prisma/prisma";
import { JwtPayload } from "../../../core/types/jwt.types";
import { branchScope } from "../../../core/utils/branch-access";
import { AnalyticsQuery } from "../validations/analytics.validation";

function resolveRange(from?: string, to?: string): { start: Date; end: Date } {
    const now = new Date();
    const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? new Date(to) : now;
    return { start, end };
}

export const AnalyticsService = {
    // ─── Dashboard KPIs ───────────────────────────────────────────────────────

    async dashboard(query: AnalyticsQuery, user: JwtPayload) {
        const { branchId } = branchScope(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);

        const saleWhere: Prisma.SaleWhereInput = {
            ...(branchId && { branchId }),
            createdAt: { gte: start, lte: end },
        };

        const expenseWhere: Prisma.ExpenseWhereInput = {
            ...(branchId && { branchId }),
            expenseDate: { gte: start, lte: end },
        };

        const transferWhere: Prisma.TransferWhereInput = {
            status: "PENDING",
            ...(branchId && {
                OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
            }),
        };

        const branchCond = branchId
            ? Prisma.sql`AND "branchId" = ${branchId}`
            : Prisma.empty;

        const [salesAgg, expenseAgg, customerDebtAgg, pendingTransfers, lowStockRaw, stockValueRaw] =
            await Promise.all([
                prisma.sale.aggregate({
                    where: saleWhere,
                    _sum: { totalAmountUzs: true, paidAmountUzs: true, debtAmountUzs: true },
                    _count: { id: true },
                }),
                prisma.expense.aggregate({
                    where: expenseWhere,
                    _sum: { amount: true },
                }),
                prisma.customer.aggregate({
                    where: { ...(branchId && { branchId }), balance: { gt: 0 } },
                    _sum: { balance: true },
                    _count: { id: true },
                }),
                prisma.transfer.count({ where: transferWhere }),
                prisma.$queryRaw<{ count: bigint }[]>`
                    SELECT COUNT(*)::bigint AS count
                    FROM "Inventory" i
                    JOIN "Product" p ON p.id = i."productId"
                    WHERE p."lowStockThreshold" IS NOT NULL
                      AND p."isActive" = true
                      AND i.quantity <= p."lowStockThreshold"
                      ${branchCond}
                `,
                prisma.$queryRaw<{ value: string }[]>`
                    SELECT COALESCE(SUM(sb."remainingQty" * sb."costPriceUzs"), 0)::text AS value
                    FROM "StockBatch" sb
                    WHERE sb."remainingQty" > 0
                      ${branchId ? Prisma.sql`AND sb."branchId" = ${branchId}` : Prisma.empty}
                `,
            ]);

        const totalRevenue = Number(salesAgg._sum.totalAmountUzs ?? 0);
        const paidAmount = Number(salesAgg._sum.paidAmountUzs ?? 0);
        const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

        return {
            period: { from: start, to: end },
            sales: {
                totalRevenue,
                paidAmount,
                outstandingDebt: Number(salesAgg._sum.debtAmountUzs ?? 0),
                saleCount: salesAgg._count.id,
            },
            expenses: {
                total: totalExpenses,
            },
            profit: {
                netProfit: paidAmount - totalExpenses,
            },
            inventory: {
                stockValueUzs: Number(stockValueRaw[0]?.value ?? 0),
                lowStockCount: Number(lowStockRaw[0]?.count ?? 0),
            },
            customers: {
                totalDebt: Number(customerDebtAgg._sum.balance ?? 0),
                debtorCount: customerDebtAgg._count.id,
            },
            transfers: {
                pendingCount: pendingTransfers,
            },
        };
    },

    // ─── Sales Report ─────────────────────────────────────────────────────────

    async salesReport(query: AnalyticsQuery, user: JwtPayload) {
        const { branchId } = branchScope(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);

        const saleWhere: Prisma.SaleWhereInput = {
            ...(branchId && { branchId }),
            createdAt: { gte: start, lte: end },
        };

        const branchCond = branchId
            ? Prisma.sql`AND s."branchId" = ${branchId}`
            : Prisma.empty;

        const saleBranchCond = branchId
            ? Prisma.sql`AND "branchId" = ${branchId}`
            : Prisma.empty;

        const periodTrunc = Prisma.raw(`DATE_TRUNC('${query.period}', "createdAt")`);
        const expensePeriodTrunc = Prisma.raw(`DATE_TRUNC('${query.period}', "expenseDate")`);

        const [summary, byPeriod, byType, byPaymentMethod, topProducts] = await Promise.all([
            prisma.sale.aggregate({
                where: saleWhere,
                _sum: { totalAmountUzs: true, paidAmountUzs: true, debtAmountUzs: true },
                _count: { id: true },
            }),

            prisma.$queryRaw<{
                period: Date;
                sale_count: bigint;
                total_revenue: string;
                paid_amount: string;
            }[]>`
                SELECT
                    ${periodTrunc} AS period,
                    COUNT(id)::bigint AS sale_count,
                    SUM("totalAmountUzs")::text AS total_revenue,
                    SUM("paidAmountUzs")::text AS paid_amount
                FROM "Sale"
                WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
                  ${saleBranchCond}
                GROUP BY 1
                ORDER BY 1
            `,

            prisma.sale.groupBy({
                by: ["saleType"],
                where: saleWhere,
                _sum: { totalAmountUzs: true },
                _count: { id: true },
            }),

            prisma.salePayment.groupBy({
                by: ["paymentMethod"],
                where: { sale: saleWhere },
                _sum: { amountUzs: true },
                _count: { id: true },
            }),

            prisma.$queryRaw<{
                product_id: string;
                product_name: string;
                sku: string | null;
                unit: string;
                total_quantity: string;
                total_revenue: string;
            }[]>`
                SELECT
                    p.id          AS product_id,
                    p.name        AS product_name,
                    p.sku,
                    p.unit::text,
                    SUM(si.quantity)::text    AS total_quantity,
                    SUM(si."totalPrice")::text AS total_revenue
                FROM "SaleItem" si
                JOIN "Sale" s ON s.id = si."saleId"
                JOIN "Product" p ON p.id = si."productId"
                WHERE s."createdAt" >= ${start} AND s."createdAt" <= ${end}
                  ${branchCond}
                GROUP BY p.id, p.name, p.sku, p.unit
                ORDER BY SUM(si."totalPrice") DESC
                LIMIT ${query.limit}
            `,
        ]);

        const totalRevenue = Number(summary._sum.totalAmountUzs ?? 0);
        const saleCount = summary._count.id;

        return {
            period: { from: start, to: end },
            summary: {
                totalRevenue,
                paidAmount: Number(summary._sum.paidAmountUzs ?? 0),
                outstandingDebt: Number(summary._sum.debtAmountUzs ?? 0),
                saleCount,
                avgOrderValue: saleCount > 0 ? +(totalRevenue / saleCount).toFixed(2) : 0,
            },
            byPeriod: byPeriod.map((r) => ({
                period: r.period,
                saleCount: Number(r.sale_count),
                totalRevenue: Number(r.total_revenue),
                paidAmount: Number(r.paid_amount),
            })),
            byType: byType.map((r) => ({
                saleType: r.saleType,
                revenue: Number(r._sum.totalAmountUzs ?? 0),
                count: r._count.id,
            })),
            byPaymentMethod: byPaymentMethod.map((r) => ({
                paymentMethod: r.paymentMethod,
                amount: Number(r._sum.amountUzs ?? 0),
                count: r._count.id,
            })),
            topProducts: topProducts.map((r) => ({
                productId: r.product_id,
                name: r.product_name,
                sku: r.sku,
                unit: r.unit,
                totalQuantity: Number(r.total_quantity),
                totalRevenue: Number(r.total_revenue),
            })),
        };
    },

    // ─── Inventory Report ─────────────────────────────────────────────────────

    async inventoryReport(query: AnalyticsQuery, user: JwtPayload) {
        const { branchId } = branchScope(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);

        const [stockByBranch, lowStock, movementSummary] = await Promise.all([
            prisma.$queryRaw<{
                branch_id: string;
                branch_name: string;
                product_count: bigint;
                stock_value_uzs: string;
                total_quantity: string;
            }[]>`
                SELECT
                    b.id   AS branch_id,
                    b.name AS branch_name,
                    COUNT(DISTINCT sb."productId")::bigint AS product_count,
                    COALESCE(SUM(sb."remainingQty" * sb."costPriceUzs"), 0)::text AS stock_value_uzs,
                    COALESCE(SUM(sb."remainingQty"), 0)::text AS total_quantity
                FROM "StockBatch" sb
                JOIN "Branch" b ON b.id = sb."branchId"
                WHERE sb."remainingQty" > 0
                  ${branchId ? Prisma.sql`AND sb."branchId" = ${branchId}` : Prisma.empty}
                GROUP BY b.id, b.name
                ORDER BY SUM(sb."remainingQty" * sb."costPriceUzs") DESC
            `,

            prisma.$queryRaw<{
                product_id: string;
                product_name: string;
                sku: string | null;
                unit: string;
                threshold: string;
                current_stock: string;
                branch_id: string;
                branch_name: string;
            }[]>`
                SELECT
                    p.id   AS product_id,
                    p.name AS product_name,
                    p.sku,
                    p.unit::text,
                    p."lowStockThreshold"::text AS threshold,
                    i.quantity::text            AS current_stock,
                    b.id   AS branch_id,
                    b.name AS branch_name
                FROM "Inventory" i
                JOIN "Product" p ON p.id = i."productId"
                JOIN "Branch" b ON b.id = i."branchId"
                WHERE p."lowStockThreshold" IS NOT NULL
                  AND p."isActive" = true
                  AND i.quantity <= p."lowStockThreshold"
                  ${branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty}
                ORDER BY (i.quantity / NULLIF(p."lowStockThreshold", 0)) ASC NULLS LAST
                LIMIT 50
            `,

            prisma.stockMovement.groupBy({
                by: ["type"],
                where: {
                    ...(branchId && { branchId }),
                    createdAt: { gte: start, lte: end },
                },
                _sum: { quantity: true },
                _count: { id: true },
            }),
        ]);

        return {
            period: { from: start, to: end },
            stockByBranch: stockByBranch.map((r) => ({
                branchId: r.branch_id,
                branchName: r.branch_name,
                productCount: Number(r.product_count),
                stockValueUzs: Number(r.stock_value_uzs),
                totalQuantity: Number(r.total_quantity),
            })),
            lowStock: lowStock.map((r) => ({
                productId: r.product_id,
                name: r.product_name,
                sku: r.sku,
                unit: r.unit,
                currentStock: Number(r.current_stock),
                threshold: Number(r.threshold),
                branchId: r.branch_id,
                branchName: r.branch_name,
            })),
            movementSummary: movementSummary.map((r) => ({
                type: r.type,
                totalQuantity: Number(r._sum.quantity ?? 0),
                count: r._count.id,
            })),
        };
    },

    // ─── Expense Report ───────────────────────────────────────────────────────

    async expenseReport(query: AnalyticsQuery, user: JwtPayload) {
        const { branchId } = branchScope(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);

        const expenseWhere: Prisma.ExpenseWhereInput = {
            ...(branchId && { branchId }),
            expenseDate: { gte: start, lte: end },
        };

        const periodTrunc = Prisma.raw(`DATE_TRUNC('${query.period}', "expenseDate")`);
        const branchCond = branchId
            ? Prisma.sql`AND "branchId" = ${branchId}`
            : Prisma.empty;

        const [summary, byCategory, byPeriod] = await Promise.all([
            prisma.expense.aggregate({
                where: expenseWhere,
                _sum: { amount: true },
                _count: { id: true },
            }),

            prisma.$queryRaw<{
                category_id: string;
                category_name: string;
                total: string;
                count: bigint;
            }[]>`
                SELECT
                    ec.id   AS category_id,
                    ec.name AS category_name,
                    SUM(e.amount)::text AS total,
                    COUNT(e.id)::bigint AS count
                FROM "Expense" e
                JOIN "ExpenseCategory" ec ON ec.id = e."categoryId"
                WHERE e."expenseDate" >= ${start} AND e."expenseDate" <= ${end}
                  ${branchCond}
                GROUP BY ec.id, ec.name
                ORDER BY SUM(e.amount) DESC
            `,

            prisma.$queryRaw<{ period: Date; total: string; count: bigint }[]>`
                SELECT
                    ${periodTrunc} AS period,
                    SUM(amount)::text AS total,
                    COUNT(id)::bigint AS count
                FROM "Expense"
                WHERE "expenseDate" >= ${start} AND "expenseDate" <= ${end}
                  ${branchCond}
                GROUP BY 1
                ORDER BY 1
            `,
        ]);

        return {
            period: { from: start, to: end },
            summary: {
                total: Number(summary._sum.amount ?? 0),
                count: summary._count.id,
            },
            byCategory: byCategory.map((r) => ({
                categoryId: r.category_id,
                categoryName: r.category_name,
                amount: Number(r.total),
                count: Number(r.count),
            })),
            byPeriod: byPeriod.map((r) => ({
                period: r.period,
                amount: Number(r.total),
                count: Number(r.count),
            })),
        };
    },

    // ─── Customer Debt ────────────────────────────────────────────────────────

    async customerDebt(query: AnalyticsQuery, user: JwtPayload) {
        const { branchId } = branchScope(user, query.branchId);

        const where: Prisma.CustomerWhereInput = {
            ...(branchId && { branchId }),
            balance: { gt: 0 },
            isActive: true,
        };

        const overdueWhere: Prisma.SaleWhereInput = {
            ...(branchId && { branchId }),
            debtAmountUzs: { gt: 0 },
            debtDueDate: { lt: new Date(), not: null },
        };

        const [summary, topDebtors, overdueAgg] = await Promise.all([
            prisma.customer.aggregate({
                where,
                _sum: { balance: true },
                _count: { id: true },
            }),
            prisma.customer.findMany({
                where,
                orderBy: { balance: "desc" },
                take: query.limit,
                select: {
                    id: true,
                    fullName: true,
                    phone: true,
                    balance: true,
                    branch: { select: { id: true, name: true } },
                },
            }),
            prisma.sale.aggregate({
                where: overdueWhere,
                _sum: { debtAmountUzs: true },
                _count: { id: true },
            }),
        ]);

        return {
            summary: {
                totalDebt: Number(summary._sum.balance ?? 0),
                debtorCount: summary._count.id,
            },
            overdue: {
                totalOverdueDebt: Number(overdueAgg._sum.debtAmountUzs ?? 0),
                overdueCount: overdueAgg._count.id,
            },
            topDebtors: topDebtors.map((c) => ({
                id: c.id,
                fullName: c.fullName,
                phone: c.phone,
                balance: Number(c.balance),
                branch: c.branch,
            })),
        };
    },
};
