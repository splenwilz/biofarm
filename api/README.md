# Biofarm Lead-Capture API

FastAPI service that receives submissions from the first-party forms on
biofarm.co.uk, stores every lead (with full marketing attribution) in its own
database, and syncs them to Pipedrive. Replaces the old Pipedrive web-form iframe embeds,
which blocked GA4 conversion tracking and lost UTM/gclid lead-source data.

## How a submission flows

1. `POST /v1/leads/contact`, `/newsletter`, `/cpd`, `/fold` or `/landowner` (JSON, CORS-locked to biofarm.co.uk). One route per website form; the route fixes the form name Pipedrive titles and reporting use.
2. Validation (Pydantic) → spam checks (honeypot + minimum fill time + per-IP rate limit).
3. The lead is committed to the database **first** - the DB is the source of
   truth (SQLite on a persistent disk in production, swappable for Postgres via
   `DATABASE_URL`); a Pipedrive outage can never lose a lead.
   Response: `202 {"status":"accepted","id":...}`.
4. A background task then:
   - finds-or-creates the Person in Pipedrive (API v2), setting `marketing_status=subscribed` on newsletter opt-in;
   - creates a Lead (API v1 - leads have no v2) with attribution custom fields and, from a form that asked, the "Newsletter Sign Up" field (Opted In / Opted Out, as the old embeds wrote it; see `BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD`);
   - pins a Note with the message, the ticked fields, the contact form's "Where did you hear about us?" answer (`heard_about`, also kept on the row) and the attribution breakdown;
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
   through, per-IP rate limiting is spoofable - switch `client_ip()` in
   `app/routes/leads.py` to parse the rightmost `X-Forwarded-For` entry
   instead and re-verify.

Plan notes: web Starter ($7/mo) avoids free-tier spin-down (~60 s cold starts
would eat form submissions). Leads are stored in **SQLite on a 1 GB persistent
disk** (~$0.25/mo) mounted at `/var/data` - right-sized for form volume, and
the code is dialect-portable (same SQLAlchemy models/migrations), so moving to
managed Postgres later is just changing `DATABASE_URL`. Disk caveats: deploys
have a brief restart blip (services with disks skip zero-downtime deploys), and
disk durability = Render's **daily disk snapshots** (at least 7 days retained)
- snapshots restore the *whole disk* to the snapshot time, so up to a day of
leads can be lost and single files can't be cherry-picked. Take a logical
backup of `/var/data/leads.db` occasionally too (see Querying leads), or
upgrade to Postgres when the data matters enough.

### Pipedrive setup (one-off)

```bash
PIPEDRIVE_COMPANY_DOMAIN=biofarm PIPEDRIVE_API_TOKEN=xxx \
  uv run python scripts/setup_pipedrive_fields.py
```

Creates the UTM/attribution custom fields (leads inherit deal fields) and
prints the `BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP` value to set on the service. It also prints the `BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD` / `_OPTION_MAP` values read from the existing "Newsletter Sign Up" field.
Without it, attribution still lands in the pinned note and our DB - the map
just makes it filterable in Pipedrive.

`marketing_status` is only honoured if the Pipedrive account has the
**Campaigns add-on**; otherwise Pipedrive ignores the field (harmless).

### Pipedrive mirror (dashboard step 1)

`app/mirror/` pulls the Pipedrive account into our own tables, read-only:
the reader class has no method but GET, so nothing can be written back.
Tables (all `pd_`-prefixed, each row keeping the raw API record in `raw`):
pipelines, stages, deal field definitions (names and option labels behind
the custom-field hashes and enum ids), users, deals, persons (with their
Campaigns `marketing_status`), activities, the Leads inbox, deal stage
history, every deal field change, each person's consent changes
(`pd_marketing_status_changes`) and per-campaign opens and clicks
(`pd_campaign_stats`), and one row per import run.

```bash
uv run python scripts/import_pipedrive.py            # changes since the last good run
uv run python scripts/import_pipedrive.py --full     # everything, changelogs included
uv run python scripts/import_pipedrive.py --dry-run  # read and count, write nothing
```

Every write is an upsert on the Pipedrive id and the history tables have
natural keys, so running it again creates no duplicates. An incremental run
reads deals and persons updated since the previous good run's start minus
ten minutes, plus deals deleted in the last 30 days, then re-reads the
changelog only of deals whose `update_time` moved. Activities and open leads
use the same window; archived leads are always read whole (no filter there).
Paging is by cursor at 500 a page (v2) or start/limit (v1 leads and flow);
a 429 waits for `x-ratelimit-reset`, a 5xx or network error backs off and
retries up to five times, any other 4xx fails the run. The token travels in
the `x-api-token` header and is scrubbed from errors and logs.

Campaigns has no stats endpoint, so newsletter figures come from each
person's flow (`GET /v1/persons/{id}/flow`, items `marketing_status_change`
and `marketing_campaign_stat`): one call per person with consent (about
2,000 of 4,000), four at a time. A person's history is read on a full run,
when the person was edited since it was last read, and once it is 24 hours
old, because opens and clicks keep arriving for weeks after a send. That
is roughly 80k of the 1.08M daily API tokens. Webhooks and a schedule come
later.

### Dashboard feed (step 3)

`GET /v1/dashboard` is built once per import and kept in memory (keyed by the
last good import's finish time and the newest website record, since form
submissions land between imports), gzipped, and the feed queries skip the raw
API JSON on every row; a page view after an import takes the one rebuild, the
rest are served from memory. It returns the marketing dashboard's records in its own
`DashboardData` shape (camelCase JSON): deals, enquiries and the newsletter
section today; spend, traffic, search and events stay empty until their
feeds exist. The dashboard's server reads it with
the shared token in `x-dashboard-token`; the browser never sees the token or
this endpoint. `app/reporting/` applies the KPI rule: a deal belongs to the
audience of the pipeline it was created in (found from its stage history, so
a deal parked in DORMANT or moved to Legal keeps its origin); a Developer
Pipeline deal is qualified at creation, a Landowner Pipeline deal when it
first leaves CALL / QUALIFY for another stage of that pipeline.

Enquiries (agreed 8 Nov 2026) come from Pipedrive, so the series reaches back
to January 2024 rather than to the day our own form went live: every lead in
the Leads inbox (open and archived; archived ones are marked) plus every deal
created directly in a marketing pipeline. Left out, with a count per reason
in the log: deals with origin `Import`; titles matching the test pattern
("Test Valley" and "Testway" are real places and stay in); records whose UTM
campaign is a tracking test, or whose person has a test address or domain;
website sign-ups by people at a staff domain; and newsletter sign-ups, which
the feed reports by month under `newsletter.signups` instead. A deal
converted from a lead (`source_lead_id`, which v2 deals return on request)
is counted once: as the lead, at the lead's date, while the mirror still has
the lead; Pipedrive deletes converted leads, so a full import marks leads it
no longer sees as deleted. Each enquiry carries Pipedrive's source channel
(a word in the title can fix it, e.g. the FBI event batch; website-origin
records default to Website); the dashboard's KPI config decides which
channels are inbound and which are outbound / network, the same split as for
qualified deals. Our own `leads` table adds form, audience, source label,
campaign and landing page where a record matches by Pipedrive lead id or by
the origin id we send; without one, the source label is built from the
record's UTM Source, UTM Medium and Referrer custom fields by the same rules
(`touch_label`), so tracked website enquiries keep their source wherever the
feed runs; the team's own records have no form or page and the
audience "other", because lead labels in this account are campaign tags, not
audiences. `firstContactAt` is the first done call, email or meeting logged
against the person after the enquiry (tasks and planned activities do not
count). The rules are settings (`BIOFARM_ENQUIRY_*`, see below).

Newsletter issues are one row per campaign sent
(every Campaigns send, not only the monthly newsletter), counting people who
opened or clicked rather than repeat opens, with unsubscribes the consent
changes Pipedrive attributes to that campaign; subscribers by month replay
the consent changes to each month end. `syncedAt` is the last good import's
finish time.

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
| `BIOFARM_PIPEDRIVE_OWNER_ID` | no | fallback Pipedrive user ID for leads the owner map doesn't cover (unset = the API token's user) |
| `BIOFARM_PIPEDRIVE_OWNER_MAP` | no | JSON: enquiry type -> Pipedrive user ID. Keys are `<form>` or `<form>:<field>` (forms: contact, newsletter, cpd, fold, landowner; fields: developer, landowner, other; lower-case); most specific wins. Applied to the lead and to newly created persons. Values are integers (a digit string is accepted). Unknown keys, bad values or malformed JSON are logged as errors and dropped, the service still boots and those leads use the fallback owner. If Pipedrive rejects the owner (deactivated user, wrong id) the record is created without one, a warning is logged and the lead's `sync_error` notes it (status stays `synced`). e.g. `{"contact:developer": 23328240, "contact:landowner": 27433044, "cpd": 123}`. The landowner page form (`landowner`) sets the landowner field itself, so it routes by the `landowner` key (or `landowner:landowner`), never by `contact:landowner`; without a key it falls to the global owner |
| `BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL` | no | option id of "Website" in Pipedrive's **Source channel** deal field (Company settings > Data fields > Deal > Source channel, or the `channel` entry of `GET /v1/dealFields`; `1037` on the Biofarm account). Sent as `channel` on every lead; Pipedrive carries it onto the deal at conversion. Unset = no channel is sent and Sales picks it by hand. A value Pipedrive does not recognise gets a 400, in which case the lead is created without it, a warning is logged and `sync_error` notes it (status stays `synced`), the same way as a rejected owner. Bad shapes are logged and ignored at boot. |
| `BIOFARM_PIPEDRIVE_LEAD_LABEL_IDS` | no | JSON array of lead label UUIDs, applied to every lead |
| `BIOFARM_PIPEDRIVE_FORM_LABEL_MAP` | no | JSON: form -> extra label UUIDs, e.g. `{"newsletter": ["uuid"]}` |
| `BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP` | no | JSON from the bootstrap script |
| `BIOFARM_PIPEDRIVE_CLIENT_TYPE_FIELD` | no | "Client Type" person-field hash; set on newly created persons only |
| `BIOFARM_PIPEDRIVE_CLIENT_TYPE_MAP` | no | JSON: form value -> option id, e.g. `{"developer": 531}` |
| `BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD` | no | "Newsletter Sign Up" lead field hash (an option field; leads inherit deal fields). Set on every lead from a form that asks about the newsletter - contact and landowner (Opted In or Opted Out from the tick-box), newsletter (Opted In) - as the old Pipedrive embeds did; the CPD and Fold forms never ask, so their leads leave it empty |
| `BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP` | no | JSON: `{"opted_in": <option id>, "opted_out": <option id>}`, the field's option ids from `GET /v1/dealFields` |
| `BIOFARM_GA4_MEASUREMENT_ID` | no | `G-3MS9TLLZRN` |
| `BIOFARM_GA4_API_SECRET` | no | secret |
| `BIOFARM_DASHBOARD_TOKEN` | for the dashboard | shared secret the marketing dashboard's server sends as `x-dashboard-token` to `GET /v1/dashboard`; unset = the endpoint answers 503 to everyone |
| `BIOFARM_MIRROR_IMPORT_MINUTES` | for the dashboard | minutes between Pipedrive mirror imports run inside the web process (`15` on Render); `0` (default) = off. The import runs in-process because a Render cron job cannot reach the service's persistent disk, where the SQLite database lives. One run at a time: the run row in `pd_import_runs` is the lock. A run cancelled by a deploy's SIGTERM closes its row as failed on the way out, the web process closes any row still "running" when it starts, and the standalone script treats a row left "running" for 2 hours as dead |
| `BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL` | for the dashboard | "Website" option id of the Source channel deal field (1037). Without it website leads, and the deals they are converted into, reach Pipedrive with no Source channel (Pipedrive also drops `channel_id` then); the API warns at boot and the dashboard falls back to origin API / Web Forms = Website |
| `BIOFARM_PIPEDRIVE_PIPELINE_AUDIENCES` | no | JSON: pipeline id -> `developer` or `landowner`, default `{"3":"developer","7":"developer","2":"landowner","6":"landowner"}` (the two DORMANT pipelines keep their audience) |
| `BIOFARM_ENQUIRY_EXCLUDED_DEAL_ORIGINS` | no | JSON list of Pipedrive deal origins that are not enquiries, default `["Import"]` |
| `BIOFARM_ENQUIRY_WEBSITE_ORIGINS` | no | JSON list of origins that mean "came through the website" (default Website channel; form read from the title, except that a Pipedrive web form named `Landowner Contact Form` - the landowner page's embed until November 2026 - counts as the `landowner` form so the by-form table stays in one row across the switch), default `["WebForms","API"]` |
| `BIOFARM_ENQUIRY_TEST_CAMPAIGNS` | no | JSON list of UTM campaigns that were tracking tests, default `["tracking-test","go-live-check","field-map","final-check"]` |
| `BIOFARM_ENQUIRY_TEST_DOMAINS` / `BIOFARM_ENQUIRY_TEST_EMAILS` | yes, for real figures | JSON lists; a person with such an address was the team testing the forms (lower-cased before comparing). Default domains `["biofarm-test.dev"]`, default emails none: the team's own domains and addresses are set in the environment, never in the code, and a value replaces the default (so include `biofarm-test.dev` again) |
| `BIOFARM_ENQUIRY_STAFF_DOMAINS` | no | JSON list; website sign-ups by people at these domains are staff trying the forms, default `["biofarm.co.uk"]` |
| `BIOFARM_ENQUIRY_TEST_TITLE_PATTERN` | no | case-insensitive regex for test titles, default `\btest\b(?!\s+valley)` |
| `BIOFARM_ENQUIRY_NEWSLETTER_TITLE_PATTERN` | no | case-insensitive regex; website records whose title matches are newsletter sign-ups, default `^\s*newsletter` |
| `BIOFARM_ENQUIRY_CHANNEL_BY_TITLE` | no | JSON object: a whole word in the title -> Source channel label it forces, default `{"FBI":"Trade Show / Event"}` |
| `BIOFARM_PIPEDRIVE_DEVELOPER_PIPELINE_ID`, `..._LANDOWNER_PIPELINE_ID`, `..._LANDOWNER_QUALIFY_STAGE_ID` | no | the KPI rule's ids, default 3, 2 and 6 |
| `BIOFARM_AUTO_CREATE_TABLES` | prod: `false` | Alembic owns the schema in prod |
| `BIOFARM_RATE_LIMIT` | no | default `5/minute` per IP |
| `BIOFARM_MIN_FILL_SECONDS` | no | spam fill-time threshold, default 3 |
| `BIOFARM_CORS_ORIGINS` | no | JSON array; defaults to biofarm.co.uk |

## What every lead carries (source stamping)

Besides the title, person, owner, labels and attribution custom fields, each
lead is created with the three source fields of Pipedrive's `addLeadRequest`:

| Field | Value | Why |
|---|---|---|
| `origin_id` | this service's lead row id (UUID) | Pipedrive keeps `origin_id` on the deal a lead is converted into and has no lead id on deals, so this is the join key from a deal back to the enquiry |
| `channel` | `BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL` | the Source channel Sales used to pick by hand; set automatically so website-sourced deals are never mis-tagged |
| `channel_id` | `source/medium` from `app/services/attribution.py` | a readable sub-source for the lead list and reporting: UTM source/medium, else the paid click id (`google/cpc`, `bing/cpc`, `facebook/social`), else `<referrer host>/referral`, else `direct`; last touch, falling back to first touch |

Pipedrive's own `origin` is always `API` for these leads and cannot be set.

## Known limitations & future improvements

- **Failed syncs need a manual nudge.** `sync_status='failed'` rows keep the
  error but nothing retries them automatically yet. Next step: a small retry
  command (Render cron job or admin endpoint) that re-runs `process_lead` for
  failed rows. Select them by `sync_status = 'failed'`, never by
  `sync_error IS NOT NULL`: a synced lead can carry a `sync_error` note when
  its owner was rejected and the record was created without one, and
  re-running those would duplicate the Pipedrive note.
- **Rate limiting is in-memory, per instance.** Correct for a single Render
  instance; switch the `limits` storage to Redis before scaling horizontally.
  Client IPs come from the edge-set `True-Client-IP` header (see
  `client_ip()` in `app/routes/leads.py`), falling back to the socket peer.
  Until step 4 above has confirmed Render overwrites a client-supplied value,
  treat per-IP limiting as spoofable - the honeypot/fill-time checks are the
  deeper layer.
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
  denied-until-consent, visitors who decline will have no GA client_id - the
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
