import type { FastifyInstance } from 'fastify';
import { db, sqlite } from '../db/index.js';
import { articles } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// sqlite.prepare 返回 snake_case 字段，统一转成 camelCase 给前端
function toArticle(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    feedId: row.feed_id,
    guid: row.guid,
    title: row.title,
    summary: row.summary,
    content: row.content,
    author: row.author,
    url: row.url,
    publishedAt: row.published_at,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isReadLater: Boolean(row.is_read_later),
    aiScore: row.ai_score ?? null,
    aiTags: row.ai_tags ? (row.ai_tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : null,
    createdAt: row.created_at,
    feed_title: row.feed_title,
    feed_favicon: row.feed_favicon,
  };
}

export async function articleRoutes(app: FastifyInstance) {
  // GET /api/articles - 文章列表（分页 + 筛选）
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      feedId?: string;
      groupId?: string;
      isRead?: string;
      isStarred?: string;
      isReadLater?: string;
      minScore?: string;
      tags?: string;
    };
  }>('/api/articles', async (req) => {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '30'));
    const offset = (page - 1) * limit;

    let where = '1=1';
    const params: any[] = [];

    if (req.query.feedId) {
      where += ' AND a.feed_id = ?';
      params.push(req.query.feedId);
    }
    if (req.query.groupId) {
      where += ' AND f.group_id = ?';
      params.push(req.query.groupId);
    }
    if (req.query.isRead !== undefined) {
      where += ' AND a.is_read = ?';
      params.push(req.query.isRead === 'true' ? 1 : 0);
    }
    if (req.query.isStarred === 'true') {
      where += ' AND a.is_starred = 1';
    }
    if (req.query.isReadLater === 'true') {
      where += ' AND a.is_read_later = 1';
    }
    if (req.query.minScore !== undefined) {
      const ms = parseInt(req.query.minScore);
      if (!isNaN(ms) && ms > 0) {
        where += ' AND a.ai_score >= ?';
        params.push(ms);
      }
    }
    if (req.query.tags) {
      const tagList = req.query.tags.split(',').map((t) => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        where += " AND (',' || a.ai_tags || ',') LIKE ?";
        params.push(`%,${tag},%`);
      }
    }

    const rows = sqlite
      .prepare(
        `SELECT a.*, f.title as feed_title, f.favicon as feed_favicon
         FROM articles a
         JOIN feeds f ON f.id = a.feed_id
         WHERE ${where}
         ORDER BY a.effective_date DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const total = (
      sqlite
        .prepare(
          `SELECT COUNT(*) as cnt FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE ${where}`
        )
        .get(...params) as any
    ).cnt;

    return { articles: rows.map(toArticle), total, page, limit };
  });

  // GET /api/articles/:id
  app.get<{ Params: { id: string } }>('/api/articles/:id', async (req, reply) => {
    const row = sqlite
      .prepare(
        `SELECT a.*, f.title as feed_title, f.favicon as feed_favicon
         FROM articles a JOIN feeds f ON f.id = a.feed_id
         WHERE a.id = ?`
      )
      .get(req.params.id);
    if (!row) return reply.status(404).send({ error: '文章不存在' });
    return toArticle(row);
  });

  // PUT /api/articles/:id/read
  app.put<{ Params: { id: string }; Body: { isRead?: boolean } }>(
    '/api/articles/:id/read',
    async (req) => {
      const isRead = req.body?.isRead !== false;
      const readAt = isRead ? new Date().toISOString() : null;
      await db.update(articles).set({ isRead, readAt }).where(eq(articles.id, req.params.id));
      return { success: true };
    }
  );

  // PUT /api/articles/:id/star
  app.put<{ Params: { id: string } }>('/api/articles/:id/star', async (req, reply) => {
    const row = sqlite.prepare('SELECT is_starred FROM articles WHERE id = ?').get(req.params.id) as any;
    if (!row) return reply.status(404).send({ error: '文章不存在' });
    const newVal = !Boolean(row.is_starred);
    await db.update(articles).set({ isStarred: newVal }).where(eq(articles.id, req.params.id));
    return { isStarred: newVal };
  });

  // PUT /api/articles/:id/read-later
  app.put<{ Params: { id: string } }>('/api/articles/:id/read-later', async (req, reply) => {
    const row = sqlite.prepare('SELECT is_read_later FROM articles WHERE id = ?').get(req.params.id) as any;
    if (!row) return reply.status(404).send({ error: '文章不存在' });
    const newVal = !Boolean(row.is_read_later);
    await db.update(articles).set({ isReadLater: newVal }).where(eq(articles.id, req.params.id));
    return { isReadLater: newVal };
  });

  // GET /api/stats/reading - 按天统计实际阅读文章数（近 6 个月）
  app.get('/api/stats/reading', async () => {
    const rows = sqlite
      .prepare(
        `SELECT date(read_at) as day, COUNT(*) as count
         FROM articles
         WHERE is_read = 1
           AND read_at IS NOT NULL
           AND read_at >= date('now', '-6 months')
         GROUP BY day
         ORDER BY day ASC`
      )
      .all() as Array<{ day: string; count: number }>;
    return { stats: rows };
  });

  // POST /api/articles/mark-all-read
  app.post<{ Body: { feedId?: string; groupId?: string } }>('/api/articles/mark-all-read', async (req) => {
    const now = new Date().toISOString();
    if (req.body?.feedId) {
      sqlite.prepare('UPDATE articles SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE feed_id = ? AND is_read = 0').run(now, req.body.feedId);
    } else if (req.body?.groupId) {
      const feedIds = sqlite
        .prepare('SELECT id FROM feeds WHERE group_id = ?')
        .all(req.body.groupId)
        .map((r: any) => r.id);
      if (feedIds.length) {
        sqlite
          .prepare(`UPDATE articles SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE feed_id IN (${feedIds.map(() => '?').join(',')}) AND is_read = 0`)
          .run(now, ...feedIds);
      }
    } else {
      sqlite.prepare('UPDATE articles SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE is_read = 0').run(now);
    }
    return { success: true };
  });
}
