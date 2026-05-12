import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { feeds, groups } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { parseOpml, buildOpml } from '../utils/opml.js';
import { fetchFeed } from '../services/fetcher.js';

export async function opmlRoutes(app: FastifyInstance) {
  // POST /api/opml/import
  app.post('/api/opml/import', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: '请上传 OPML 文件' });

    // 校验文件类型
    const filename = data.filename || "";
    const mimetype = data.mimetype || "";
    if (!mimetype.includes("xml") && !filename.toLowerCase().endsWith(".opml") && !filename.toLowerCase().endsWith(".xml")) {
      return reply.status(400).send({ error: "请上传有效的 OPML/XML 文件" });
    }
    const buf = await data.toBuffer();
    // 限制文件内容大小（multipart 已限 10MB，此处再加 2MB 软限制）
    if (buf.length > 2 * 1024 * 1024) {
      return reply.status(400).send({ error: "OPML 文件过大，请上传 2MB 以内的文件" });
    }
    const xml = buf.toString('utf-8');
    const parsed = await parseOpml(xml);

    const results = { imported: 0, skipped: 0, items: parsed.length };
    const groupCache: Record<string, string> = {};

    for (const item of parsed) {
      // 创建/查找分组
      let groupId: string | null = null;
      if (item.group) {
        if (groupCache[item.group]) {
          groupId = groupCache[item.group];
        } else {
          const existing = await db.select().from(groups).where(eq(groups.name, item.group));
          if (existing.length) {
            groupId = existing[0].id;
          } else {
            groupId = uuidv4();
            await db.insert(groups).values({ id: groupId, name: item.group, sortOrder: 0 });
          }
          groupCache[item.group] = groupId;
        }
      }

      // 添加 feed
      const existingFeed = await db.select().from(feeds).where(eq(feeds.url, item.xmlUrl));
      if (existingFeed.length) {
        results.skipped++;
        continue;
      }

      const id = uuidv4();
      await db.insert(feeds).values({
        id,
        title: item.title,
        url: item.xmlUrl,
        siteUrl: item.htmlUrl || null,
        groupId,
        fetchInterval: 60,
        errorCount: 0,
        createdAt: new Date().toISOString(),
      });

      const feed = await db.select().from(feeds).where(eq(feeds.id, id)).then((r) => r[0]);
      fetchFeed(feed).catch(() => {});
      results.imported++;
    }

    return results;
  });

  // GET /api/opml/export
  app.get('/api/opml/export', async (_, reply) => {
    const allFeeds = await db
      .select({
        title: feeds.title,
        url: feeds.url,
        siteUrl: feeds.siteUrl,
        groupId: feeds.groupId,
        groupName: groups.name,
      })
      .from(feeds)
      .leftJoin(groups, eq(feeds.groupId, groups.id));

    const xml = buildOpml(
      allFeeds.map((f) => ({
        title: f.title,
        url: f.url,
        siteUrl: f.siteUrl,
        groupName: f.groupName,
      }))
    );

    reply.header('Content-Type', 'application/xml');
    reply.header('Content-Disposition', 'attachment; filename="subscriptions.opml"');
    return reply.send(xml);
  });
}
