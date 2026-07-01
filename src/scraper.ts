// SentimentScout - sentiment collection (server-side, no CORS issues).
// News via Google News RSS with per-team + Bing fallbacks; Reddit JSON best-effort
// (Reddit often blocks datacenter IPs, so it's a bonus, not the primary source).
// Twitter is intentionally skipped (API friction).

export interface Sentiment { newsHeadlines: string[]; redditPosts: string[]; sources: number; }

// A browser-like UA - the previous "SentimentScout/1.0" was frequently rejected.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function collect(home: string, away: string): Promise<Sentiment> {
  const [news, reddit] = await Promise.all([fetchNews(home, away), fetchReddit(home, away)]);
  const newsHeadlines = uniq(news).slice(0, 12);
  const redditPosts = uniq(reddit).slice(0, 20);
  return { newsHeadlines, redditPosts, sources: newsHeadlines.length + redditPosts.length };
}

// Try the specific match, then each team, then Bing - so a card rarely comes back empty.
async function fetchNews(home: string, away: string): Promise<string[]> {
  const queries = [`${home} ${away} World Cup`, `${home} World Cup`, `${away} World Cup`];
  for (const q of queries) {
    const items = await googleNews(q);
    if (items.length) return items;
  }
  return bingNews(`${home} ${away} World Cup`);
}

async function googleNews(q: string): Promise<string[]> {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
      { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) return [];
    return titlesFromRss(await res.text());
  } catch { return []; }
}

async function bingNews(q: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`,
      { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    return titlesFromRss(await res.text());
  } catch { return []; }
}

async function fetchReddit(home: string, away: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(`${home} ${away}`)}&sort=new&limit=20`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const kids = data?.data?.children || [];
    return kids.map((k: any) => String(k?.data?.title || '')).filter(Boolean).slice(0, 20);
  } catch { return []; }
}

function titlesFromRss(xml: string): string[] {
  const items: string[] = [];
  const re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && items.length < 12) {
    const t = decode(m[1]).trim();
    if (t && !/^google news$/i.test(t)) items.push(t);
  }
  return items;
}

function uniq(a: string[]): string[] {
  return [...new Set(a.map((s) => s.trim()).filter(Boolean))];
}

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '');
}
