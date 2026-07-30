"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/prisma/prisma");
const branch_access_1 = require("../../../core/utils/branch-access");
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDateParam(value, boundary) {
    if (!DATE_ONLY_RE.test(value))
        return new Date(value);
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day)
        return new Date(value);
    return boundary === "start"
        ? new Date(year, month - 1, day, 0, 0, 0, 0)
        : new Date(year, month - 1, day, 23, 59, 59, 999);
}
function resolveRange(from, to) {
    const now = new Date();
    const start = from ? parseDateParam(from, "start") : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? parseDateParam(to, "end") : now;
    return { start, end };
}
exports.AnalyticsService = {
    // ─── Dashboard KPIs ───────────────────────────────────────────────────────
    async dashboard(query, user) {
        const { storeId, branchId } = (0, branch_access_1.branchScope)(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);
        const lowStockThreshold = query.lowStockThreshold;
        const lowStockThresholdSql = lowStockThreshold
            ? client_1.Prisma.sql `${lowStockThreshold}`
            : client_1.Prisma.sql `p."lowStockThreshold"`;
        const lowStockThresholdRequiredSql = lowStockThreshold
            ? client_1.Prisma.empty
            : client_1.Prisma.sql `AND p."lowStockThreshold" IS NOT NULL`;
        const saleWhere = {
            storeId,
            ...(branchId && { branchId }),
            createdAt: { gte: start, lte: end },
        };
        const expenseWhere = {
            storeId,
            ...(branchId && { branchId }),
            expenseDate: { gte: start, lte: end },
        };
        const transferWhere = {
            storeId,
            status: "PENDING",
            ...(branchId && {
                OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
            }),
        };
        const [salesAgg, expenseAgg, customerDebtAgg, pendingTransfers, lowStockRaw, stockValueRaw] = await Promise.all([
            prisma_1.prisma.sale.aggregate({
                where: saleWhere,
                _sum: { totalAmountUzs: true, paidAmountUzs: true, debtAmountUzs: true },
                _count: { id: true },
            }),
            prisma_1.prisma.expense.aggregate({
                where: expenseWhere,
                _sum: { amount: true },
            }),
            prisma_1.prisma.customer.aggregate({
                where: { storeId, ...(branchId && { branchId }), balance: { gt: 0 } },
                _sum: { balance: true },
                _count: { id: true },
            }),
            prisma_1.prisma.transfer.count({ where: transferWhere }),
            prisma_1.prisma.$queryRaw `
                    SELECT COUNT(*)::bigint AS count
                    FROM "Inventory" inv
                    JOIN "Product" p ON p.id = inv."productId"
                    WHERE inv."storeId" = ${storeId}
                      AND p."isActive" = true
                      ${lowStockThresholdRequiredSql}
                      AND inv.quantity <= ${lowStockThresholdSql}
                      ${branchId ? client_1.Prisma.sql `AND inv."branchId" = ${branchId}` : client_1.Prisma.empty}
                `,
            prisma_1.prisma.$queryRaw `
                    SELECT COALESCE(SUM(sb."remainingQty" * sb."costPriceUzs"), 0)::text AS value
                    FROM "StockBatch" sb
                    WHERE sb."remainingQty" > 0
                      AND sb."storeId" = ${storeId}
                      ${branchId ? client_1.Prisma.sql `AND sb."branchId" = ${branchId}` : client_1.Prisma.empty}
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
    async salesReport(query, user) {
        const { storeId, branchId } = (0, branch_access_1.branchScope)(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);
        const saleWhere = {
            storeId,
            ...(branchId && { branchId }),
            createdAt: { gte: start, lte: end },
        };
        const branchCond = branchId
            ? client_1.Prisma.sql `AND s."branchId" = ${branchId}`
            : client_1.Prisma.empty;
        const saleStoreCond = client_1.Prisma.sql `AND s."storeId" = ${storeId}`;
        const saleBranchCond = branchId
            ? client_1.Prisma.sql `AND "branchId" = ${branchId}`
            : client_1.Prisma.empty;
        const saleTableStoreCond = client_1.Prisma.sql `AND "storeId" = ${storeId}`;
        const periodTrunc = client_1.Prisma.raw(`DATE_TRUNC('${query.period}', "createdAt")`);
        const expensePeriodTrunc = client_1.Prisma.raw(`DATE_TRUNC('${query.period}', "expenseDate")`);
        const [summary, byPeriod, byType, byPaymentMethod, debtPaymentMethod, topProducts] = await Promise.all([
            prisma_1.prisma.sale.aggregate({
                where: saleWhere,
                _sum: { totalAmountUzs: true, paidAmountUzs: true, debtAmountUzs: true },
                _count: { id: true },
            }),
            prisma_1.prisma.$queryRaw `
                SELECT
                    ${periodTrunc} AS period,
                    COUNT(id)::bigint AS sale_count,
                    SUM("totalAmountUzs")::text AS total_revenue,
                    SUM("paidAmountUzs")::text AS paid_amount
                FROM "Sale"
                WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
                  ${saleTableStoreCond}
                  ${saleBranchCond}
                GROUP BY 1
                ORDER BY 1
            `,
            prisma_1.prisma.sale.groupBy({
                by: ["saleType"],
                where: saleWhere,
                _sum: { totalAmountUzs: true },
                _count: { id: true },
            }),
            prisma_1.prisma.$queryRaw `
                SELECT
                    sp."paymentMethod"::text AS payment_method,
                    COALESCE(SUM(sp."amountUzs" + sp."amountUsd" * COALESCE(sp."usdToUzsRate", 0)), 0)::text AS amount,
                    COUNT(sp.id)::bigint AS count
                FROM "SalePayment" sp
                JOIN "Sale" s ON s.id = sp."saleId"
                WHERE s."createdAt" >= ${start} AND s."createdAt" <= ${end}
                  ${saleStoreCond}
                  AND sp."paymentMethod"::text <> 'CREDIT'
                  ${branchCond}
                GROUP BY sp."paymentMethod"
            `,
            prisma_1.prisma.sale.aggregate({
                where: { ...saleWhere, debtAmountUzs: { gt: 0 } },
                _sum: { debtAmountUzs: true },
                _count: { id: true },
            }),
            prisma_1.prisma.$queryRaw `
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
                  ${saleStoreCond}
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
            byPaymentMethod: [
                ...byPaymentMethod.map((r) => ({
                    paymentMethod: r.payment_method,
                    amount: Number(r.amount),
                    count: Number(r.count),
                })),
                {
                    paymentMethod: "CREDIT",
                    amount: Number(debtPaymentMethod._sum.debtAmountUzs ?? 0),
                    count: debtPaymentMethod._count.id,
                },
            ],
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
    async inventoryReport(query, user) {
        const { storeId, branchId } = (0, branch_access_1.branchScope)(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);
        const lowStockThreshold = query.lowStockThreshold;
        const lowStockThresholdSql = lowStockThreshold
            ? client_1.Prisma.sql `${lowStockThreshold}`
            : client_1.Prisma.sql `p."lowStockThreshold"`;
        const lowStockThresholdRequiredSql = lowStockThreshold
            ? client_1.Prisma.empty
            : client_1.Prisma.sql `AND p."lowStockThreshold" IS NOT NULL`;
        const [stockByBranch, lowStock, movementSummary] = await Promise.all([
            prisma_1.prisma.$queryRaw `
                SELECT
                    b.id   AS branch_id,
                    b.name AS branch_name,
                    COUNT(DISTINCT inv."productId")::bigint AS product_count,
                    COALESCE(SUM(inv.quantity * COALESCE(batch_cost.unit_cost, p."costPriceUzs", 0)), 0)::text AS stock_value_uzs,
                    COALESCE(SUM(inv.quantity), 0)::text AS total_quantity
                    FROM "Inventory" inv
                JOIN "Branch" b ON b.id = inv."branchId"
                JOIN "Product" p ON p.id = inv."productId"
                LEFT JOIN (
                    SELECT
                        sb."branchId",
                        sb."productId",
                        SUM(sb."remainingQty" * sb."costPriceUzs") / NULLIF(SUM(sb."remainingQty"), 0) AS unit_cost
                    FROM "StockBatch" sb
                    WHERE sb."remainingQty" > 0
                    GROUP BY sb."branchId", sb."productId"
                ) batch_cost ON batch_cost."branchId" = inv."branchId" AND batch_cost."productId" = inv."productId"
                WHERE inv.quantity > 0
                  AND inv."storeId" = ${storeId}
                  AND p."isActive" = true
                  ${branchId ? client_1.Prisma.sql `AND inv."branchId" = ${branchId}` : client_1.Prisma.empty}
                GROUP BY b.id, b.name
                ORDER BY SUM(inv.quantity * COALESCE(batch_cost.unit_cost, p."costPriceUzs", 0)) DESC
            `,
            prisma_1.prisma.$queryRaw `
                SELECT
                    p.id   AS product_id,
                    p.name AS product_name,
                    p.sku,
                    p.unit::text,
                    ${lowStockThresholdSql}::text AS threshold,
                    inv.quantity::text          AS current_stock,
                    b.id   AS branch_id,
                    b.name AS branch_name
                FROM "Inventory" inv
                JOIN "Product" p ON p.id = inv."productId"
                JOIN "Branch" b ON b.id = inv."branchId"
                WHERE inv."storeId" = ${storeId}
                  AND p."isActive" = true
                  ${lowStockThresholdRequiredSql}
                  AND inv.quantity <= ${lowStockThresholdSql}
                  ${branchId ? client_1.Prisma.sql `AND inv."branchId" = ${branchId}` : client_1.Prisma.empty}
                ORDER BY (inv.quantity / NULLIF(${lowStockThresholdSql}, 0)) ASC NULLS LAST
                LIMIT 50
            `,
            prisma_1.prisma.stockMovement.groupBy({
                by: ["type"],
                where: {
                    storeId,
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
    async expenseReport(query, user) {
        const { storeId, branchId } = (0, branch_access_1.branchScope)(user, query.branchId);
        const { start, end } = resolveRange(query.from, query.to);
        const expenseWhere = {
            storeId,
            ...(branchId && { branchId }),
            expenseDate: { gte: start, lte: end },
        };
        const periodTrunc = client_1.Prisma.raw(`DATE_TRUNC('${query.period}', "expenseDate")`);
        const branchCond = branchId
            ? client_1.Prisma.sql `AND "branchId" = ${branchId}`
            : client_1.Prisma.empty;
        const expenseTableStoreCond = client_1.Prisma.sql `AND "storeId" = ${storeId}`;
        const expenseAliasStoreCond = client_1.Prisma.sql `AND e."storeId" = ${storeId}`;
        const [summary, byCategory, byPeriod] = await Promise.all([
            prisma_1.prisma.expense.aggregate({
                where: expenseWhere,
                _sum: { amount: true },
                _count: { id: true },
            }),
            prisma_1.prisma.$queryRaw `
                SELECT
                    ec.id   AS category_id,
                    ec.name AS category_name,
                    SUM(e.amount)::text AS total,
                    COUNT(e.id)::bigint AS count
                FROM "Expense" e
                JOIN "ExpenseCategory" ec ON ec.id = e."categoryId"
                WHERE e."expenseDate" >= ${start} AND e."expenseDate" <= ${end}
                  ${expenseAliasStoreCond}
                  ${branchCond}
                GROUP BY ec.id, ec.name
                ORDER BY SUM(e.amount) DESC
            `,
            prisma_1.prisma.$queryRaw `
                SELECT
                    ${periodTrunc} AS period,
                    SUM(amount)::text AS total,
                    COUNT(id)::bigint AS count
                FROM "Expense"
                WHERE "expenseDate" >= ${start} AND "expenseDate" <= ${end}
                  ${expenseTableStoreCond}
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
    async customerDebt(query, user) {
        const { storeId, branchId } = (0, branch_access_1.branchScope)(user, query.branchId);
        const where = {
            storeId,
            ...(branchId && { branchId }),
            balance: { gt: 0 },
            isActive: true,
        };
        const overdueWhere = {
            storeId,
            ...(branchId && { branchId }),
            debtAmountUzs: { gt: 0 },
            debtDueDate: { lt: new Date(), not: null },
        };
        const [summary, topDebtors, overdueAgg] = await Promise.all([
            prisma_1.prisma.customer.aggregate({
                where,
                _sum: { balance: true },
                _count: { id: true },
            }),
            prisma_1.prisma.customer.findMany({
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
            prisma_1.prisma.sale.aggregate({
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
