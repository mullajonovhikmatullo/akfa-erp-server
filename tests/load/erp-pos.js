import http from "k6/http";
import { check, fail, sleep } from "k6";
import execution from "k6/execution";
import { Counter } from "k6/metrics";

const base = (__ENV.BASE_URL || "http://127.0.0.1:3000/api").replace(/\/$/, "");
const mode = __ENV.SCENARIO || "reads";
const vus = Number(__ENV.VUS || 10);
const saleSuccesses = new Counter("sales_created");
const stockConflicts = new Counter("stock_conflicts");
const validModes = ["reads", "checkout", "inventory", "mixed"];
if (!validModes.includes(mode)) throw new Error(`SCENARIO must be one of ${validModes.join(", ")}`);

export const options = {
    scenarios: {
        workload: mode === "inventory"
            ? { executor: "per-vu-iterations", vus, iterations: 1, maxDuration: __ENV.DURATION || "1m" }
            : { executor: "constant-vus", vus, duration: __ENV.DURATION || "1m" },
    },
    thresholds: {
        http_req_failed: [`rate<${__ENV.MAX_ERROR_RATE || "0.01"}`],
        http_req_duration: [`p(95)<${__ENV.P95_MS || "1000"}`, `p(99)<${__ENV.P99_MS || "2500"}`],
        checks: ["rate>0.99"],
    },
};

function data(response) {
    try { return response.json().data; } catch { return null; }
}

function params(token, name, key) {
    return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key && { "Idempotency-Key": key }) }, tags: { name } };
}

function read(path, token, name) {
    const response = http.get(`${base}${path}`, params(token, name));
    check(response, { [`${name}: 200`]: (r) => r.status === 200 });
    return response;
}

export function setup() {
    let token = __ENV.AUTH_TOKEN;
    if (!token) {
        if (!__ENV.USERNAME || !__ENV.PASSWORD) fail("Set AUTH_TOKEN or USERNAME and PASSWORD for a test account");
        const login = http.post(`${base}/auth/login`, JSON.stringify({ username: __ENV.USERNAME, password: __ENV.PASSWORD }), { headers: { "Content-Type": "application/json" }, tags: { name: "login" } });
        if (login.status !== 200) fail(`Login failed (${login.status}); response body omitted`);
        token = data(login)?.accessToken;
        if (!token) fail("Login did not return an access token");
    }
    const profile = data(read("/auth/me", token, "profile"));
    if (!profile) fail("Cannot read test account profile");
    const branchId = __ENV.BRANCH_ID || profile.branchId;
    const state = { token, branchId, dashboard: profile.rawRole !== "CASHIER", runId: `${Date.now()}-${Math.floor(Math.random() * 1e9)}` };
    if (mode !== "reads") {
        if (__ENV.ALLOW_WRITES !== "1") fail("Write scenarios require ALLOW_WRITES=1 and dedicated test stock");
        if (!branchId || !__ENV.PRODUCT_IDS) fail("Write scenarios require BRANCH_ID and PRODUCT_IDS");
        const ids = __ENV.PRODUCT_IDS.split(",").map((id) => id.trim()).filter(Boolean);
        if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) fail("Supply 1–200 unique PRODUCT_IDS");
        if (mode === "inventory" && ids.length !== 1) fail("Inventory contention uses exactly one PRODUCT_IDS value");
        const quantity = Number(__ENV.QUANTITY || 1);
        if (!Number.isFinite(quantity) || quantity <= 0) fail("QUANTITY must be positive");
        const rate = __ENV.USD_TO_UZS_RATE ? Number(__ENV.USD_TO_UZS_RATE) : undefined;
        const saleType = __ENV.SALE_TYPE || "RETAIL";
        let total = 0;
        for (const id of ids) {
            const product = data(read(`/products/${id}`, token, "product-detail"));
            if (!product?.isActive) fail(`Test product unavailable: ${id}`);
            let price = Number(saleType === "WHOLESALE" ? product.wholesalePriceUzs : product.retailPriceUzs);
            const usd = Number(saleType === "WHOLESALE" ? product.wholesalePriceUsd : product.retailPriceUsd);
            if (price <= 0 && usd > 0) {
                if (!rate || rate <= 0) fail("USD-priced products require USD_TO_UZS_RATE");
                price = Number((usd * rate).toFixed(2));
            }
            total += Number((price * quantity).toFixed(2));
        }
        const credit = __ENV.CREDIT_CHECKOUT === "1";
        if (credit && !__ENV.CUSTOMER_ID) fail("Credit checkout requires CUSTOMER_ID");
        state.sale = { branchId, saleType, items: ids.map((productId) => ({ productId, quantity })), paidAmountUzs: credit ? 0 : Number(total.toFixed(2)), paidAmountUsd: 0, paymentMethod: credit ? "CREDIT" : "CASH_UZS", ...(rate && { usdToUzsRate: rate }), ...(__ENV.CUSTOMER_ID && { customerId: __ENV.CUSTOMER_ID }), note: `k6 ${state.runId}` };
        state.total = Number(total.toFixed(2));
        state.credit = credit;
    }
    return state;
}

function search(state) {
    const term = encodeURIComponent(__ENV.SEARCH || "");
    read(`/products?search=${term}&page=1&pageSize=20`, state.token, "product-search");
}

function checkout(state) {
    const key = `k6:${state.runId}:${execution.vu.idInTest}:${execution.scenario.iterationInTest}`;
    const request = params(state.token, "checkout", key);
    if (mode === "inventory") request.responseCallback = http.expectedStatuses(201, 409);
    const body = JSON.stringify(state.sale);
    const response = http.post(`${base}/sales`, body, request);
    const result = data(response);
    if (mode === "inventory" && response.status === 409) {
        stockConflicts.add(1);
        check(response, { "stock contention rejects shortage": (r) => r.json().message === "Insufficient stock for one or more products" });
        return;
    }
    if (!check(response, { "checkout created": (r) => r.status === 201 && Boolean(result?.id) })) return;
    saleSuccesses.add(1);
    if (Math.random() * 100 < Number(__ENV.RETRY_PERCENT || 20)) {
        const replay = http.post(`${base}/sales`, body, request);
        check(replay, { "checkout retry returns original sale": (r) => r.status === 201 && data(r)?.id === result.id });
    }
    if (state.credit) {
        const paymentBody = JSON.stringify({ amountUzs: state.total, amountUsd: 0, paymentMethod: "CASH_UZS" });
        const payment = http.post(`${base}/sales/${result.id}/payments`, paymentBody, params(state.token, "sale-payment", `${key}:payment`));
        check(payment, { "debt finalized": (r) => r.status === 200 && Number(data(r)?.debtAmountUzs) === 0 });
        const replay = http.post(`${base}/sales/${result.id}/payments`, paymentBody, params(state.token, "sale-payment-retry", `${key}:payment`));
        check(replay, { "payment retry returns original sale": (r) => r.status === 200 && data(r)?.id === result.id });
    }
}

export default function (state) {
    const branch = state.branchId ? `branchId=${encodeURIComponent(state.branchId)}&` : "";
    if (mode === "checkout" || mode === "inventory") { search(state); checkout(state); }
    else if (mode === "mixed") {
        const roll = Math.random() * 100;
        if (roll < 60) read(`/inventory?${branch}limit=50`, state.token, "inventory");
        else if (roll < 85) search(state);
        else if (roll < 95) checkout(state);
        else if (state.dashboard) read(`/analytics/dashboard?${branch}`, state.token, "dashboard");
        else read(`/customers?${branch}limit=50`, state.token, "customers");
    } else {
        read("/products?page=1&pageSize=20", state.token, "product-list");
        search(state);
        read(`/customers?${branch}search=${encodeURIComponent(__ENV.CUSTOMER_SEARCH || "")}&limit=20`, state.token, "customer-search");
        read(`/inventory?${branch}limit=50`, state.token, "inventory");
        if (state.dashboard) read(`/analytics/dashboard?${branch}`, state.token, "dashboard");
    }
    sleep(Number(__ENV.THINK_TIME_SECONDS || "0.2"));
}
