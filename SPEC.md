# SentimentScout - Pre-Match Sentiment Agent
## Build Spec for Claude Code

---

## What we're building

An autonomous agent that runs before every World Cup match, scrapes social media and news sentiment, compares it against TxLINE's opening odds, and generates a structured pre-match signal card - bullish, bearish, or neutral on each team. Cards are published to a public web dashboard and optionally pushed to a Telegram channel. The agent runs on a schedule with zero human input.

Submitted to the **Superteam × TxODDS World Cup Hackathon** under the **Trading Agents** track.

**Hackathon deadline:** July 19, 2026 (23:59 UTC)  
**Required:** running agent (live or devnet), demo video, public GitHub repo, working dashboard link

---

## Architecture overview

```
Cron Scheduler (runs 2 hours before each kickoff)
       │
       ▼
Agent Pipeline
  ├── Step 1: Fetch opening odds from TxLINE for the upcoming match
  ├── Step 2: Scrape sentiment sources (news headlines + Reddit + X/Twitter)
  ├── Step 3: Call Claude API → analyse sentiment vs odds → generate signal card
  ├── Step 4: Store signal card in database
  ├── Step 5: Publish to dashboard + (optional) push to Telegram channel
       │
       ▼
Dashboard (Next.js or plain HTML)
  ├── Lists all upcoming matches with signal cards
  ├── Shows historical accuracy (post-match, was the signal right?)
  └── Public URL for judges to review
```

---

## Project structure

```
sentimentscout/
├── agent/
│   ├── index.js              # Cron scheduler + pipeline orchestrator
│   ├── txline.js             # Fetch odds + fixture list from TxLINE
│   ├── scraper.js            # Sentiment data collection
│   ├── analyser.js           # Claude API → signal card generator
│   ├── scorer.js             # Post-match: score the signal against outcome
│   └── publisher.js          # Write to DB + push to Telegram
├── backend/
│   ├── server.js             # Express API for dashboard
│   └── routes/
│       ├── signals.js        # GET /signals - all signal cards
│       └── matches.js        # GET /matches - fixture list
├── frontend/
│   ├── index.html            # Dashboard
│   ├── app.js
│   └── styles.css
├── db/
│   └── signals.json          # Flat file DB (JSON) - no setup needed
├── .env.example
├── package.json
└── README.md
```

---

## Agent pipeline - detailed spec

### Step 1: Fetch odds from TxLINE (`txline.js`)

Run 2 hours before kickoff for each upcoming match.

Fetch:
- Opening odds: home win / draw / away win
- Implied probabilities (convert from decimal odds: `1 / odds`)
- Match metadata: teams, kickoff time, competition stage (group / knockout)

Store as the baseline for comparison with sentiment.

Refer to TxLINE docs for exact endpoints: https://txline.txodds.com/documentation/worldcup

### Step 2: Scrape sentiment sources (`scraper.js`)

Collect sentiment from three sources. Use web search via Claude's built-in web search tool or the `axios` + `cheerio` stack for scraping.

**Source A - News headlines**
- Query: `"[Team A] vs [Team B] World Cup 2026"` via a news search API
- Options (pick one):
  - NewsAPI.org (free tier: 100 requests/day)
  - SerpApi Google News (free tier available)
  - Direct Google News RSS: `https://news.google.com/rss/search?q=[query]&hl=en`
- Collect top 10 headlines + snippets published in last 48 hours
- No need to scrape full articles - headlines + snippets are enough for sentiment

**Source B - Reddit**
- Subreddits: `r/worldcup`, `r/soccer`, `r/football`
- Use Reddit JSON API (no auth needed for public posts):
  `https://www.reddit.com/r/worldcup/search.json?q=[Team A]+[Team B]&sort=new&limit=20`
- Collect top 20 post titles + top comment snippets from last 24 hours

**Source C - X/Twitter (optional, rate-limited)**
- Use Twitter API v2 free tier if available
- Query: `[Team A] OR [Team B] #WorldCup2026` - last 100 tweets
- If Twitter API is unavailable or rate-limited: skip this source and note it in the README - the agent works fine with just news + Reddit

**Output from scraper:** a single object per match:
```js
{
  matchId,
  homeTeam, awayTeam,
  newsHeadlines: [...],     // array of strings
  redditPosts: [...],       // array of strings
  tweets: [...],            // array of strings (empty if unavailable)
  collectedAt: ISO timestamp
}
```

### Step 3: Claude API analysis (`analyser.js`)

Single Claude API call per match with all sentiment data + TxLINE odds.

System prompt:
```
You are a sports betting analyst. Your job is to compare pre-match public sentiment with opening market odds to identify potential mismatches - cases where the crowd is significantly more or less confident than the market.

You will be given:
- Opening odds for an upcoming World Cup match (with implied probabilities)
- A collection of news headlines, Reddit posts, and tweets about the match

Your output must be a JSON object with exactly this structure:
{
  "homeSignal": "bullish" | "bearish" | "neutral",
  "awaySignal": "bullish" | "bearish" | "neutral",
  "sentimentSummary": "2-3 sentence summary of what the public sentiment says",
  "oddsContext": "1-2 sentence description of what the market is pricing in",
  "mismatch": true | false,
  "mismatchExplanation": "1-2 sentences explaining the gap between sentiment and odds, or null if no mismatch",
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "confidence": "low" | "medium" | "high"
}

Definitions:
- bullish: public sentiment is more positive on this team than the odds imply
- bearish: public sentiment is more negative on this team than the odds imply  
- neutral: sentiment roughly matches the odds
- mismatch: true if sentiment and odds diverge meaningfully (>15% implied probability gap)
- confidence: your confidence in the signal based on volume and consistency of sentiment data

Output only valid JSON, no markdown, no explanation outside the JSON object.
```

User message:
```json
{
  "match": {
    "homeTeam": "Brazil",
    "awayTeam": "France",
    "kickoff": "2026-06-28T18:00:00Z",
    "stage": "Group A"
  },
  "odds": {
    "homeWin": { "decimal": 2.10, "impliedProbability": 0.476 },
    "draw": { "decimal": 3.40, "impliedProbability": 0.294 },
    "awayWin": { "decimal": 3.20, "impliedProbability": 0.313 }
  },
  "sentiment": {
    "newsHeadlines": [...],
    "redditPosts": [...],
    "tweets": [...]
  }
}
```

Use `claude-sonnet-4-6`, `max_tokens: 500`, response must be valid JSON.

Parse response with `JSON.parse()`. If parsing fails, retry once, then log error and skip this match.

### Step 4: Store signal card (`db/signals.json`)

Append to a flat JSON file - no database setup required for hackathon:

```json
[
  {
    "id": "uuid",
    "matchId": "txline_match_id",
    "homeTeam": "Brazil",
    "awayTeam": "France",
    "kickoff": "2026-06-28T18:00:00Z",
    "generatedAt": "2026-06-28T16:00:00Z",
    "odds": { ... },
    "signal": { ...Claude output... },
    "outcome": null,          // filled in post-match by scorer.js
    "signalCorrect": null     // filled in post-match
  }
]
```

Use file locking (`proper-lockfile` npm package) to prevent race conditions if multiple matches run simultaneously.

### Step 5: Post-match scoring (`scorer.js`)

Run 30 minutes after each match ends (cron).

- Fetch final score from TxLINE
- Determine actual outcome: home win / draw / away win
- Compare against the signal:
  - If `homeSignal: "bullish"` and home team won → `signalCorrect: true`
  - If `homeSignal: "bearish"` and home team lost/drew → `signalCorrect: true`
  - Otherwise → `signalCorrect: false`
  - If `mismatch: false` → `signalCorrect: null` (no directional signal was made)
- Update the record in `signals.json`
- Track overall accuracy % on the dashboard

---

## Scheduler (`agent/index.js`)

Use `node-cron` npm package.

Two cron jobs:

```js
// Run pipeline for upcoming matches - every hour, check if any match kicks off in ~2 hours
cron.schedule('0 * * * *', runPreMatchPipeline)

// Score completed matches - run 30 mins after each expected full time
cron.schedule('30 * * * *', runPostMatchScorer)
```

`runPreMatchPipeline`:
1. Fetch all upcoming matches from TxLINE
2. Filter for matches kicking off between 1h55m and 2h05m from now
3. For each: run the full Step 1-5 pipeline
4. Log start/end + any errors

Handle concurrent matches (multiple games on the same day) with `Promise.allSettled()` - run them in parallel, don't let one failure block others.

---

## Dashboard (`frontend/index.html`)

Simple, clean public page. No auth.

Sections:

**1. Live signal cards (upcoming matches)**
For each match with a signal card generated:
- Team names + kickoff time
- Signal badges: `[🟢 Brazil: Bullish]` `[🔴 France: Bearish]`
- Mismatch highlight: if `mismatch: true`, show a yellow banner: "Sentiment-odds gap detected"
- Sentiment summary (2-3 sentences from Claude)
- Key factors (bulleted list)
- Odds at time of analysis
- Confidence badge: Low / Medium / High

**2. Historical accuracy tracker**
Simple stats bar:
- Total signals generated: N
- Directional signals (mismatch=true): N
- Correct: N  |  Incorrect: N  |  Accuracy: X%

**3. Past match cards**
Same card layout as above but with outcome appended: "Brazil won 2-1 - signal was correct ✓"

---

## Visual design

Clean, analytical aesthetic - this is a Trading Agents submission, not Fan Experiences, so it should look like a data tool.

- White background, minimal colour
- Signal badges:
  - Bullish: `background: #EAF3DE; color: #3B6D11` (green)
  - Bearish: `background: #FCEBEB; color: #A32D2D` (red)
  - Neutral: `background: #F1EFE8; color: #5F5E5A` (grey)
- Mismatch banner: `background: #FAEEDA; color: #854F0B` (amber)
- Confidence badge: small pill, Low=grey, Medium=blue, High=purple
- Monospace font for odds numbers (`font-family: var(--font-mono)`)
- Fully responsive

---

## Telegram channel (optional but recommended)

Create a public Telegram channel (e.g. `@SentimentScoutWC`). The agent auto-posts each signal card as a message 2 hours before kickoff.

Message format:
```
Pre-match signal: Brazil vs France
Kickoff: 18:00 UTC

Market: Brazil 47% | Draw 29% | France 31%

Signal:
🟢 Brazil - Bullish (sentiment > odds)
🔴 France - Bearish (sentiment < odds)

⚠️ Mismatch detected: Public strongly backing Brazil despite market pricing them as only slight favourites. Heavy news cycle around Mbappé injury rumours may be overweighted.

Key factors:
• Mbappé fitness doubts dominating coverage
• Brazil home support narrative
• Reddit strongly pro-Brazil (3:1 ratio)

Confidence: Medium

Powered by SentimentScout + TxLINE
```

Use the same Telegram Bot API setup as PunditBot (separate bot token).

---

## Deployment

- **Agent + backend:** Railway or Fly.io - needs a persistent process for cron jobs and SSE
- **Frontend:** Vercel or Netlify
- Agent must be running continuously to catch pre-match windows - do not deploy to a platform that spins down on inactivity (Render free tier spins down after 15 mins)

---

## Environment variables (`.env`)

```
TXLINE_API_KEY=your_txline_key
TXLINE_BASE_URL=https://txline.txodds.com
ANTHROPIC_API_KEY=your_anthropic_key
NEWS_API_KEY=your_newsapi_key         # newsapi.org
TELEGRAM_BOT_TOKEN=your_token        # optional, for channel posts
TELEGRAM_CHANNEL_ID=@SentimentScoutWC  # optional
PORT=3001
```

---

## Demo video plan (max 5 minutes)

1. **0:00-0:30** - Open the dashboard. Show 2-3 signal cards for upcoming matches. Explain what bullish/bearish means in 10 seconds.
2. **0:30-1:30** - Trigger the agent manually (add a `/run-now` endpoint for demo purposes) and show it running live in the terminal: TxLINE odds fetch → scraper → Claude API call → signal card appears on the dashboard.
3. **1:30-2:30** - Open a signal card in detail. Read the sentiment summary. Show the mismatch explanation. Point out the key factors.
4. **2:30-3:30** - Show the historical accuracy section. Even if only a few matches have completed, demonstrate that the scoring logic works - pull up a past card and show `signalCorrect: true/false`.
5. **3:30-4:00** - (If Telegram enabled) Show the channel message arriving with the formatted signal.
6. **4:00-4:30** - Show the `signals.json` file growing with each match - proves persistence and autonomous operation.
7. **4:30-5:00** - Wrap: "Runs automatically before every one of the 104 World Cup matches. Zero human input. Sentiment meets market - every game."

---

## Submission checklist

- [ ] Agent runs autonomously on cron schedule (no manual trigger needed)
- [ ] Signal cards generated for upcoming matches
- [ ] Post-match scoring working (signalCorrect populated after final whistle)
- [ ] Dashboard live and publicly accessible
- [ ] Accuracy tracker showing real data
- [ ] (Optional) Telegram channel live with signal posts
- [ ] GitHub repo public with README
- [ ] Demo video uploaded
- [ ] TxLINE endpoints used listed in submission form
- [ ] API feedback prepared

---

## TxLINE resources

- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup docs: https://txline.txodds.com/documentation/worldcup
- Support: Discord and Telegram
- Data fees waived until July 19, 2026

---

## Key decisions / notes for Claude Code

- **Flat file DB is intentional** - `signals.json` requires zero setup and is easy to inspect during the demo. For production you'd use Postgres, but for 25 days of a tournament it's fine.
- **Add a `/run-now?matchId=xxx` endpoint** for demo purposes - lets you trigger the pipeline on demand without waiting for the cron window. Remove or gate it before submitting.
- **Google News RSS needs no API key** - start with that if NewsAPI rate limits are an issue: `https://news.google.com/rss/search?q=Brazil+France+World+Cup+2026&hl=en&gl=US&ceid=US:en`
- **Reddit API needs a User-Agent header** - set `User-Agent: SentimentScout/1.0` on all requests or Reddit will 429 you.
- **Twitter is optional** - don't block progress on it. The agent is fully functional with news + Reddit only. Add Twitter if you have API access and time.
- **The accuracy tracker is a key judging signal** - it proves the agent is actually running autonomously over time, not just a one-shot demo. Make sure it's visually prominent on the dashboard.
- **Confidence calibration:** instruct Claude to set `confidence: "low"` when fewer than 5 sentiment sources are found for a match. Some group stage games involving smaller nations will have thin coverage - better to flag low confidence than generate a spurious signal.
- **Handle the no-mismatch case clearly** - most matches won't have a meaningful sentiment-odds gap. The dashboard should show these as "No significant signal" rather than hiding them. Showing the null case honestly makes the tool more credible to judges.
