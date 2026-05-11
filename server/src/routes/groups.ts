import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { groups, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function groupRoutes(app: FastifyInstance) {
  app.get('/api/feeds/groups', async () => {
    return db.select().from(groups).orderBy(groups.sortOrder);
  });

  app.post<{ Body: { name: string; sortOrder?: number } }>('/api/feeds/groups', async (req, reply) => {
    const { name, sortOrder = 0 } = req.body;
    if (!name) return reply.status(400).send({ error: '分组名称不能为空' });
    const id = uuidv4();
    await db.insert(groups).values({ id, name, sortOrder });
    return db.select().from(groups).where(eq(groups.id, id)).then((r) => r[0]);
  });

  app.put<{ Params: { id: string }; Body: { name?: string; sortOrder?: number } }>(
    '/api/feeds/groups/:id',
    async (req, reply) => {
      const { id } = req.params;
      const existing = await db.select().from(groups).where(eq(groups.id, id));
      if (!existing.length) return reply.status(404).send({ error: '分组不存在' });
      const updates: Partial<typeof groups.$inferInsert> = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
      await db.update(groups).set(updates).where(eq(groups.id, id));
      const updated = await db.select().from(groups).where(eq(groups.id, id));
      return updated[0];
    }
  );

  app.delete<{ Params: { id: string } }>('/api/feeds/groups/:id', async (req, reply) => {
    const { id } = req.params;
    // 将该分组下的 feed 移到未分组
    await db.update(feeds).set({ groupId: null }).where(eq(feeds.groupId, id));
    await db.delete(groups).where(eq(groups.id, id));
    return reply.status(204).send();
  });
}
