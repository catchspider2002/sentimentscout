# SentimentScout — Cloudflare Deployment (as built)

**Track:** Trading Tools & Agents · **Subdomain:** `sentiment.<domain>`
**Live:** https://sentimentscout.catchspider2002.workers.dev · Spec: `SPEC.md` · Notes: `README.md`

## Shape (as built)

Pure **Workers + Cron + D1 + Claude** — no Container. A 15-minute cron runs the pre-match pipeline (generate signals ~2h before kickoff) and the post-match scorer in one pass. Sentiment scraping (Google News RSS + Reddit JSON) happens server-side from the Worker, so there are no CORS issues and no extra keys. JWT cache lives in a D1 `kv` table; the dashboard is served from `./public`.

## Component mapping

| Spec component | Cloudflare (shipped) |
|---|---|
| cron scheduler (2h pre-match + scorer) | one Worker `scheduled` cron `*/15 * * * *` → `runCron()` |
| `txline.js` (odds + fixtures) | `src/txline.ts` — auth + fixtures + `getOdds` (demargined `Pct`) + `getOutcome` |
| `scraper.js` (news + Reddit + Twitter) | `src/scraper.ts` — Google News RSS + Reddit JSON server-side (Twitter skipped) |
| `analyser.js` (Claude → signal JSON) | `src/analyser.ts` — `claude-sonnet-4-6`, strict JSON, 1 retry, deterministic fallback |
| `db/signals.json` | **D1** `signals` (+ `kv`) |
| `scorer.js` (post-match) | `runCron()` scores finished matches (mismatch = directional) |
| dashboard | `./public` via `[assets]` — accuracy bar + signal cards (mismatch banner, key factors, confidence, outcome) |
| Telegram channel (optional) | not implemented |

## Bindings (`wrangler.toml`, as shipped)

```toml
name = "sentimentscout"
main = "src/worker.ts"
compatibility_date = "2026-01-01"

[assets]
directory = "./public"
binding = "ASSETS"

[triggers]
crons = ["*/15 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "sentimentscout"
database_id = "REPLACE_WITH_D1_ID"
```

Secrets: `TXLINE_API_KEY` (required), `ANTHROPIC_API_KEY` (recommended — Claude analysis). News/Reddit need no keys.

## Deploy

```bash
npm install && wrangler login
wrangler d1 create sentimentscout       # paste id into wrangler.toml
npm run db:init:remote
wrangler secret put TXLINE_API_KEY
wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

## Notes

- Each cron pass generates for up to 6 matches in the ~2h window (bounds scraping + Claude calls); one signal per match.
- Reddit may rate-limit datacenter IPs (returns no posts) — the agent still runs on news alone and flags low confidence.
- Confidence is forced to "low" when fewer than 5 sentiment sources are found.
