import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';

function toArticle(row: any) {
  return {
    id: row.id,
    feedId: row.feed_id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    publishedAt: row.published_at,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isReadLater: Boolean(row.is_read_later),
    feed_title: row.feed_title,
    feed_favicon: row.feed_favicon,
  };
}

export async function searchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { q: string; from?: string; to?: string; feedId?: string; isRead?: string };
  }>('/api/search', async (req, reply) => {
    const { q, from, to, feedId, isRead } = req.query;
    if (!q || q.trim().length < 1) return reply.status(400).send({ error: '搜索关键词不能为空' });

    const keyword = `%${q.trim()}%`;
    let where = '(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)';
    const params: any[] = [keyword, keyword, keyword];

    if (from) { where += ' AND a.published_at >= ?'; params.push(from); }
    if (to) { where += ' AND a.published_at <= ?'; params.push(to); }
    if (feedId) { where += ' AND a.feed_id = ?'; params.push(feedId); }
    if (isRead !== undefined) { where += ' AND a.is_read = ?'; params.push(isRead === 'true' ? 1 : 0); }

    const rows = sqlite
      .prepare(
        `SELECT a.id, a.title, a.summary, a.url, a.published_at, a.is_read, a.is_starred, a.is_read_later,
                a.feed_id, f.title as feed_title, f.favicon as feed_favicon
         FROM articles a JOIN feeds f ON f.id = a.feed_id
         WHERE ${where}
         ORDER BY a.published_at DESC
         LIMIT 100`
      )
      .all(...params);

    return { results: rows.map(toArticle), total: rows.length };
  });
}
