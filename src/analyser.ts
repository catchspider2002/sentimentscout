// SentimentScout - Claude analysis: compare public sentiment to opening odds → signal card.
import { Implied } from './txline';
import { Sentiment } from './scraper';

const SYSTEM = `You are a sports betting analyst. Your job is to compare pre-match public sentiment with opening market odds to identify potential mismatches - cases where the crowd is significantly more or less confident than the market.

You will be given opening odds (with implied probabilities) and a collection of news headlines and Reddit posts about the match.

Your output must be a JSON object with exactly this structure:
{
  "homeSignal": "bullish" | "bearish" | "neutral",
  "awaySignal": "bullish" | "bearish" | "neutral",
  "sentimentSummary": "2-3 sentence summary of what the public sentiment says",
  "oddsContext": "1-2 sentence description of what the market is pricing in",
  "mismatch": true | false,
  "mismatchExplanation": "1-2 sentences explaining the gap, or null if no mismatch",
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "confidence": "low" | "medium" | "high"
}

Definitions:
- bullish: public sentiment is more positive on this team than the odds imply.
- bearish: public sentiment is more negative on this team than the odds imply.
- neutral: sentiment roughly matches the odds.
- mismatch: true if sentiment and odds diverge meaningfully.
- confidence: "low" when fewer than 5 sentiment sources are available.

Output only valid JSON, no markdown, no text outside the JSON object.`;

export interface Signal {
  homeSignal: string; awaySignal: string; sentimentSummary: string; oddsContext: string;
  mismatch: boolean; mismatchExplanation: string | null; keyFactors: string[]; confidence: string;
}

export async function analyse(apiKey: string | undefined, home: string, away: string, odds: Implied, sentiment: Sentiment): Promise<Signal> {
  const fallback: Signal = {
    homeSignal: 'neutral', awaySignal: 'neutral',
    sentimentSummary: sentiment.sources ? `${sentiment.sources} sources found; coverage summarised without AI analysis.` : 'No sentiment sources found for this match.',
    oddsContext: `Market: ${home} ${(odds.home * 100).toFixed(0)}% / Draw ${(odds.draw * 100).toFixed(0)}% / ${away} ${(odds.away * 100).toFixed(0)}%.`,
    mismatch: false, mismatchExplanation: null, keyFactors: [], confidence: sentiment.sources < 5 ? 'low' : 'medium',
  };
  if (!apiKey) return fallback;
  const user = { match: { home, away }, odds, sentiment: { newsHeadlines: sentiment.newsHeadlines, redditPosts: sentiment.redditPosts } };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(user) }] }),
      });
      if (!res.ok) continue;
      const data = await res.json() as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text?.trim() || '';
      const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as Signal;
      if (sentiment.sources < 5) parsed.confidence = 'low';
      return parsed;
    } catch { /* retry once */ }
  }
  return fallback;
}
