import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { feeds, groups, articles } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { fetchFeed, isPublicUrl } from '../services/fetcher.js';

export async function feedRoutes(app: FastifyInstance) {
  // GET /api/feeds - 获取所有订阅源（含分组信息 + 未读数）
  app.get('/api/feeds', async () => {
    const allFeeds = await db
      .select({
        id: feeds.id,
        title: feeds.title,
        url: feeds.url,
        siteUrl: feeds.siteUrl,
        favicon: feeds.favicon,
        groupId: feeds.groupId,
        lastFetchedAt: feeds.lastFetchedAt,
        fetchInterval: feeds.fetchInterval,
        errorCount: feeds.errorCount,
        createdAt: feeds.createdAt,
        unreadCount: sql<number>`(SELECT COUNT(*) FROM articles WHERE feed_id = ${feeds.id} AND is_read = 0)`,
      })
      .from(feeds);
    return allFeeds;
  });

  // POST /api/feeds - 添加订阅源
  app.post<{
    Body: { url: string; title?: string; groupId?: string; fetchInterval?: number };
  }>('/api/feeds', async (req, reply) => {
    const { url, title, groupId, fetchInterval = 60 } = req.body;
    if (!url) return reply.status(400).send({ error: 'URL 不能为空' });
    if (!isPublicUrl(url)) return reply.status(400).send({ error: "不支持的 URL：仅允许公网地址" });

    // 检查是否已存在
    const existing = await db.select().from(feeds).where(eq(feeds.url, url));
    if (existing.length) return reply.status(409).send({ error: '订阅源已存在' });

    const id = uuidv4();
    await db.insert(feeds).values({
      id,
      title: title || url,
      url,
      groupId: groupId || null,
      fetchInterval,
      errorCount: 0,
      createdAt: new Date().toISOString(),
    });

    const feed = await db.select().from(feeds).where(eq(feeds.id, id)).then((r) => r[0]);
    // 立即抓取一次，等待完成以便获取 feed 标题
    await fetchFeed(feed).catch(() => {});
    // 重新查询，返回包含从 RSS 自动获取的标题
    const updatedFeed = await db.select().from(feeds).where(eq(feeds.id, id)).then((r) => r[0]);
    return reply.status(201).send(updatedFeed);
  });

  // PUT /api/feeds/:id
  app.put<{
    Params: { id: string };
    Body: { title?: string; groupId?: string | null; fetchInterval?: number };
  }>('/api/feeds/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = await db.select().from(feeds).where(eq(feeds.id, id));
    if (!existing.length) return reply.status(404).send({ error: '订阅源不存在' });
    const updates: Partial<typeof feeds.$inferInsert> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.groupId !== undefined) updates.groupId = req.body.groupId;
    if (req.body.fetchInterval !== undefined) updates.fetchInterval = req.body.fetchInterval;
    await db.update(feeds).set(updates).where(eq(feeds.id, id));
    const updated = await db.select().from(feeds).where(eq(feeds.id, id));
    return updated[0];
  });

  // DELETE /api/feeds/:id
  app.delete<{ Params: { id: string } }>('/api/feeds/:id', async (req, reply) => {
    await db.delete(feeds).where(eq(feeds.id, req.params.id));
    return reply.status(204).send();
  });

  // POST /api/feeds/refresh-all - 刷新所有订阅源
  app.post('/api/feeds/refresh-all', async () => {
    const allFeeds = await db.select().from(feeds);
    const results = await Promise.allSettled(allFeeds.map((feed) => fetchFeed(feed)));
    const newArticles = results.reduce((sum, r) => {
      return sum + (r.status === 'fulfilled' ? r.value.count : 0);
    }, 0);
    return { newArticles, total: allFeeds.length };
  });

  // POST /api/feeds/:id/refresh - 手动刷新
  app.post<{ Params: { id: string } }>('/api/feeds/:id/refresh', async (req, reply) => {
    const feed = await db.select().from(feeds).where(eq(feeds.id, req.params.id)).then((r) => r[0]);
    if (!feed) return reply.status(404).send({ error: '订阅源不存在' });
    const result = await fetchFeed(feed);
    return { newArticles: result.count, error: result.error };
  });
}
