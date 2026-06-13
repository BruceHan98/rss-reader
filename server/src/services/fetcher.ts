import Parser from 'rss-parser';
import { load } from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../db/index.js';
import { feeds, articles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Feed } from '../db/schema.js';

/** 读取 admin 用户的保留天数设置，返回截止时间字符串（ISO），0 表示不限制 */
function getRetentionCutoff(): string | null {
  const row = sqlite
    .prepare("SELECT value FROM settings WHERE key = 'retentionDays' AND user_id = (SELECT id FROM users WHERE username = 'admin')")
    .get() as any;
  const days = parseInt(row?.value ?? '30');
  if (!days || days <= 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': BROWSER_UA },
  customFields: {
    item: [['content:encoded', 'contentEncoded'], ['description', 'description']],
  },
});
/**
 * 将 HTML 内容里带有效期签名的图片 URL（如字节跳动 CDN）预下载为 base64 DataURL，
 * 避免签名过期后图片永久无法加载。
 * 仅处理已知的签名 CDN 域名，其他图片直接保留原 URL。
 * 单张图片超过 500KB 时跳过（保留原 URL），避免数据库体积膨胀。
 */
const SIGNED_IMG_PATTERN = /\bx-expires=\d+/;
const MAX_INLINE_IMG_BYTES = 500 * 1024; // 500KB

async function inlineSignedImages(html: string): Promise<string> {
  // 找出所有 <img src="..."> 中带签名的 URL
  const imgSrcRe = /<img([^>]*)\bsrc="([^"]+)"([^>]*)>/gi;
  const tasks: Array<{ full: string; url: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = imgSrcRe.exec(html)) !== null) {
    const url = m[2];
    if (SIGNED_IMG_PATTERN.test(url)) {
      tasks.push({ full: m[0], url });
    }
  }
  if (tasks.length === 0) return html;

  // 并发下载，限制 5 个并行
  const CONCURRENCY = 5;
  const replacements = new Map<string, string>();
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(
      tasks.slice(i, i + CONCURRENCY).map(async ({ full, url }) => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          if (buf.byteLength > MAX_INLINE_IMG_BYTES) return; // 超大图跳过
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          const base64 = Buffer.from(buf).toString('base64');
          const dataUrl = `data:${contentType};base64,${base64}`;
          // 替换 src 为 dataUrl，移除 referrerpolicy（内联图片不需要）
          const replaced = full
            .replace(/\bsrc="[^"]*"/, `src="${dataUrl}"`)
            .replace(/\s*referrerpolicy="[^"]*"/, '');
          replacements.set(full, replaced);
        } catch {
          // 下载失败时保留原 URL
        }
      })
    );
  }

  let result = html;
  for (const [original, replaced] of replacements) {
    result = result.split(original).join(replaced);
  }
  return result;
}

/** 校验 URL 是否为公网地址，防止 SSRF 攻击 */
export function isPublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const h = u.hostname;
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(h)) return false;
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return false;
    return true;
  } catch {
    return false;
  }
}


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

    // 每次拉取都同步 title / siteUrl / favicon
    const feedTitle = parsed.title?.trim();
    // parsed.link 有时指向 feed 自身（如 /feed、/rss、/atom 等路径），
    // 这种情况应取 origin 作为网站主页，而非 feed 地址
    const rawLink = parsed.link?.trim() || '';
    let siteUrl = '';
    if (rawLink) {
      try {
        const linkUrl = new URL(rawLink);
        const feedPath = linkUrl.pathname.toLowerCase().replace(/\/$/, '');
        const isFeedPath = /\/(feed|rss|atom|feed\.xml|rss\.xml|atom\.xml)$/.test(feedPath);
        siteUrl = isFeedPath ? linkUrl.origin : rawLink;
      } catch {
        siteUrl = rawLink;
      }
    }
    const metaUpdates: Record<string, string | null> = {};
    if (feedTitle && feed.title === feed.url) metaUpdates.title = feedTitle;
    if (siteUrl && !feed.siteUrl) metaUpdates.siteUrl = siteUrl;
    // 只在 favicon 未存储时尝试探测，避免每次拉取都发请求
    if (!feed.favicon && siteUrl) {
      const faviconUrl = `${new URL(siteUrl).origin}/favicon.ico`;
      const ok = await fetch(faviconUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) metaUpdates.favicon = faviconUrl;
    }
    if (Object.keys(metaUpdates).length) {
      await db.update(feeds).set(metaUpdates).where(eq(feeds.id, feed.id));
    }

    const cutoff = getRetentionCutoff();

    for (const item of parsed.items || []) {
      const guid = item.guid || item.link || item.title || '';
      if (!guid) continue;

      // 跳过超出保留期的旧条目，避免清理后被重新拉取入库
      if (cutoff) {
        const pubDate = item.isoDate || item.pubDate;
        if (pubDate && pubDate < cutoff) continue;
      }

      const existing = sqlite
        .prepare('SELECT id FROM articles WHERE feed_id = ? AND guid = ?')
        .get(feed.id, guid);
      if (existing) continue;

      // 二次去重：部分 RSS 源（如掘金）同一篇文章每次 guid 不同，但 url 相同
      // 用 url 兜底去重，防止同一文章以不同 guid 重复入库
      const articleUrl = item.link || '';
      if (articleUrl) {
        const existingByUrl = sqlite
          .prepare('SELECT id FROM articles WHERE feed_id = ? AND url = ?')
          .get(feed.id, articleUrl);
        if (existingByUrl) continue;
      }

      // 三次去重：跨订阅源同标题去重，防止不同来源转载同一篇文章重复入库
      // 仅对有标题的文章做去重，且只在最近 7 天内查找（避免误判同名不同文章）
      const articleTitle = item.title?.trim() || '';
      if (articleTitle) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const existingByTitle = sqlite
          .prepare('SELECT id FROM articles WHERE title = ? AND published_at > ?')
          .get(articleTitle, sevenDaysAgo);
        if (existingByTitle) continue;
      }

      let content = (item as any).contentEncoded || item.content || item.description || '';
      const summary = item.contentSnippet || item.summary || '';

      const plainTextLen = content.replace(/<[^>]+>/g, '').trim().length;
      if (plainTextLen < 200 && item.link && isPublicUrl(item.link)) {
        const fullContent = await fetchFullContent(item.link);
        if (fullContent) content = fullContent;
      }

      // 将带签名的图片 URL 预下载为 base64，避免签名过期后图片永久失效
      content = await inlineSignedImages(content);

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

  const dueFeeds = allFeeds.filter((feed) => {
    const intervalMs = (feed.fetchInterval || 60) * 60 * 1000;
    const lastFetched = feed.lastFetchedAt ? new Date(feed.lastFetchedAt).getTime() : 0;
    return now - lastFetched >= intervalMs;
  });

  // 并发拉取，最多 5 个同时进行
  const CONCURRENCY = 5;
  for (let i = 0; i < dueFeeds.length; i += CONCURRENCY) {
    await Promise.all(dueFeeds.slice(i, i + CONCURRENCY).map((feed) => fetchFeed(feed)));
  }
}
