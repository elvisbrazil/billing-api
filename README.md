# billing-api

Subscription billing API built with Fastify, TypeScript and PostgreSQL. It handles plans, customers,
subscriptions with trials, invoices with sequential numbers, payment attempts through a gateway port,
plan changes with proration and a dunning schedule for failed payments.

Prices are integers in cents and the only currency accepted is BRL.

## Running locally

```bash
docker compose up -d
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

The API listens on `http://localhost:3000` and the OpenAPI docs are at `/docs`.

```bash
pnpm test        # vitest, uses PGlite, no Docker needed
pnpm job:renew   # run renewals and payment retries once
```

With the Docker image, migrations and the job are plain node entrypoints:

```bash
docker build -t billing-api .
docker run --rm -e DATABASE_URL=... billing-api node dist/db/migrate.js
docker run --rm -e DATABASE_URL=... billing-api node dist/jobs/renew.js
```

Set `BILLING_JOB_INTERVAL_MS` to run the same billing cycle inside the API process on an interval
(`0` disables it).

## Example

```bash
curl -X POST localhost:3000/plans -H 'content-type: application/json' \
  -d '{"code":"pro-monthly","name":"Pro","interval":"month","priceCents":4990,"trialDays":7}'

curl -X POST localhost:3000/customers -H 'content-type: application/json' \
  -d '{"name":"Ana Souza","email":"ana@example.com"}'

curl -X POST localhost:3000/subscriptions -H 'content-type: application/json' \
  -H 'Idempotency-Key: 6d0f3a52-signup' \
  -d '{"customerId":"<customer id>","planId":"<plan id>"}'

curl -X POST localhost:3000/subscriptions/<id>/change-plan -H 'content-type: application/json' \
  -d '{"planId":"<other plan id>"}'

curl -X POST localhost:3000/subscriptions/<id>/cancel -H 'content-type: application/json' \
  -d '{"atPeriodEnd":false}'

curl -X POST localhost:3000/invoices/<id>/pay -H 'Idempotency-Key: retry-2026-06-01'
```

The fake gateway declines every charge for the emails listed in `FAKE_GATEWAY_DECLINED_EMAILS`, which
is the easiest way to see the dunning flow.

## Design notes

- **Lifecycle.** `trialing -> active -> past_due -> canceled`. A failed charge moves the subscription
  to `past_due`; a later successful charge moves it back to `active`.
- **Billing periods** are computed from a fixed anchor (trial end or signup time), not from the
  previous period end, so Jan 31 renews on Feb 28 (Feb 29 in leap years) and then on Mar 31 again.
  All date math is done in UTC.
- **Proration rounding.** On a plan change the unused time of the old plan is credited and the
  remaining time of the new plan is charged, both measured in whole seconds. Each of the two amounts
  is rounded to the nearest cent, half up, using integer arithmetic. The net is the sum of the two
  rounded lines, so an invoice always adds up to its lines. Plan changes only happen between plans
  with the same interval.
- **Proration is invoiced on renewal.** The two lines are stored as pending items and added to the
  next renewal invoice. If an invoice would go below zero, the remaining credit is carried to the
  following one.
- **Invoice numbers** (`2026-000123`) are assigned when a draft is finalized, inside the same
  transaction, from a per-year counter row locked with `SELECT ... FOR UPDATE`. A rollback releases
  the number and voided invoices keep theirs, so there are no gaps.
- **Renewals are idempotent.** The period advance and the invoice insert happen in one transaction,
  and `(subscription_id, period_start)` is unique. Running the job twice, or two jobs at once, issues
  one invoice per period.
- **Dunning.** Failed invoices are retried 1, 3 and 7 days after the first failure. If the last retry
  fails the invoice becomes `uncollectible` and the subscription is canceled.
- **Idempotency-Key** on `POST /subscriptions` and `POST /invoices/:id/pay` stores the response
  (including 4xx problems such as a declined payment) and replays it with `idempotent-replayed: true`.
  Reusing a key with a different body returns 422. Keys are not expired yet.
- **Gateway calls hold the invoice row lock.** It keeps double charges out at the cost of holding a
  transaction open during the call, which is fine for the fake adapter but would need a timeout or an
  outbox with a real provider.
- **Errors** follow RFC 7807 (`application/problem+json`).
- **Tests** run the real Drizzle migrations against PGlite and inject a fake clock and gateway, so
  period, renewal and dunning scenarios can be driven day by day.
