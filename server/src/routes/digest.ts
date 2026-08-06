import type { FastifyInstance } from 'fastify';
import { getOrGenerateDigest, peekDigest, listGeneratedDates, DigestError } from '../services/digest.js';

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
  // GET /api/digest?date=YYYY-MM-DD&generate=true&force=true — 获取（或生成）指定日期的日报，默认今天
  // 默认仅读取缓存，不触发 LLM 生成（避免 token 浪费）；需显式传 generate=true 才会在无缓存时生成
  // force=true 则跳过缓存强制重新生成（隐含 generate=true）
  app.get<{ Querystring: { date?: string; force?: string; generate?: string } }>('/api/digest', async (req, reply) => {
    const date = req.query.date || todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.status(400).send({ error: 'date 格式应为 YYYY-MM-DD' });
    }
    const force = req.query.force === 'true';
    const generate = force || req.query.generate === 'true';
    try {
      const digest = await getOrGenerateDigest(getUserId(req), date, force, generate);
      return digest;
    } catch (err) {
      if (err instanceof DigestError) {
        if (err.code === 'NOT_GENERATED') {
          // 尚未生成：附带当天文章数，供前端展示确认提示
          const { articleCount } = peekDigest(getUserId(req), date);
          return reply.status(404).send({ error: err.message, code: err.code, articleCount });
        }
        const status = err.code === 'NO_API_KEY' ? 400 : err.code === 'NO_ARTICLES' ? 404 : 502;
        return reply.status(status).send({ error: err.message, code: err.code });
      }
      return reply.status(500).send({ error: '日报生成失败' });
    }
  });

  // GET /api/digest/dates?month=YYYY-MM — 查询该月已生成日报的日期列表，供日历标记
  app.get<{ Querystring: { month?: string } }>('/api/digest/dates', async (req, reply) => {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.status(400).send({ error: 'month 格式应为 YYYY-MM' });
    }
    const dates = listGeneratedDates(getUserId(req), month);
    return { dates };
  });
}
