"""Read-only pulls from Google Ads, GA4 (Analytics Data API) and Search Console
into daily tables, for the marketing dashboard's spend, traffic and search
sections. Thin REST clients over httpx (the APIs are plain JSON; no Google
SDKs), one shared OAuth refresh-token exchange (app.google.auth), an importer
that replaces a trailing window each run (app.google.importer)."""
