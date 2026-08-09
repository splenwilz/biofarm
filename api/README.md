# Biofarm Lead-Capture API

FastAPI service that receives submissions from the first-party forms on
biofarm.co.uk, stores every lead (with full marketing attribution) in its own
database, and syncs them to Pipedrive. Replaces the old Pipedrive web-form iframe embeds,
which blocked GA4 conversion tracking and lost UTM/gclid lead-source data.

## How a submission flows

1. `POST /v1/leads/contact` or `POST /v1/leads/newsletter` (JSON, CORS-locked to biofarm.co.uk).
2. Validation (Pydantic) → spam checks (honeypot + minimum fill time + per-IP rate limit).
3. The lead is committed to the database **first** — the DB is the source of
   truth (SQLite on a persistent disk in production, swappable for Postgres via
   `DATABASE_URL`); a Pipedrive outage can never lose a lead.
   Response: `202 {"status":"accepted","id":...}`.
4. A background task then:
   - finds-or-creates the Person in Pipedrive (API v2), setting `marketing_status=subscribed` on newsletter opt-in;
   - creates a Lead (API v1 — leads have no v2) with attribution custom fields;
   - pins a Note with the message + attribution breakdown;
   - optionally fires a GA4 Measurement Protocol event (`generate_lead_server`).
5. Sync outcome is recorded on the row: `synced | failed | skipped_spam | disabled`.
   Failed rows keep the error and can be re-synced later.

Spam-flagged submissions still get a 202 (never tip off bots) but are stored
flagged and never reach Pipedrive.

## Local development

```bash
cd api
uv sync                 # install (Python 3.13)
uv run pytest           # full test suite
uv run uvicorn app.main:app --reload   # http://127.0.0.1:8000, sqlite dev.db
```

Configuration comes from env vars / `.env` (see `.env.example`). All app
settings use the `BIOFARM_` prefix; `DATABASE_URL` is also accepted bare
because Render injects it that way (postgres URLs are rewritten to the
asyncpg driver automatically).

## Deploying on Render

The Blueprint lives at the repo root: `render.yaml` (service `rootDir: api`,
region Frankfurt, health check `/healthz`, migrations run via
`alembic upgrade head` chained into the start command).

1. Push to GitHub → Render dashboard → New → Blueprint → pick this repo.
2. Render prompts for the `sync: false` secrets:
   `BIOFARM_PIPEDRIVE_COMPANY_DOMAIN` (e.g. `biofarm`) and
   `BIOFARM_PIPEDRIVE_API_TOKEN` (Pipedrive → Personal preferences → API).
3. After first deploy, note the service URL (`https://biofarm-api.onrender.com`)
   and put it in the form blocks' `API_BASE` constant. Optionally add a custom
   domain `api.biofarm.co.uk` (CNAME to the onrender.com host).
4. **Verify the client-IP assumption** (Render doesn't officially document
   that its edge overwrites a client-supplied `True-Client-IP`): submit a test
   lead with `curl -H 'True-Client-IP: 203.0.113.99' ...` and check the stored
   `client_ip` is your real IP, not `203.0.113.99`. If the forged value comes
   through, per-IP rate limiting is spoofable — switch `client_ip()` in
   `app/routes/leads.py` to parse the rightmost `X-Forwarded-For` entry
   instead and re-verify.

Plan notes: web Starter ($7/mo) avoids free-tier spin-down (~60 s cold starts
would eat form submissions). Leads are stored in **SQLite on a 1 GB persistent
disk** (~$0.25/mo) mounted at `/var/data` — right-sized for form volume, and
the code is dialect-portable (same SQLAlchemy models/migrations), so moving to
managed Postgres later is just changing `DATABASE_URL`. Disk caveats: deploys
have a brief restart blip (services with disks skip zero-downtime deploys), and
disk durability = Render's **daily disk snapshots** (at least 7 days retained)
— snapshots restore the *whole disk* to the snapshot time, so up to a day of
leads can be lost and single files can't be cherry-picked. Take a logical
backup of `/var/data/leads.db` occasionally too (see Querying leads), or
upgrade to Postgres when the data matters enough.

### Pipedrive setup (one-off)

```bash
PIPEDRIVE_COMPANY_DOMAIN=biofarm PIPEDRIVE_API_TOKEN=xxx \
  uv run python scripts/setup_pipedrive_fields.py
```

Creates the UTM/attribution custom fields (leads inherit deal fields) and
prints the `BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP` value to set on the service.
Without it, attribution still lands in the pinned note and our DB — the map
just makes it filterable in Pipedrive.

`marketing_status` is only honoured if the Pipedrive account has the
**Campaigns add-on**; otherwise Pipedrive ignores the field (harmless).

### GA4 setup (optional server-side events)

GA4 Admin → Data streams → your stream → Measurement Protocol API secrets →
create one; set `BIOFARM_GA4_MEASUREMENT_ID` + `BIOFARM_GA4_API_SECRET`.
The client-side `generate_lead` event (fired by the form block) is the key
event; the server event is named `generate_lead_server` so the two never
double-count. Mark `generate_lead` as a key event in GA4 Admin → Events.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | on Render | `sqlite+aiosqlite:////var/data/leads.db` (set by Blueprint); any Postgres URL also works |
| `BIOFARM_PIPEDRIVE_COMPANY_DOMAIN` | yes | `{domain}.pipedrive.com` |
| `BIOFARM_PIPEDRIVE_API_TOKEN` | yes | secret; sent as `x-api-token` header |
| `BIOFARM_PIPEDRIVE_OWNER_ID` | no | Pipedrive user ID to own new leads |
| `BIOFARM_PIPEDRIVE_LEAD_LABEL_IDS` | no | JSON array of lead label UUIDs |
| `BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP` | no | JSON from the bootstrap script |
| `BIOFARM_GA4_MEASUREMENT_ID` | no | `G-3MS9TLLZRN` |
| `BIOFARM_GA4_API_SECRET` | no | secret |
| `BIOFARM_AUTO_CREATE_TABLES` | prod: `false` | Alembic owns the schema in prod |
| `BIOFARM_RATE_LIMIT` | no | default `5/minute` per IP |
| `BIOFARM_MIN_FILL_SECONDS` | no | spam fill-time threshold, default 3 |
| `BIOFARM_CORS_ORIGINS` | no | JSON array; defaults to biofarm.co.uk |

## Known limitations & future improvements

- **Failed syncs need a manual nudge.** `sync_status='failed'` rows keep the
  error but nothing retries them automatically yet. Next step: a small retry
  command (Render cron job or admin endpoint) that re-runs `process_lead` for
  failed rows.
- **Rate limiting is in-memory, per instance.** Correct for a single Render
  instance; switch the `limits` storage to Redis before scaling horizontally.
  Client IPs come from `X-Forwarded-For` (uvicorn `--proxy-headers`); a
  determined client can forge that header to dodge the per-IP limit — the
  honeypot/fill-time checks are the deeper layer.
- **Spam protection is honeypot + fill-time + rate limit.** The old Pipedrive
  embed had reCAPTCHA. If junk gets through, add Cloudflare Turnstile: one
  widget in the form blocks, one server-side verify call here.
- **Person matching is search-then-create** (Pipedrive has no atomic upsert);
  two simultaneous submissions from the same new email could create a
  duplicate person. Harmless at form volume.
- **5xx responses from Pipedrive are not retried** (only 429s are); they land
  in `sync_status='failed'` and are covered by the retry story above.
- **`marketing_status`** silently requires the Campaigns add-on (see above).
- **PII retention is indefinite.** `client_ip` and `user_agent` are stored for
  spam review with no expiry; add a scheduled job to null them after a fixed
  window (e.g. 30 days) and mention that window in the privacy policy.
- If the Cookiebot default for `analytics_storage` is ever switched to
  denied-until-consent, visitors who decline will have no GA client_id — the
  lead and its UTM attribution still land in the database/Pipedrive; only the GA4
  session join is lost.

## Querying leads

Render dashboard → biofarm-api → Shell (or `render ssh`), then:

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('/var/data/leads.db')
for row in db.execute('''SELECT created_at, form, name, email,
    json_extract(attribution, '\$.utm_source'),
    json_extract(attribution, '\$.utm_campaign'), sync_status
    FROM leads WHERE spam_flagged = 0 ORDER BY created_at DESC LIMIT 50'''):
    print(row)
"
```

To back up, first make a *consistent* copy (copying the live file mid-write can
tear it), then download that copy:

```bash
rm -f /var/data/leads-backup.db  # VACUUM INTO refuses to overwrite
python3 -c "import sqlite3; sqlite3.connect('/var/data/leads.db').execute(\"VACUUM INTO '/var/data/leads-backup.db'\")"
```

then fetch `/var/data/leads-backup.db` via the dashboard shell or
`render ssh biofarm-api -- cat /var/data/leads-backup.db > leads-backup.db`.
