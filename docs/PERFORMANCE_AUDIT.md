# Backend performance and concurrency audit

## Scope and baseline (2026-09-07)

Reviewed all source modules, routes/controllers/DTO validation, data access, Prisma schema and migrations, auth/roles/tenant boundaries, billing lifecycle, startup/deployment, Socket.IO, local images/receipt storage, helpers and existing tests before editing. There are no refund/return, external payment gateway, scheduled worker, queue, cache or report-export modules. Checkout is `POST /sales`; subsequent collections use `POST /sales/:id/payments`.

The existing singleton Prisma/pg adapter, batched product validation and stock-in, selected list/detail projections, async bcrypt (cost 12), tenant filters, and targeted transfer rooms are sound foundations. Most writes acquire `Store FOR UPDATE`, making the store a serialization point. This currently protects FIFO deductions and payment updates, so removing it without narrower locks would introduce races.

## Prioritized implementation plan

Continuation note: commit `62f6ae7` merged additional receipt grouping, transfer reservations, shared customer/phone identity, debt-payment history, profile photos and R2 storage. Re-inspection found their migrations/controllers had been merged without the matching Prisma fields/service logic. The continuation restores those existing features alongside the optimizations, not a new business model. New tests cover reservation creation/replay/cancellation, legacy transfer completion, main-branch owner confirmation, receipt groups, customer links and debt history. The current 28-migration test database matches Prisma with no detected drift.

| Priority | File / function | Evidence and load effect | Proposed change |
| --- | --- | --- | --- |
| P0 | transfers.service.ts / complete, cancel | Reads PENDING before waiting for the store lock; two completions can both move stock, or cancellation overwrite completion | Conditional PENDING transition inside the transaction, before stock changes |
| P0 | inventory.service.ts / adjust | Reads quantity and computes delta before transaction; changes Inventory only, leaving FIFO batches inconsistent | Lock before reading, reconcile batches and balance atomically; log the physical-count adjustment |
| P0 | sales.service.ts / create, addPayment | No persistent request identity; retries create another sale/payment | Optional Idempotency-Key with database uniqueness and transactionally recorded result IDs |
| P1 | billing-state.service.ts / transactional guards | Exclusive tenant lock serializes unrelated POS operations | Opt-in shared billing guard for audited sales/inventory/transfers; ordered inventory locks and sale row locks; retain exclusive administration/capacity/lifecycle locks |
| P1 | inventory.service.ts / deductStock | Reads all active batches and updates each consumed batch individually, for every item | SQL FIFO window calculation and set-based batch update, exact decimals, conditional balance deduction |
| P1 | products/customers/admins/inventory repositories; branches/categories | Legacy list paths have no take; pagination accepts fractions/Infinity/negative take | Bounded array reads with reachable subsequent pages; strict integer parsing; preserve existing envelopes |
| P1 | analytics.service.ts / inventoryReport | Batch-cost subquery aggregates all tenants before joining scoped inventory | Push tenant and branch filters into the subquery |
| P2 | inventory.service.ts / findBatchesSummary, findBatchesPaginated | Four summary queries scan the same table; paginated path issues six calls | One conditional aggregate; reuse its total when filters are absent |
| P2 | schema.prisma | Mostly separate tenant, branch and timestamp indexes despite combined filters and sorts | Add only indexes supporting actual hot list/history queries |
| P2 | product-image-upload.middleware.ts; product-images.service.ts | Memory uploads have file/count limits but no admission bound; five 40 MP sharp jobs run together | Bound admitted uploads and multipart fields; process/store one image at a time |
| P2 | rateLimit.ts | Map has no hard bound; scans every bucket on every request above 5,000 keys | Bounded map, incremental expiry, reject new keys at capacity |
| P2 | platform.service.ts / updateStoreStatus | Password verification uses a separate pool connection while holding a transaction/store lock | Verify before transaction, check unchanged password/authVersion inside it |
| P3 | prisma.ts, server.ts, errorHandler.ts | Pool wait has no explicit deadline; no shutdown; DB failures in auth become 401 | Configurable pool/timeouts, safe duration logging, predictable errors, resource draining |
| P3 | billing-state.service.ts / refreshDueBillingStates | Platform reads can fan out up to 1,000 refreshes at once | Bounded refresh concurrency and in-flight coalescing for the sweep |

## Compatibility and remaining work

Do not cache live stock or authorization snapshots. Preserve role checks and billing revocation barriers. No production database migrations or load tests are run automatically. New indexes/constraints need deployment review against existing data. Substring search semantics remain unchanged; measure plans before opting into PostgreSQL trigram indexes. Real-time messages already use rooms and small payloads; preserve the second handshake check, which closes a revocation race.

Implementation, migration rollout, verification results and load-test instructions are recorded in `PERFORMANCE.md` when complete.
