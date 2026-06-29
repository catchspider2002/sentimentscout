// SentimentScout — sentiment collection (server-side, no CORS issues).
// Google News RSS (no key) + Reddit JSON. Twitter is intentionally skipped (API friction).

export interface Sentiment { newsHeadlines: string[]; redditPosts: string[]; sources: number; }

export async function collect(home: string, away: string): Promise<Sentiment> {
  const [news, reddit] = await Promise.all([fetchNews(home, away), fetchReddit(home, away)]);
  return { newsHeadlines: news, redditPosts: reddit, sources: news.length + reddit.length };
}

async function fetchNews(home: string, away: string): Promise<string[]> {
  try {
    const q = encodeURIComponent(`${home} ${away} World Cup 2026`);
    const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { headers: { 'User-Agent': 'SentimentScout/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: string[] = [];
    const re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && items.length < 10) items.push(decode(m[1]).trim());
    return items;
  } catch { return []; }
}

async function fetchReddit(home: string, away: string): Promise<string[]> {
  try {
    const q = encodeURIComponent(`${home} ${away}`);
    const res = await fetch(`https://www.reddit.com/search.json?q=${q}&sort=new&limit=20`, { headers: { 'User-Agent': 'SentimentScout/1.0' } });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const kids = data?.data?.children || [];
    return kids.map((k: any) => String(k?.data?.title || '')).filter(Boolean).slice(0, 20);
  } catch { return []; }
}

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '');
}
