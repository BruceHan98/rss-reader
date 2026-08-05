import type { FastifyInstance } from 'fastify';
import { getOrGenerateDigest, DigestError } from '../services/digest.js';

function getUserId(req: any): string {
  return (req.user as any)?.userId ?? '';
}

function todayStr(): string {
  // 服务器本地时区的今天日期（与 effective_date 存储的本地时间字符串对齐）
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function digestRoutes(app: FastifyInstance) {
  // GET /api/digest?date=YYYY-MM-DD&force=true — 获取（或生成）指定日期的日报，默认今天
  app.get<{ Querystring: { date?: string; force?: string } }>('/api/digest', async (req, reply) => {
    const date = req.query.date || todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: 'date 格式应为 YYYY-MM-DD' });
    }
    const force = req.query.force === 'true';
    try {
      const digest = await getOrGenerateDigest(getUserId(req), date, force);
      return digest;
    } catch (err) {
      if (err instanceof DigestError) {
        const status = err.code === 'NO_API_KEY' ? 400 : err.code === 'NO_ARTICLES' ? 404 : 502;
        return reply.status(status).send({ error: err.message, code: err.code });
      }
      return reply.status(500).send({ error: '日报生成失败' });
    }
  });
}
