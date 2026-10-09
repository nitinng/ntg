# process-email-queue — deployment notes

This function runs with the **service role key**, so everything it does bypasses
row-level security. Until the H4 change it performed no authorization at all:
Supabase's default `verify_jwt` is not a gate here, because the anon key is
itself a valid JWT and ships in the client bundle. "Has a JWT" meant "has read
our JavaScript".

## Who may do what

| Action | Who |
|---|---|
| Drain the queue (`batchSize`) | any signed-in user |
| Supply `provider` / `providerConfig` / `activeSmtpSlot` | Admin, PNC, PNC Admin, Finance |
| `ping` / connection test | Admin, PNC, PNC Admin, Finance |
| `webhook` delivery notifications | the worker secret only |

Draining is deliberately open to any signed-in user: an employee's own lifecycle
mail is queued from their browser and `triggerWorker()` nudges this function
immediately afterwards, so requiring staff would leave that mail unsent. What
the queue may contain is constrained separately, by the recipient guard on
`email_queue` (migration `20261008110000`).

An unprivileged caller's `providerConfig` is ignored rather than rejected, so a
stray override degrades to the stored configuration instead of failing.

## Environment variables

| Variable | Required | Effect |
|---|---|---|
| `SUPABASE_URL` | yes | unchanged |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | unchanged |
| `ALLOWED_ORIGINS` | **set this** | Comma-separated browser origins allowed to call the function. Defaults to `https://ng-travel-desk.vercel.app`. |
| `QUEUE_WORKER_SECRET` | only for webhooks / cron | Shared secret presented as `x-worker-secret`. |

### ALLOWED_ORIGINS — set it before you deploy

`Access-Control-Allow-Origin` used to be `*`, which let any website call this
function from a visitor's browser. It now echoes back only recognised origins.

**If the portal is served from any origin other than the default, set this or
the Email Center will stop working in the browser** — the request reaches the
function, but the browser discards the response. Include every origin you serve
from, preview deployments included:

```
ALLOWED_ORIGINS=https://ng-travel-desk.vercel.app,https://travel.navgurukul.org
```

### QUEUE_WORKER_SECRET — needed if a provider posts delivery events

The `webhook` branch rewrites `email_queue` rows by `provider_message_id` and
carries no proof of origin, so anyone who could reach it could mark mail
Delivered, Bounced or Failed at will. It now requires the shared secret.

**If `QUEUE_WORKER_SECRET` is unset the webhook branch is closed entirely.**
That is deliberate — it fails closed rather than open — but it means an existing
provider webhook stops updating delivery status until you set the variable and
configure the provider to send `x-worker-secret` with the same value. Nothing
else breaks: queue draining and sending are unaffected.

The same secret lets a machine caller (a cron job, an external scheduler) drive
the function with full privileges and no user session.

## What is still not fixed

Delivery webhooks are authenticated by shared secret, not by verifying the
provider's own signature (SES SNS signatures, Resend's signing secret). A secret
is a real improvement over nothing, but signature verification is stronger and
remains worth doing.
