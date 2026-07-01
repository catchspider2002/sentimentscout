// SentimentScout - TxLINE client: auth + fixtures + opening odds + result.
const BASE = 'https://txline.txodds.com';
export interface TxEnv { DB: D1Database; TXLINE_API_KEY?: string }

async function mGet(env: TxEnv, k: string) { const r = await env.DB.prepare('SELECT value FROM kv WHERE key=?').bind(k).first<{ value: string }>(); return r?.value ?? null; }
async function mSet(env: TxEnv, k: string, v: string) { await env.DB.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').bind(k, v).run(); }
async function getJwt(env: TxEnv, force = false): Promise<string> {
  if (!force) { const v = await mGet(env, 'jwt'); const at = await mGet(env, 'jwt_at'); if (v && at && Date.now() - Number(at) < 25 * 864e5) return v; }
  const r = await fetch(`${BASE}/auth/guest/start`, { method: 'POST' });
  if (!r.ok) throw new Error('guest start ' + r.status);
  const token = (await r.json() as { token: string }).token;
  await mSet(env, 'jwt', token); await mSet(env, 'jwt_at', String(Date.now())); return token;
}
async function authedGet(env: TxEnv, path: string): Promise<Response> {
  if (!env.TXLINE_API_KEY) throw new Error('TXLINE_API_KEY not set');
  let jwt = await getJwt(env);
  const h = () => ({ Authorization: `Bearer ${jwt}`, 'X-Api-Token': env.TXLINE_API_KEY! });
  let res = await fetch(BASE + path, { headers: h() });
  if (res.status === 401) { jwt = await getJwt(env, true); res = await fetch(BASE + path, { headers: h() }); }
  return res;
}

export interface TxFixture { fixtureId: number; competition: string; startTime: number; home: string; away: string; }

// Keep ONLY the senior men's FIFA World Cup 2026 - excludes qualifiers, youth (U-17/U-20),
// women's, Club World Cup, beach/futsal/esports, and any other edition/year.
function isMainWorldCup(name: string): boolean {
  const s = (name || '').toLowerCase();
  if (!/world cup/.test(s)) return false;
  if (/qualif|wom(e|a)n|u-?\d{1,2}|under[\s-]?\d{1,2}|youth|club|beach|futsal|esoccer|e-?sports|e[\s-]?world/.test(s)) return false;
  const year = s.match(/\b(19|20)\d{2}\b/);
  if (year && year[0] !== '2026') return false;
  return true;
}

export async function listFixtures(env: TxEnv): Promise<TxFixture[]> {
  const res = await authedGet(env, '/api/fixtures/snapshot');
  if (!res.ok) throw new Error('fixtures ' + res.status);
  const arr = await res.json() as any[];
  return arr.map((f) => { const p1 = !!f.Participant1IsHome; return { fixtureId: f.FixtureId, competition: f.Competition, startTime: f.StartTime, home: p1 ? f.Participant1 : f.Participant2, away: p1 ? f.Participant2 : f.Participant1 }; })
    .filter((f) => isMainWorldCup(f.competition || ''));
}

export interface Implied { home: number; draw: number; away: number }
export async function getOdds(env: TxEnv, fixtureId: string | number): Promise<Implied | null> {
  const res = await authedGet(env, `/api/odds/snapshot/${fixtureId}`);
  if (!res.ok) return null;
  const arr = await res.json() as any[];
  if (!Array.isArray(arr)) return null;
  const cands = arr.filter((o) => Array.isArray(o.PriceNames) && o.PriceNames.length === 3 && Array.isArray(o.Pct));
  const pick = cands.find((o) => /stable/i.test(o.Bookmaker || '') || /stable/i.test(o.SuperOddsType || '')) || cands[0];
  if (!pick) return null;
  const pct = (pick.Pct as string[]).map((x) => (x === 'NA' ? NaN : Number(x)));
  if (pct.some((x) => !Number.isFinite(x))) return null;
  const names = (pick.PriceNames as string[]).map((s) => String(s).toLowerCase());
  const hi = idx(names, ['1', 'home'], 0), di = idx(names, ['x', 'draw'], 1), ai = idx(names, ['2', 'away'], 2);
  const s = pct[hi] + pct[di] + pct[ai];
  return { home: round(pct[hi] / s), draw: round(pct[di] / s), away: round(pct[ai] / s) };
}
function idx(n: string[], keys: string[], fb: number) { const i = n.findIndex((x) => keys.some((k) => x === k || x.includes(k))); return i >= 0 ? i : fb; }

export async function getOutcome(env: TxEnv, fixtureId: string | number): Promise<{ finished: boolean; outcome: 'home_win' | 'draw' | 'away_win' | null }> {
  const res = await authedGet(env, `/api/scores/snapshot/${fixtureId}`);
  if (!res.ok) return { finished: false, outcome: null };
  const arr = await res.json() as any[];
  if (!Array.isArray(arr) || arr.length === 0) return { finished: false, outcome: null };
  const phase = phaseFromActions(arr);
  const rec = latestStatRec(arr); const sm = statMap(rec); const sc = rec?.ScoreSoccer ?? rec?.scoreSoccer;
  const g1 = sm.get(1) ?? num(sc?.Participant1?.Total?.Goals), g2 = sm.get(2) ?? num(sc?.Participant2?.Total?.Goals);
  const p1Home = (rec?.Participant1IsHome ?? rec?.participant1IsHome) !== false;
  const hg = p1Home ? g1 : g2, ag = p1Home ? g2 : g1;
  const finished = new Set(['F', 'FET', 'FPE']).has(phase);
  return { finished, outcome: finished ? (hg > ag ? 'home_win' : ag > hg ? 'away_win' : 'draw') : null };
}
// TxLINE soccer game-phase encoding (numeric id → code). Docs: scores/soccer-feed.
function phaseFromActions(arr: any[]): string {
  let hasKick = false, htSeq = -1, finalised = false;
  for (const r of arr) {
    const a = String(r?.Action || '');
    const s = seqOf(r);
    if (a === 'kickoff' || a === 'kickoff_team') hasKick = true;
    if (a === 'halftime_finalised' && s > htSeq) htSeq = s;
    if (a === 'game_finalised') finalised = true;
  }
  if (finalised) return 'F';
  if (htSeq >= 0) {
    for (const r of arr) if (String(r?.Action || '') === 'kickoff' && seqOf(r) > htSeq) return 'H2';
    return 'HT';
  }
  return hasKick ? 'H1' : 'NS';
}
function seqOf(u: any): number { return num(u?.Seq ?? u?.seq ?? u?.Timestamp ?? u?.timestamp ?? u?.Ts ?? u?.ts); }
function hasStats(u: any): boolean { const s = u?.Stats ?? u?.stats; return !!s && typeof s === 'object' && (s['1'] != null || s['2'] != null); }
function latestStatRec(arr: any[]): any {
  let best: any = null;
  for (const r of arr) if (hasStats(r) && (!best || seqOf(r) > seqOf(best))) best = r;
  return best ?? (arr.length ? arr.reduce((a, b) => (seqOf(b) > seqOf(a) ? b : a)) : {});
}
function statMap(u: any): Map<number, number> {
  const m = new Map<number, number>();
  const s = u?.Stats ?? u?.stats;
  if (Array.isArray(s)) { for (const it of s) { const k = Number(it?.Key ?? it?.key ?? it?.[0]); if (Number.isFinite(k)) m.set(k, num(it?.Value ?? it?.value ?? it?.[1])); } }
  else if (s && typeof s === 'object') { for (const k of Object.keys(s)) { const kn = Number(k); if (Number.isFinite(kn)) m.set(kn, num((s as any)[k])); } }
  return m;
}
const num = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const round = (x: number) => Math.round(x * 1000) / 1000;
