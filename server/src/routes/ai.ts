import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import {
  startAnalyzeJob,
  getStatus,
  cancelJob,
  getTags,
  findRunningByType,
  type JobType,
} from '../services/aiAnalyzer.js';
import { sqlite } from '../db/index.js';

function getUserId(req: any): string {
  return (req.user as any)?.userId ?? '';
}

function getSettings(userId: string): Record<string, string> {
  const rows = sqlite
    .prepare('SELECT key, value FROM settings WHERE user_id = ?')
    .all(userId) as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export async function aiRoutes(app: FastifyInstance) {
  // POST /api/ai/analyze — 启动异步 AI 分析任务
  app.post<{ Body: { type: JobType; feedId?: string; groupId?: string } }>('/api/ai/analyze', async (req, reply) => {
    const { type, feedId, groupId } = req.body;
    if (!type || !['score', 'tags', 'all'].includes(type)) {
      return reply.status(400).send({ error: 'type 必须为 score / tags / all' });
    }

    const cfg = getSettings(getUserId(req));
    if (!cfg.aiApiKey) {
      return reply.status(400).send({ error: '请先在设置页配置 AI API 密钥' });
    }

    // 检查同类型任务是否已在运行
    const types: Array<'score' | 'tags'> = type === 'all' ? ['score', 'tags'] : [type];
    for (const t of types) {
      const running = findRunningByType(t);
      if (running) {
        return reply.status(409).send({ error: `${t} 任务正在执行中`, jobId: running.jobId });
      }
    }

    const jobId = randomUUID();
    startAnalyzeJob(jobId, type, feedId, groupId, getUserId(req));
    return { jobId };
  });

  // GET /api/ai/status — 获取当前任务状态
  app.get('/api/ai/status', async () => {
    return getStatus();
  });

  // DELETE /api/ai/analyze/:jobId — 终止任务
  app.delete<{ Params: { jobId: string } }>('/api/ai/analyze/:jobId', async (req, reply) => {
    const result = cancelJob(req.params.jobId);
    if (!result.cancelled) {
      return reply.status(404).send({ error: '任务不存在或已完成' });
    }
    return result;
  });

  // GET /api/ai/tags — 获取全量标签列表
  app.get('/api/ai/tags', async () => {
    return { tags: getTags() };
  });

  // POST /api/ai/test — 连通性测试
  app.post('/api/ai/test', async (req, reply) => {
    const cfg = getSettings(getUserId(req));
    const baseUrl = cfg.aiBaseUrl || 'https://api.openai.com/v1';
    const apiKey = cfg.aiApiKey || '';
    const model = cfg.aiModel || 'gpt-4o-mini';

    if (!apiKey) {
      return reply.status(400).send({ ok: false, error: '请先配置 AI API 密钥' });
    }

    try {
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'reply with the word "ok"' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, any>;
        const msg = body?.error?.message || res.statusText;
        return reply.status(200).send({ ok: false, error: `HTTP ${res.status}: ${msg}` });
      }

      return { ok: true };
    } catch (err: any) {
      return reply.status(200).send({ ok: false, error: err.message || '连接失败' });
    }
  });
}
