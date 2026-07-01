# SentimentScout - Submission Checklist

Track: **Trading Tools & Agents** (Superteam × TxODDS World Cup Hackathon)
Live: https://sentimentscout.catchspider2002.workers.dev · Repo: https://github.com/catchspider2002/sentimentscout

## ✅ Done

- [x] Scraper: Google News RSS + Reddit JSON (server-side, no keys, no CORS)
- [x] Claude analyser → strict JSON signal card (signals, mismatch, key factors, confidence) + fallback
- [x] TxLINE client: auth + fixtures + opening odds + result
- [x] Cron (15-min): generate signals ~2h pre-kickoff + post-match scorer
- [x] Dashboard: accuracy bar + signal cards (mismatch banner, factors, confidence, outcome)
- [x] D1 schema (signals, kv); cron + assets config
- [x] Deployed to Cloudflare; `TXLINE_API_KEY` set
- [x] Verified deploy (Worker + D1 live)

## ⏳ Before submitting

- [ ] **Add `ANTHROPIC_API_KEY`**: `wrangler secret put ANTHROPIC_API_KEY` (Claude analysis; deterministic fallback without it)
- [ ] **Let it run** so cards generate in the ~2h pre-kickoff windows (or use Run now)
- [ ] **Record demo video** (≤5 min): Run now, show a signal card + mismatch banner + a scored past card
- [ ] **Add demo video link** to README + submission form
- [ ] **Push final code to GitHub** - confirm latest commit; verify `.dev.vars` is NOT committed
- [x] **Gated `/api/run-now`** behind `ADMIN_KEY` (403 without it); dashboard button hidden unless opened with `?admin=KEY`
- [ ] **Set `ADMIN_KEY`**: `wrangler secret put ADMIN_KEY` (required to use the "Run now" button)
- [ ] **Fill submission form**: live URL, GitHub URL, video URL, TxLINE endpoints used, API feedback
- [ ] Attach custom domain `sentiment.<domain>` (optional)

## 💡 Optional polish / known limitations

- [ ] Telegram channel auto-posting signal cards (token already supported in env example)
- [ ] Solflare/Phantom/Backpack connect on the dashboard (Solana sign-up requirement)
- [ ] Add a news API (NewsAPI/SerpApi) if Reddit datacenter rate-limits reduce source counts
