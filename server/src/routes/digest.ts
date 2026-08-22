import type { FastifyInstance } from 'fastify';
import {
  getDigestGenerationStatus,
  getOrGenerateDigest,
  listGeneratedDates,
  peekDigest,
  startDigestGeneration,
  DigestError,
} from '../services/digest.js';

function getUserId(req: any): string {
  return (req.user as any)?.userId ?? '';
}

function todayStr(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export async function digestRoutes(app: FastifyInstance) {
  // 仅读取已缓存日报；生成改由独立的异步接口发起，避免长连接超时。
  app.get<{ Querystring: { date?: string; force?: string; generate?: string } }>('/api/digest', async (req, reply) => {
    const date = req.query.date || todayStr();
    if (!validDate(date)) return reply.status(400).send({ error: 'date 格式应为 YYYY-MM-DD' });

    const force = req.query.force === 'true';
    const generate = force || req.query.generate === 'true';
    try {
      const digest = await getOrGenerateDigest(getUserId(req), date, force, generate);
      return digest;
    } catch (error) {
      if (error instanceof DigestError) {
        if (error.code === 'NOT_GENERATED') {
          const { articleCount } = peekDigest(getUserId(req), date);
          return reply.status(404).send({ error: error.message, code: error.code, articleCount });
        }
        const status = error.code === 'NO_API_KEY' ? 400 : error.code === 'NO_ARTICLES' ? 404 : 502;
        return reply.status(status).send({ error: error.message, code: error.code });
      }
      return reply.status(500).send({ error: '日报生成失败' });
    }
  });

  // POST /api/digest/generate — 启动后台生成，同一用户同一天只保留一个进行中的任务。
  app.post<{ Body: { date?: string; force?: boolean } }>('/api/digest/generate', async (req, reply) => {
    const date = req.body?.date || todayStr();
    if (!validDate(date)) return reply.status(400).send({ error: 'date 格式应为 YYYY-MM-DD' });

    const status = startDigestGeneration(getUserId(req), date, Boolean(req.body?.force));
    return reply.status(status.status === 'generating' ? 202 : 200).send(status);
  });

  // GET /api/digest/status?date=YYYY-MM-DD — 供前端轮询真实的服务端处理阶段。
  app.get<{ Querystring: { date?: string } }>('/api/digest/status', async (req, reply) => {
    const date = req.query.date || todayStr();
    if (!validDate(date)) return reply.status(400).send({ error: 'date 格式应为 YYYY-MM-DD' });
    return getDigestGenerationStatus(getUserId(req), date);
  });

  app.get<{ Querystring: { month?: string } }>('/api/digest/dates', async (req, reply) => {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.status(400).send({ error: 'month 格式应为 YYYY-MM' });
    }
    return { dates: listGeneratedDates(getUserId(req), month) };
  });
}
