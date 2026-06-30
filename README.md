# SentimentScout - Pre-Match Sentiment Agent

An autonomous agent that runs ~2 hours before each World Cup match, gathers public sentiment (news + Reddit), compares it against TxLINE's opening odds, and generates a structured **signal card** - bullish/bearish/neutral per team, with a mismatch flag where the crowd and the market disagree. Submitted to the Superteam × TxODDS World Cup Hackathon - Trading Tools & Agents track.

**Stack:** Cloudflare Workers + Cron + D1 + Claude. No Container. News via Google News RSS and Reddit JSON (no keys).

- **Live:** https://sentimentscout.catchspider2002.workers.dev
- **GitHub:** https://github.com/catchspider2002/sentimentscout
- **Demo video:** _add link_
- **TxLINE endpoints used:** `POST /auth/guest/start`, `GET /api/fixtures/snapshot`, `GET /api/odds/snapshot/{fixtureId}`, `GET /api/scores/snapshot/{fixtureId}`

## How it works

- **Cron** (`src/worker.ts`, every 15 min): finds matches kicking off in ~2 hours, and scores any that have finished.
- **Scrape** (`src/scraper.ts`): Google News RSS + Reddit search JSON (server-side - no CORS, no keys). Twitter is intentionally skipped.
- **Analyse** (`src/analyser.ts`): Claude (`claude-sonnet-4-6`) compares sentiment to the opening odds and returns a strict JSON signal card (signals, mismatch, key factors, confidence). Deterministic fallback if no key; confidence forced low when < 5 sources.
- **Score**: after full time, directional signals (mismatch = true) are marked correct/incorrect; the dashboard tracks accuracy.

## Setup & deploy

```bash
npm install
wrangler login
wrangler d1 create sentimentscout       # paste id into wrangler.toml
npm run db:init:remote
wrangler secret put TXLINE_API_KEY
wrangler secret put ANTHROPIC_API_KEY    # optional (Claude analysis; fallback without it)
npm run deploy
```

## Demo

- `POST /api/run-now` (or the **Run now** button) runs the pipeline immediately instead of waiting for the cron window - generates signal cards for matches ~2h out and scores any finished ones.
- Cards show the per-team signal, a mismatch banner when sentiment and odds diverge, key factors, confidence, the market odds, and (post-match) whether the signal was correct.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/signals` | all signal cards (newest kickoff first) |
| GET | `/api/accuracy` | directional accuracy |
| POST | `/api/run-now` | run the pipeline now (gate before submitting) |

## Notes / limitations (hackathon scope)

- Sentiment is news headlines + Reddit titles; Twitter is skipped (API friction). Thin coverage → low confidence, surfaced honestly.
- One signal per match (generated once in the ~2h pre-kickoff window).
- `/api/run-now` is open for the demo - gate before final submission.
- A wallet connect can be added to satisfy the Solana sign-up requirement.
