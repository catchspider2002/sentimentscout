-- SentimentScout D1 schema
-- Apply: wrangler d1 execute sentimentscout --remote --file ./schema.sql

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

-- One pre-match signal card per match.
CREATE TABLE IF NOT EXISTS signals (
  match_id      TEXT PRIMARY KEY,
  home_team     TEXT, away_team TEXT,
  kickoff       INTEGER,
  generated_at  INTEGER,
  odds_json     TEXT,             -- { home, draw, away } implied probabilities
  signal_json   TEXT,             -- Claude output
  sources_n     INTEGER,          -- sentiment sources found (for confidence)
  outcome       TEXT,             -- home_win | draw | away_win
  signal_correct INTEGER          -- 1 | 0 | null
);
CREATE INDEX IF NOT EXISTS idx_sig_kick ON signals (kickoff);
