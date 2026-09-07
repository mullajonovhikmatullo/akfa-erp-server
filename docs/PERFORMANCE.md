# Performance changes and operating guide

The audit is in [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md). These changes retain the Express/controller/service/repository structure, Prisma/pg singleton, billing rules, FIFO batches, and existing response envelopes. They add no production dependencies.

## Implemented now

### Correctness and transactions

- Sales, stock receipts/adjustments and transfers use a shared `Store` row lock for billing authorization. Administrative writes, plan capacity checks, and store lifecycle changes retain their exclusive lock. Do not switch other callers to shared mode without auditing their own invariants. PostgreSQL shared row locks allow concurrent holders while excluding updates: [PostgreSQL locking reference](https://www.postgresql.org/docs/16/explicit-locking.html).
- Stock writers acquire transaction-scoped advisory locks for every affected `(storeId, branchId, productId)` in sorted order, including inventory rows that do not exist yet. Opposing transfers lock both branches before changing either. Locks are released by PostgreSQL on commit/rollback, including process failure.
- Checkout deducts inventory conditionally (`quantity >= requested`), consumes FIFO batches using an exact-numeric window calculation, and inserts movements in a batch. A shortage in any item rolls back the entire sale, payment, inventory and retry claim. FIFO ties use batch ID after receipt time. Transfer destination batches/balances/movements are also written in batches.
- Transfer creation preserves the newer reservation model: it deducts source stock and persists exact FIFO allocations in the same batched SQL operation. Completion receives the reserved stock without deducting it twice; legacy pending transfers without allocations still deduct on completion. Cancellation restores the original source batches/costs in one update. Completion/cancellation atomically claims `PENDING`; competing/repeated transitions receive 409, and any failure rolls the claim back. Incomplete reservations fail closed for reconciliation. Assigned receiving-branch owners retain confirmation access.
- Payment collection locks the sale row before reading its debt, then updates the sale/payment and customer balance in the same transaction. Tiny payments that round to zero UZS are rejected. Existing overpayment behavior is retained.
- Physical-count adjustment reads the current balance after locking. It consumes older batches for a reduction or creates an adjustment batch at the product's existing UZS/USD cost for an increase. It sets inventory to the counted quantity and records the original/current quantities and delta. An explicit physical count also reconciles historical balance/batch drift; there is no automatic rewrite of historical inventory or valuation. Review the product cost before correcting an upward count.
- The platform password confirmation path hashes/verifies outside the transaction and rechecks the account/password/authVersion within it.

### Persistent idempotency

Optional `Idempotency-Key` headers are supported on:

| Method/path (also under `/api`) | Operation protected |
| --- | --- |
| `POST /sales` | Sale, initial payment, stock deductions, customer debt |
| `POST /sales/:id/payments` | Payment and debt reduction |
| `POST /inventory/stock-in` | Batch, stock and movement |
| `POST /inventory/stock-in/batch` | All receipt batches and movements |
| `POST /inventory/adjustment` | Physical-count correction |
| `POST /transfers` | Pending transfer creation and source FIFO reservation |

Use a fresh UUID/key for each intended operation and persist it in the POS client until the result is known. Retries must reuse the same key and input. Keys allow 1–128 characters from letters, digits, `.`, `_`, `:`, `-`. The uniqueness scope is store + authenticated user + operation + key. Reusing a key for different input returns 409. Object property order does not change request identity; item array order does.

The claim, business operation and resulting IDs commit in one database transaction. Failed operations leave no claim. Concurrent duplicates wait for that transaction (subject to configured timeouts). Replay returns the existing resource with its current fields, rather than a cached HTTP snapshot: sale debt/payment history and batch remaining quantity may have advanced. Adjustment replay reconstructs the original result from its movement and does not reapply an old count. Transfer creation replay emits no additional event.

Authentication, branch scope and current billing authorization still apply to replays. Keys are not expired automatically: removing them would permit an old retry to execute again. Establish a client retry horizon and archival policy before introducing retention cleanup. Requests without the header retain their old behavior and can still duplicate a creation on network retries. An ambiguous database/network timeout must be retried with the same key.

### Lists and API compatibility

Legacy array responses keep their existing format, but these endpoints now default to **100 records**, allow **`limit=1..500`**, and support **`offset=0..1000000`**:

- products, customers, admins, branches;
- product categories and expense categories;
- inventory (including `/inventory/low-stock`) and stock batches;
- public plans and platform plan catalogs.

Examples: `/api/products?limit=100&offset=100`, `/api/customers?search=Ali&limit=20`, `/api/inventory?productId=<uuid>&limit=100`.

Existing `page` responses for products/categories/admins/branches/sales/batches are retained. `page` is a positive integer; `pageSize` is 1–100 (default 10). Platform store pages retain default 20. Malformed, fractional, negative, infinite, or oversized pagination values return validation errors instead of reaching Prisma. Existing sales/transfers/expenses/movement list limits remain bounded with their previous defaults/maxima. Sales/transfer writes allow up to 200 unique product lines; receipt batches retain their existing 100-line cap.

**Client rollout requirement:** callers that previously loaded an entire array must traverse pages/windows. This is a record-limit change even though JSON shapes are unchanged. This repository contains no frontend implementation to update or verify. Existing bounded sale detail/history shapes are preserved; unusually long payment histories may still need a separate paginated endpoint in future.

Low-stock filtering now runs in PostgreSQL before limiting the result. The dedicated low-stock route no longer mutates Express 5's query getter. Stock summaries use one aggregate instead of four; an unfiltered batch page uses two repository queries instead of six, or three with extra filters. Platform dashboard counts reuse existing grouped results. Inventory report batch costs are filtered by store/branch inside the aggregate subquery.

### Runtime, memory and logging

The pg adapter owns one pool and closes it on `prisma.$disconnect()`. Its existing default of ten connections is retained. [pg pool configuration](https://node-postgres.com/apis/pool) describes connection acquisition, idle settings, and pool shutdown.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `DB_POOL_MAX` | 10 | Connections per Node process |
| `DB_CONNECTION_TIMEOUT_MS` | 5000 | Connection establishment/acquisition deadline |
| `DB_IDLE_TIMEOUT_MS` | 10000 | Idle pool connection lifetime |
| `DB_STATEMENT_TIMEOUT_MS` | 30000 | PostgreSQL statement execution deadline |
| `DB_LOCK_TIMEOUT_MS` | 5000 | PostgreSQL lock acquisition deadline |
| `DB_IDLE_TRANSACTION_TIMEOUT_MS` | 60000 | PostgreSQL idle-in-transaction deadline |
| `DB_TRANSACTION_MAX_WAIT_MS` | 10000 | Prisma transaction acquisition budget |
| `DB_TRANSACTION_TIMEOUT_MS` | 60000 | Prisma transaction duration budget |
| `SLOW_REQUEST_MS` / `SLOW_QUERY_MS` | 1000 / 500 | Diagnostic logging thresholds |
| `HTTP_REQUEST_TIMEOUT_MS` / `HTTP_HEADERS_TIMEOUT_MS` | 120000 / 60000 | Incoming request/header deadlines |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | 5000 | Idle HTTP keep-alive lifetime |
| `SHUTDOWN_TIMEOUT_MS` | 75000 | Maximum shutdown drain time |
| `PRODUCT_IMAGE_CONCURRENT_UPLOADS` | 2 | Admitted image-upload requests per process |
| `PROFILE_PHOTO_CONCURRENT_UPLOADS` | 2 | Admitted base64 profile-photo requests per process |
| `STORAGE_CONNECTION_TIMEOUT_MS` / `STORAGE_REQUEST_TIMEOUT_MS` | 5000 / 30000 | Existing R2 client's per-attempt connection/request deadlines |

Pool size is a deployment budget, not a throughput target: four processes at ten connections reserve up to forty database connections, plus migrations, operators and other clients. Increasing the pool can worsen database contention. All listed values must be positive integers. Choose statement limits appropriate to measured report execution, and keep the orchestration grace period longer than the drain budget. Compose now allows 90 seconds for stopping the backend.

HTTP request timeout bounds incoming bytes, not application execution. Database/transaction deadlines bound DB work. SIGTERM/SIGINT stop accepting traffic, close Socket.IO, drain HTTP requests, then disconnect Prisma and its owned pool; a hard deadline exits nonzero if draining fails. Startup errors, uncaught exceptions and unhandled rejections log sanitized error types/locations and initiate failure shutdown.

Standard JSON requests are limited to 1 MB; the existing base64 receipt submission endpoint retains 6 MB. Images retain the 5 MB/file, five-file and 40-megapixel decoding limits. Admission is bounded before multer allocates buffers, and multipart fields/parts are bounded. Excess concurrent uploads receive 503 with Retry-After. Each admitted request processes/stores one image at a time; its slot is held through processing even if the client disconnects. File cleanup on failure remains in place. Bcrypt stays async at cost 12.

The newer profile-photo endpoint retains its 8 MB JSON contract (5 MB decoded clear image plus 1 MB thumbnail), but authenticates and acquires a bounded upload slot before parsing that body. Its slot is released in the controller's finally block after processing/database work. Existing client-side image optimization and profile response fields are preserved. R2 remains an optional, already-present storage provider; its SDK connection/request deadlines are bounded and its client is destroyed during shutdown. SDK retries still apply per attempt; the shutdown hard deadline bounds a stalled drain.

Merge reconciliation also restores existing receipt-group reads, normalized customer phone uniqueness/branch links, and paginated debt-payment history. Customer recent-sales lookup now respects branch-scoped callers even when a customer is linked to multiple branches. No existing migration was rewritten to restore those schema definitions.

Rate-limit maps are capped at 10,000 keys per limiter. Expiry removal is amortized instead of a full scan per request, and capacity rejects new keys without evicting active enforcement. Billing sweeps coalesce overlapping work and process at most four refreshes at once per process. This is not a cache of authorization or stock.

Access logging includes method, route template, status and duration, with healthy health checks omitted. Slow/error/aborted requests include a generated X-Request-Id; slow database events include duration/table and a request ID where async context is available. SQL, parameters, query strings, bodies, tokens and passwords are not logged. Pool errors and fatal failures are visible. Driver pool timeouts, Prisma timeouts and transaction conflicts return bounded, predictable responses instead of being converted to authentication failures. External log buffering/aggregation remains deployment work.

### Socket.IO

Existing store-manager, source/destination-branch, user-revocation and platform-owner rooms remain. The second handshake database check is intentionally preserved because it closes a revocation race. Transfer payloads remain small. New changes reject duplicate server initialization, limit inbound messages to 64 KiB, bound handshake token length, close resources during shutdown, and suppress transfer creation replay events.

## Database rollout

`20260907120000_pos_concurrency_performance` creates the idempotency table and indexes, a partial unique index enforcing one pending subscription payment per store, and nonnegative inventory/batch checks. Existing applied migrations were not modified.

The new query indexes are:

| Model | Indexed fields | Query supported |
| --- | --- | --- |
| Product | storeId, createdAt, id | Tenant catalog ordering |
| Inventory | storeId, updatedAt, id | Current-stock list ordering |
| StockBatch | storeId, receivedAt, id; branchId, receivedAt, id | Receipt/history pages |
| StockBatch | branchId, productId, receivedAt, id | FIFO ordered batches |
| StockMovement | storeId, createdAt, id; branchId, createdAt, id; branchId, productId, createdAt, id | Tenant/branch/product history |
| Customer | storeId, createdAt, id; branchId, createdAt, id | Customer lists |
| Sale | storeId, createdAt, id; branchId, createdAt, id | Sales pages/date-filtered reports |
| Expense | storeId, expenseDate | Tenant date-filtered expenses |
| Transfer | storeId, createdAt, id; fromBranchId, status, createdAt; toBranchId, status, createdAt | Transfer lists and branch pending work |
| IdempotencyRecord | unique storeId/userId/operation/key; createdAt | Retry lookup; age/retention inspection |

Run the read-only checks in `deploy/performance-preflight.sql` before deployment. Resolve duplicate pending payments through the normal financial review process. Audit/reconcile any historical inventory discrepancies; do not silently clamp or delete balances. New checks are `NOT VALID`, which enforces new/changed rows without scanning old tables when added. After reconciliation, validate them with the statements in that file's comments.

Deploy via the existing `npm run deploy` process **before** running new application code. Do not mix old/new stock writers during rollout: drain old processes before switching, because older stock-in logic can overwrite adjusted balances. The migration uses standard Prisma-compatible CREATE INDEX statements, which block writes while each index is built. Schedule a maintenance window and estimate build time/storage on production-sized staging data. For a very large live database, prepare an operator-reviewed concurrent index rollout as a separate change; do not put multi-statement concurrent index creation into this migration or edit an applied migration. Each new index adds write/storage overhead; evaluate actual query plans and index usage after deployment.

No production database was altered as part of this work.

## Validation and load tests

Verification on 2026-09-07: `npm run build` and `npm test` pass (eight test files; DB opt-ins also executed separately). The PostgreSQL 16 suite passes all 16 concurrency cases (17 reported tests including its parent); the real HTTP/Socket.IO/profile-upload/SIGTERM lifecycle test also passes. All 28 current migrations are applied in the isolated test database, and Prisma's database-to-schema comparison reports no difference. The OpenAPI export, k6 script syntax check and `git diff --check` pass. The k6 executable is not installed here, so no k6 latency/throughput benchmark or production capacity claim is made. R2 service calls were not tested against a live bucket.

Run normal verification with:

```bash
npm run build
npm test
```

Database tests are opt-in and never fall back to DATABASE_URL. Use a dedicated migrated database whose name ends in `_test`:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm run deploy
TEST_DATABASE_URL="$TEST_DATABASE_URL" node tests/pos-concurrency.integration.test.js
TEST_DATABASE_URL="$TEST_DATABASE_URL" node tests/runtime.integration.test.js
```

The tests create unique fixtures and remove only those IDs. Coverage includes last-item contention, atomic rollback, idempotent sale/payment/receipt/adjustment retries, FIFO fractions and ordering, concurrent debt payments, physical-count races, first-time stock creation, duplicate/completing/cancelling/opposite transfers, tenant/branch isolation, shared/exclusive lock behavior, constant FIFO update count, pool exhaustion, malformed/oversized HTTP requests, Socket.IO transport closure and SIGTERM shutdown. The original billing fixture's fixed future date was corrected to avoid date-dependent failures.

Install k6 separately using its [official installation instructions](https://grafana.com/docs/k6/latest/set-up/install-k6/); no k6 package is needed in production. The script uses existing endpoints and logs in once during setup, or accepts a supplied token. It never supplies invented application credentials.

```bash
# Set AUTH_TOKEN, or USERNAME and PASSWORD, in your test environment.
BASE_URL=http://127.0.0.1:3000/api SCENARIO=reads VUS=10 DURATION=1m \
  k6 run tests/load/erp-pos.js

# Dedicated test branch/products with sufficient stock; this creates real sales.
ALLOW_WRITES=1 SCENARIO=checkout BRANCH_ID="$TEST_BRANCH_ID" \
  PRODUCT_IDS="$TEST_PRODUCT_IDS" VUS=10 DURATION=1m \
  k6 run tests/load/erp-pos.js

# To also collect/finalize debt, supply CREDIT_CHECKOUT=1 and CUSTOMER_ID.
# Mixed choices: 60% inventory reads, 25% product search, 10% sales, 5% dashboard.
ALLOW_WRITES=1 SCENARIO=mixed BRANCH_ID="$TEST_BRANCH_ID" \
  PRODUCT_IDS="$TEST_PRODUCT_IDS" k6 run tests/load/erp-pos.js

# One test product, one iteration per VU, all competing for the same stock.
ALLOW_WRITES=1 SCENARIO=inventory BRANCH_ID="$TEST_BRANCH_ID" \
  PRODUCT_IDS="$TEST_PRODUCT_ID" VUS=20 k6 run tests/load/erp-pos.js
```

Other inputs: `SEARCH`, `CUSTOMER_SEARCH`, `QUANTITY`, `SALE_TYPE`, `USD_TO_UZS_RATE`, `THINK_TIME_SECONDS`, `RETRY_PERCENT` (default 20). Cashier accounts skip analytics endpoints they cannot access. No fixture data is seeded or replenished by k6. Use the integration tests for exact final-state invariants; the inventory k6 scenario counts successful sales and expected stock conflicts. Do not share these fixture stocks with normal operations.

Default thresholds (HTTP errors <1%, p95 <1000 ms, p99 <2500 ms) are starting experiment settings, **not production requirements**. Change `MAX_ERROR_RATE`, `P95_MS`, `P99_MS` based on the intended workload and service goals; see [k6 threshold documentation](https://grafana.com/docs/k6/latest/using-k6/thresholds/). Expected shortage 409s are accepted only in the inventory contention scenario. Never use debug HTTP logging with real credentials. Record hardware, dataset size, connection settings, concurrency, duration, p95/p99/errors, CPU/RSS and PostgreSQL wait/query statistics for comparisons. No production user-capacity claim follows from these tests.

## Recommended infrastructure work (not added)

1. Measure search with production-shaped data. Existing case-insensitive substring search is retained; normal B-tree indexes do not accelerate arbitrary `%term%` matching. Consider selective `pg_trgm` GIN indexes for actual slow name/SKU/description/customer queries after EXPLAIN/ANALYZE and write-cost measurement. The existing unique `(storeId, sku)` supports exact POS SKU lookup already.
2. Existing in-memory Socket.IO rooms and rate limits operate per process. Before adding Node/PM2/Docker replicas, configure a shared Socket.IO adapter and distributed revocation/rate limiting, and session affinity if long-polling remains enabled. Redis would serve these concrete coordination needs, plus measured static-metadata caches with invalidation. Stock and authorization snapshots should not become stale caches. No Redis dependency was introduced.
3. Local image files require a consistent shared storage strategy across replicas; the newer repository already provides optional R2, whose existing Compose settings are preserved. The deployment already includes Nginx; configure connection/body limits and upstream timeouts coherently with application settings. No new load balancer, microservices or Kubernetes layer is needed solely for this patch.
4. Heavy reports remain synchronous SQL aggregates. Profile their row counts/ranges; introduce bounded jobs/exports only when response deadlines or database contention justify them. A queue requires durable retry/ownership semantics, not fire-and-forget work after an HTTP response. No existing queue or report-export worker was present.
5. If optimized reporting still competes with checkout, consider pre-aggregations or read replicas for reports that tolerate lag. Inventory checks, payments, checkout, authorization and read-after-write responses must remain on the primary. No live inventory was cached.
6. Review growth/retention of stock movements, audit records, receipts/profile photos stored in the database, unused image files, auth handoffs and idempotency records. Indexes help lookup but do not replace retention/backup planning. Profile/login responses retain base64 image fields for compatibility and can be large; coordinate a URL/thumbnail-only contract before reducing them. Detailed sale payment histories and grouped reports retain existing shapes; the paginated debt-payment endpoint is available for collections, but a general paginated history/export API may still be needed.
7. The pg client currently emits a query-overlap deprecation warning during Prisma interactive transactions; inspect the adapter/client compatibility when upgrading pg/Prisma. No dependency upgrades were forced during this optimization.
