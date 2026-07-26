# Tenant Rental Flow

## Entry Paths

1. Public onboarding uses `POST /public/stores/register`.
   - Only public `START` and `BUSINESS` plans are accepted.
   - Store, main branch, owner, subscription, audit record and handoff are created atomically.
   - The response contains a five-minute single-use login handoff, not a JWT.
2. Platform provisioning uses `POST /platform/stores`.
   - Only `PLATFORM_OWNER` can call it.
   - The owner receives no known default password.
   - A 24-hour single-use setup code lets the owner choose a private password.
3. Lost, unused setup links can be replaced with
   `POST /platform/stores/:id/owner/setup-link`.
   - Creating a replacement invalidates every previous unused setup code.
   - The platform owner must re-enter the current platform password.

Handoff and setup codes are placed in the URL fragment (`#handoff=` or `#setup=`).
Fragments are not sent as HTTP referrers and the store app removes them from browser
history before making the exchange request. Only SHA-256 hashes are stored in the
database.

## Billing State

`Store.status` and `Subscription.status` are changed together under a store row lock.
The supported lifecycle is:

- `TRIALING` becomes `PAST_DUE` when its trial expires.
- An approved payment creates a valid period and activates the store.
- Manual payment amount is taken from the store plan in UZS and covers exactly one
  server-calculated month; clients cannot choose the amount, currency or period.
- `PAST_DUE` is read-only; business mutations return HTTP `402`.
- `SUSPENDED` blocks all tenant access and disconnects active sockets.
- `CANCELLED` is terminal. Users, handoffs and pending payments are invalidated.

Manual updates require the current `billingVersion`. Cancellation additionally
requires a reason, exact store name or slug confirmation, and the platform owner's
current password. Sensitive platform actions are rate limited.

## Tenant Security Invariants

- Tenant identity always comes from the reloaded authenticated user, never request data.
- Store and branch writes include tenant predicates at the database write boundary.
- Branch admins and cashiers are constrained to their assigned branch.
- Plan limits are checked under a store row lock to prevent parallel quota bypass.
- Every tenant write locks and rechecks the current billing state inside the same
  database transaction, so an in-flight request cannot commit after cancellation.
- JWTs include `authVersion`; password changes and account cancellation invalidate old tokens.
- Socket authentication reloads user and billing state and emits transfer events only
  to platform owners, store managers and the two involved branches.
- Platform credentials have no built-in fallback. A new deployment fails closed until
  secure credentials are configured.

## Deployment

```bash
npm ci
npm run build
npm run deploy
npm start
```

Set all values documented in `.env.example`. Never run `prisma migrate reset` against
a live database. `npm run deploy` uses `prisma migrate deploy` and is safe to repeat.

## Next Rental Phases

The current phase covers secure provisioning, trials, manual payments, limits,
suspension and cancellation. Production billing should next add an idempotent payment
provider webhook, verified phone/email ownership, a shared rate-limit store such as
Redis, and an audit-log viewer for the platform owner.
