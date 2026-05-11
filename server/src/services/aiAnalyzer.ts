import { sqlite } from '../db/index.js';

export type JobType = 'score' | 'tags' | 'all';

interface JobState {
  jobId: string;
  type: JobType;
  status: 'running' | 'idle';
  total: number;
  processed: number;
  currentTitle: string;
  cancelled: boolean;
}

// 内存中维护两个独立任务状态（score 和 tags 各一个）
const jobs = new Map<string, JobState>();

// 按 type 找当前运行中的 job
export function findRunningByType(type: 'score' | 'tags'): JobState | undefined {
  for (const job of jobs.values()) {
    if (job.status === 'running' && (job.type === type || job.type === 'all')) {
      return job;
    }
  }
  return undefined;
}

export function getStatus() {
  let scoreJob: JobState | undefined;
  let tagsJob: JobState | undefined;
  for (const job of jobs.values()) {
    if (job.status === 'running') {
      if (job.type === 'score') scoreJob = job;
      else if (job.type === 'tags') tagsJob = job;
      else if (job.type === 'all') { scoreJob = job; tagsJob = job; }
    }
  }
  const idle = { status: 'idle', jobId: null, total: 0, processed: 0, currentTitle: '' };
  return {
    score: scoreJob
      ? { status: 'running', jobId: scoreJob.jobId, total: scoreJob.total, processed: scoreJob.processed, currentTitle: scoreJob.currentTitle }
      : idle,
    tags: tagsJob
      ? { status: 'running', jobId: tagsJob.jobId, total: tagsJob.total, processed: tagsJob.processed, currentTitle: tagsJob.currentTitle }
      : idle,
  };
}

export function cancelJob(jobId: string): { cancelled: boolean; processed: number } {
  const job = jobs.get(jobId);
  if (!job) return { cancelled: false, processed: 0 };
  job.cancelled = true;
  return { cancelled: true, processed: job.processed };
}

function getSettings(userId?: string): Record<string, string> {
  // 优先使用传入的 userId，否则降级使用 admin 用户配置
  const uid = userId || (() => {
    const row = sqlite.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
    return row?.id ?? '';
  })();
  const rows = sqlite
    .prepare('SELECT key, value FROM settings WHERE user_id = ?')
    .all(uid) as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

/** 取文本前 N 词（英文按空白分词，中文每字一词），避免超长内容消耗过多 token */
function truncateWords(text: string, maxWords = 1000): string {
  // 将中文字符逐字拆分，英文/数字保持整词
  const tokens: string[] = [];
  // 用正则将连续非中文片段和中文字符分别提取
  for (const chunk of text.matchAll(/[\u4e00-\u9fff\u3000-\u303f]|[^\u4e00-\u9fff\u3000-\u303f]+/g)) {
    const c = chunk[0];
    if (/[\u4e00-\u9fff]/.test(c)) {
      // 单个中文字
      tokens.push(c);
    } else {
      // 英文/数字/标点片段，按空白进一步分词
      const words = c.split(/\s+/).filter(Boolean);
      tokens.push(...words);
    }
    if (tokens.length >= maxWords) break;
  }
  return tokens.slice(0, maxWords).join(' ');
}

async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ content: string; tokens: number }> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`LLM API error: ${res.status}`);
  const data = await res.json() as any;
  let content = data.choices?.[0]?.message?.content ?? '';
  // 过滤 thinking 模型的 <think>...</think> 标签，保留最终答案
  // 如果有完整的闭合标签，去掉整个 think 块
  if (/<\/think>/i.test(content)) {
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } else if (/<think>/i.test(content)) {
    // think 标签被截断（max_tokens 不足），取 </think> 不存在时的降级处理：
    // 丢弃整个 <think> 开头的内容（因为答案根本没输出出来）
    content = '';
  }
  const tokens = data.usage?.total_tokens ?? 0;
  return { content, tokens };
}

function addTokensUsed(delta: number, userId: string): void {
  if (delta <= 0) return;
  // 用 SQL 原子自增，避免并发时的读写竞态
  sqlite
    .prepare(
      `INSERT INTO settings (user_id, key, value) VALUES (?, 'aiTokensUsed', ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT)`
    )
    .run(userId, String(delta), delta);
}

async function scoreArticle(
  baseUrl: string, apiKey: string, model: string,
  title: string, text: string, userId: string
): Promise<number | null> {
  const prompt = `请对以下文章内容进行质量评分，输出0到10的整数（0=极低质量，10=极高质量）。
评分维度：内容深度、信息密度、原创性、可读性、广告/垃圾内容占比。
只输出一个整数，不要输出任何其他文字，不要思考，直接输出结果。

标题：${title}
内容：${text}`;

  try {
    const { content, tokens } = await callLLM(baseUrl, apiKey, model, prompt);
    addTokensUsed(tokens, userId);
    const n = parseInt(content.trim());
    if (isNaN(n) || n < 0 || n > 10) return null;
    return n;
  } catch (err) {
    console.error("[AI][score] error:", err);
    return null;
  }
}

async function tagsArticle(
  baseUrl: string, apiKey: string, model: string,
  title: string, text: string, userId: string
): Promise<string[] | null> {
  const prompt = `请为以下文章提取最多3个语义标签，标签要简短精准（2-6个字）。
只输出标签，用英文逗号分隔，不要输出任何其他文字，不要思考，直接输出结果。例如：AI,开源工具,前端开发

标题：${title}
内容：${text}`;

  try {
    const { content, tokens } = await callLLM(baseUrl, apiKey, model, prompt);
    addTokensUsed(tokens, userId);
    const tags = content.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 20)
      .slice(0, 3);
    if (tags.length === 0) return null;
    return tags;
  } catch (err) {
    console.error("[AI][tags] error:", err);
    return null;
  }
}

export function startAnalyzeJob(
  jobId: string,
  type: JobType,
  feedId?: string,
  groupId?: string,
  userId?: string
): void {
  // 后台异步执行，不 await
  runJob(jobId, type, feedId, groupId, userId).catch((err) => {
    console.error('[AI] Job error:', err);
    const job = jobs.get(jobId);
    if (job) job.status = 'idle';
  });
}

async function runJob(jobId: string, type: JobType, feedId?: string, groupId?: string, userId?: string): Promise<void> {
  const cfg = getSettings(userId);
  const baseUrl = (cfg.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = cfg.aiApiKey || '';
  const model = cfg.aiModel || 'gpt-4o-mini';
  // 解析实际 userId（getSettings 可能回落到 admin）
  const effectiveUserId = userId || (() => {
    const row = sqlite.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
    return row?.id ?? '';
  })();

  // 查出待处理文章
  const needScore = type === 'score' || type === 'all';
  const needTags = type === 'tags' || type === 'all';

  let whereClause = needScore && needTags
    ? '(a.ai_score IS NULL OR a.ai_tags IS NULL)'
    : needScore
    ? 'a.ai_score IS NULL'
    : 'a.ai_tags IS NULL';

  // 只处理未读文章
  whereClause += ' AND a.is_read = 0';

  const params: string[] = [];
  if (feedId) {
    whereClause += ' AND a.feed_id = ?';
    params.push(feedId);
  } else if (groupId) {
    whereClause += ' AND a.feed_id IN (SELECT id FROM feeds WHERE group_id = ?)';
    params.push(groupId);
  }

  const rows = sqlite
    .prepare(
      `SELECT a.id, a.title, a.summary, a.content, a.ai_score, a.ai_tags
       FROM articles a
       WHERE ${whereClause}
       ORDER BY a.published_at DESC`
    )
    .all(...params) as Array<{
      id: string;
      title: string;
      summary: string | null;
      content: string | null;
      ai_score: number | null;
      ai_tags: string | null;
    }>;

  const CONCURRENCY = 5;

  const job: JobState = {
    jobId,
    type,
    status: 'running',
    total: rows.length,
    processed: 0,
    currentTitle: '',
    cancelled: false,
  };
  jobs.set(jobId, job);

  // 并发处理：每次最多同时发起 CONCURRENCY 个 LLM 请求
  async function processRow(row: typeof rows[number]): Promise<void> {
    if (job.cancelled) return;

    job.currentTitle = row.title;
    const rawText = (row.summary || '') + '\n' + (row.content || '');
    const text = truncateWords(rawText, 300);

    const updates: Record<string, any> = {};

    if (needScore && row.ai_score === null) {
      const score = await scoreArticle(baseUrl, apiKey, model, row.title, text, effectiveUserId);
      if (score !== null) updates.ai_score = score;
    }

    if (!job.cancelled && needTags && row.ai_tags === null) {
      const tags = await tagsArticle(baseUrl, apiKey, model, row.title, text, effectiveUserId);
      if (tags !== null) updates.ai_tags = tags.join(',');
    }

    if (Object.keys(updates).length > 0) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      sqlite
        .prepare(`UPDATE articles SET ${sets} WHERE id = ?`)
        .run(...Object.values(updates), row.id);
    }

    job.processed += 1;
  }

  // 用滑动窗口控制并发数
  const queue = [...rows];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0 && !job.cancelled) {
      const row = queue.shift()!;
      await processRow(row);
    }
  });
  await Promise.all(workers);

  job.status = 'idle';
  job.currentTitle = '';

  // 保留最近 20 个已完成任务供查询，超过则清理最老的
  const doneJobs = [...jobs.entries()].filter(([, j]) => j.status === 'idle');
  if (doneJobs.length > 20) {
    jobs.delete(doneJobs[0][0]);
  }
}

export function getTags(): Array<{ tag: string; count: number }> {
  const rows = sqlite.prepare('SELECT ai_tags FROM articles WHERE ai_tags IS NOT NULL').all() as Array<{ ai_tags: string }>;
  const counter = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.ai_tags.split(',')) {
      const t = tag.trim();
      if (t) counter.set(t, (counter.get(t) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
