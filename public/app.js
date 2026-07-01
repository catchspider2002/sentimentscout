// SentimentScout dashboard.
const qs = (s) => document.querySelector(s);
const api = (p, o) => fetch(p, o).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status)); return d; });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (sig) => (sig === 'bullish' ? 'bull' : sig === 'bearish' ? 'bear' : 'neu');
const when = (t) => { try { return new Date(t < 1e12 ? t * 1000 : t).toLocaleString(); } catch { return ''; } };

init();
function init() {
  setupRun('Running…', 'Run now');
  refresh(); setInterval(refresh, 20000);
}
// "Run now" is an admin/demo affordance: hidden for normal visitors, revealed with ?admin=KEY
// (stored locally). The key is sent as X-Admin-Key; the gated /api/run-now rejects anything else.
function setupRun(busy, idle) {
  const btn = qs('#run'); if (!btn) return;
  const u = new URL(location.href);
  let key = u.searchParams.get('admin');
  if (key) { try { localStorage.setItem('admin_key', key); } catch {} history.replaceState(null, '', u.pathname); }
  if (!key) { try { key = localStorage.getItem('admin_key'); } catch {} }
  if (!key) { btn.style.display = 'none'; return; }
  btn.addEventListener('click', async () => {
    btn.textContent = busy;
    try { await api('/api/run-now', { method: 'POST', headers: { 'X-Admin-Key': key } }); }
    catch (e) { alert('Run failed: ' + (e.message || e)); }
    btn.textContent = idle; refresh();
  });
}

async function refresh() { await Promise.all([loadAccuracy(), loadCards()]); }

async function loadAccuracy() {
  try {
    const a = await api('/api/accuracy');
    qs('#a-total').textContent = a.totalSignals; qs('#a-dir').textContent = a.directional;
    qs('#a-correct').textContent = a.correct; qs('#a-acc').textContent = a.accuracy == null ? '-' : a.accuracy + '%';
  } catch {}
}

async function loadCards() {
  try {
    const { signals } = await api('/api/signals');
    const host = qs('#cards');
    if (!signals.length) return;
    host.innerHTML = signals.map((s) => {
      const sig = s.signal || {};
      const odds = s.odds || {};
      const factors = (sig.keyFactors || []).map((f) => `<li>${esc(f)}</li>`).join('');
      const outcome = s.correct == null ? (s.outcome ? `<div class="outcome muted">Result: ${s.outcome.replace('_', ' ')}</div>` : '')
        : `<div class="outcome ${s.correct ? 'ok' : 'no'}">${s.outcome.replace('_', ' ')} - signal ${s.correct ? 'correct ✓' : 'incorrect ✗'}</div>`;
      return `<div class="card"><div class="top"><span class="match">${esc(s.home)} vs ${esc(s.away)}</span><span class="when">${when(s.kickoff)}</span></div>` +
        `<div class="badges"><span class="badge ${cls(sig.homeSignal)}">${esc(s.home)}: ${sig.homeSignal || 'neutral'}</span>` +
        `<span class="badge ${cls(sig.awaySignal)}">${esc(s.away)}: ${sig.awaySignal || 'neutral'}</span>` +
        `<span class="badge conf">${sig.confidence || 'low'} confidence</span></div>` +
        (sig.mismatch ? `<div class="mismatch">⚠️ ${esc(sig.mismatchExplanation || 'Sentiment-odds gap detected')}</div>` : '') +
        `<div class="summary">${esc(sig.sentimentSummary || '')}</div>` +
        (factors ? `<ul class="factors">${factors}</ul>` : '') +
        `<div class="odds">Market: ${pct(odds.home)} / draw ${pct(odds.draw)} / ${pct(odds.away)} · ${s.sources} sources</div>` +
        outcome + `</div>`;
    }).join('');
  } catch {}
}
function pct(x) { return x == null ? '-' : (x * 100).toFixed(0) + '%'; }
