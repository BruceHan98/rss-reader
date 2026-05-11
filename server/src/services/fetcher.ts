import Parser from 'rss-parser';
import { load } from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../db/index.js';
import { feeds, articles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Feed } from '../db/schema.js';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': BROWSER_UA },
  customFields: {
    item: [['content:encoded', 'contentEncoded'], ['description', 'description']],
  },
});

async function fetchFullContent(url: string): Promise<string> {
  const attempt = async () => {
    const res = await fetch(url, {
      headers: { ['User-Agent']: BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const $ = load(html);
    $('script, style, nav, header, footer, .sidebar, .ad, .share, .related, .comment').remove();
    const selectors = ['article .entry-content', '.entry-content', '.post-content', '.article-content', '.article', 'article', '.content', 'main'];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 200) return el.html() || '';
    }
    return '';
  };
  try {
    return await attempt();
  } catch {
    await new Promise(r => setTimeout(r, 1000));
    try { return await attempt(); } catch { return ''; }
  }
}

export async function fetchFeed(feed: Feed): Promise<{ count: number; error?: string }> {
  try {
    const parsed = await parser.parseURL(feed.url);
    let count = 0;

    for (const item of parsed.items || []) {
      const guid = item.guid || item.link || item.title || '';
      if (!guid) continue;

      const existing = sqlite
        .prepare('SELECT id FROM articles WHERE feed_id = ? AND guid = ?')
        .get(feed.id, guid);
      if (existing) continue;

      let content = (item as any).contentEncoded || item.content || item.description || '';
      const summary = item.contentSnippet || item.summary || '';

      const plainTextLen = content.replace(/<[^>]+>/g, '').trim().length;
      if (plainTextLen < 200 && item.link) {
        const fullContent = await fetchFullContent(item.link);
        if (fullContent) content = fullContent;
      }

      await db.insert(articles).values({
        id: uuidv4(),
        feedId: feed.id,
        guid,
        title: item.title || '(无标题)',
        summary: summary.slice(0, 500),
        content,
        author: (item as any).creator || (item as any).author || '',
        url: item.link || '',
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        isRead: false,
        isStarred: false,
        isReadLater: false,
        createdAt: new Date().toISOString(),
      });
      count++;
    }

    await db
      .update(feeds)
      .set({ lastFetchedAt: new Date().toISOString(), errorCount: 0 })
      .where(eq(feeds.id, feed.id));

    return { count };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    await db
      .update(feeds)
      .set({ errorCount: (feed.errorCount || 0) + 1 })
      .where(eq(feeds.id, feed.id));
    console.error(`[Fetcher] Failed to fetch ${feed.url}: ${errorMsg}`);
    return { count: 0, error: errorMsg };
  }
}

export async function fetchAllFeeds(): Promise<void> {
  const allFeeds = await db.select().from(feeds);
  const now = Date.now();

  for (const feed of allFeeds) {
    const intervalMs = (feed.fetchInterval || 60) * 60 * 1000;
    const lastFetched = feed.lastFetchedAt ? new Date(feed.lastFetchedAt).getTime() : 0;
    if (now - lastFetched >= intervalMs) {
      await fetchFeed(feed);
    }
  }
}
