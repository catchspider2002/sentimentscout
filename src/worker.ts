// SentimentScout - Worker. Pre-match sentiment pipeline (cron) + scorer + dashboard API.
import { listFixtures, getOdds, getOutcome, TxEnv } from './txline';
import { collect } from './scraper';
import { analyse, Signal } from './analyser';

export interface Env { DB: D1Database; ASSETS: Fetcher; TXLINE_API_KEY?: string; DEEPINFRA_API_KEY?: string; ADMIN_KEY?: string }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const PRE_MIN = 1.5 * 3600e3, PRE_MAX = 2.5 * 3600e3;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url); const path = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (path === '/api/signals' && req.method === 'GET') {
        const r = await env.DB.prepare('SELECT * FROM signals ORDER BY kickoff DESC LIMIT 100').all<any>();
        return json({ signals: (r.results || []).map((s) => ({ matchId: s.match_id, home: s.home_team, away: s.away_team, kickoff: s.kickoff, odds: parse(s.odds_json), signal: parse(s.signal_json), sources: s.sources_n, outcome: s.outcome, correct: s.signal_correct })) });
      }
      if (path === '/api/accuracy' && req.method === 'GET') return json(await accuracy(env));
      if (path === '/api/run-now' && req.method === 'POST') {
        if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403);
        return json({ ok: true, ...(await runCron(env)) });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
  },
  async scheduled(_e: ScheduledEvent, env: Env): Promise<void> { await runCron(env); },
};

async function runCron(env: Env): Promise<{ generated: number; scored: number }> {
  if (!env.TXLINE_API_KEY) return { generated: 0, scored: 0 };
  const txenv: TxEnv = { DB: env.DB, TXLINE_API_KEY: env.TXLINE_API_KEY };
  const now = Date.now();
  let fixtures = [] as Awaited<ReturnType<typeof listFixtures>>;
  try { fixtures = await listFixtures(txenv); } catch { return { generated: 0, scored: 0 }; }

  // 1) Generate signals ~2h before kickoff.
  const upcoming = fixtures.filter((f) => f.startTime >= now + PRE_MIN && f.startTime <= now + PRE_MAX).slice(0, 6);
  let generated = 0;
  for (const f of upcoming) {
    const exists = await env.DB.prepare('SELECT 1 FROM signals WHERE match_id=?').bind(String(f.fixtureId)).first();
    if (exists) continue;
    const odds = await getOdds(txenv, f.fixtureId);
    if (!odds) continue;
    const sentiment = await collect(f.home, f.away);
    const signal = await analyse(env.DEEPINFRA_API_KEY, f.home, f.away, odds, sentiment);
    await env.DB.prepare('INSERT OR IGNORE INTO signals (match_id,home_team,away_team,kickoff,generated_at,odds_json,signal_json,sources_n) VALUES (?,?,?,?,?,?,?,?)')
      .bind(String(f.fixtureId), f.home, f.away, f.startTime, now, JSON.stringify(odds), JSON.stringify(signal), sentiment.sources).run();
    generated++;
  }

  // 2) Score finished matches.
  const due = await env.DB.prepare('SELECT match_id, signal_json FROM signals WHERE outcome IS NULL AND kickoff < ?').bind(now - 2 * 3600e3).all<any>();
  let scored = 0;
  for (const row of due.results || []) {
    const r = await getOutcome(txenv, row.match_id);
    if (!r.finished || !r.outcome) continue;
    const correct = scoreSignal(parse(row.signal_json), r.outcome);
    await env.DB.prepare('UPDATE signals SET outcome=?, signal_correct=? WHERE match_id=?')
      .bind(r.outcome, correct === null ? null : (correct ? 1 : 0), row.match_id).run();
    scored++;
  }
  return { generated, scored };
}

function scoreSignal(sig: Signal | null, outcome: string): boolean | null {
  if (!sig || !sig.mismatch) return null;
  if (sig.homeSignal && sig.homeSignal !== 'neutral') {
    return sig.homeSignal === 'bullish' ? outcome === 'home_win' : outcome !== 'home_win';
  }
  if (sig.awaySignal && sig.awaySignal !== 'neutral') {
    return sig.awaySignal === 'bullish' ? outcome === 'away_win' : outcome !== 'away_win';
  }
  return null;
}

async function accuracy(env: Env): Promise<object> {
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM signals').first<{ c: number }>();
  const dir = await env.DB.prepare('SELECT signal_correct FROM signals WHERE signal_correct IS NOT NULL').all<any>();
  const rows = dir.results || [];
  const correct = rows.filter((r) => r.signal_correct).length;
  return { totalSignals: total?.c || 0, directional: rows.length, correct, incorrect: rows.length - correct, accuracy: rows.length ? Math.round((correct / rows.length) * 100) : null };
}

function parse(s: any): any { try { return typeof s === 'string' ? JSON.parse(s) : (s || null); } catch { return null; } }
