import { sqlite } from '../db/index.js';
import { getSettings, callLLM, addTokensUsed, truncateWords } from './aiAnalyzer.js';

export interface DigestArticleRef {
  id: string;
  title: string;
  feedTitle: string;
  isRead: boolean;
}

export interface DigestItem {
  title: string;
  summary: string;
  articleIds: string[];
  articles: DigestArticleRef[];
}

export interface DigestCategory {
  name: string;
  items: DigestItem[];
}

export interface DigestResult {
  date: string;
  categories: DigestCategory[];
  articleCount: number;
  generatedAt: string;
}

export type DigestProgressStage = 'preparing' | 'generating' | 'parsing' | 'saving' | 'completed' | 'failed';

export interface DigestGenerationStatus {
  status: 'generating' | 'ready' | 'error' | 'idle';
  progress: number;
  stage: DigestProgressStage | null;
  result?: DigestResult;
  error?: { message: string; code?: DigestErrorCode };
}

interface StoredCategory {
  name: string;
  items: Array<{ title: string; summary: string; articleIds: string[] }>;
}

const MAX_ARTICLES = 120;
const PER_ARTICLE_WORDS_MAX = 150;
const PER_ARTICLE_WORDS_MIN = 40;
const TOTAL_WORDS_BUDGET = 6000;
const DIGEST_TIMEOUT_MS = 120_000;
const DIGEST_MAX_ATTEMPTS = 3;

interface ArticleRow {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  feed_title: string;
  ai_score: number | null;
}

interface DigestJob extends DigestGenerationStatus {
  updatedAt: number;
}

const digestJobs = new Map<string, DigestJob>();

function digestJobKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function getArticlesForDate(date: string): ArticleRow[] {
  const rows = sqlite
    .prepare(
      `SELECT a.id, a.title, a.summary, a.content, a.feed_id, f.title as feed_title, a.ai_score
       FROM articles a
       JOIN feeds f ON f.id = a.feed_id
       WHERE date(a.effective_date) = ?
       ORDER BY (a.ai_score IS NULL), a.ai_score DESC, a.effective_date DESC`
    )
    .all(date) as Array<ArticleRow & { feed_id: string }>;

  if (rows.length <= MAX_ARTICLES) return rows;

  const byFeed = new Map<string, ArticleRow[]>();
  for (const row of rows) {
    const bucket = byFeed.get(row.feed_id);
    if (bucket) bucket.push(row);
    else byFeed.set(row.feed_id, [row]);
  }

  const picked: ArticleRow[] = [];
  let round = 0;
  const buckets = [...byFeed.values()];
  while (picked.length < MAX_ARTICLES) {
    let addedInRound = 0;
    for (const bucket of buckets) {
      if (picked.length >= MAX_ARTICLES) break;
      if (round < bucket.length) {
        picked.push(bucket[round]);
        addedInRound++;
      }
    }
    if (addedInRound === 0) break;
    round++;
  }
  return picked;
}

function countArticlesForDate(date: string): number {
  const row = sqlite
    .prepare(`SELECT COUNT(*) as cnt FROM articles a WHERE date(a.effective_date) = ?`)
    .get(date) as { cnt: number };
  return row.cnt;
}

function buildPrompt(rows: ArticleRow[]): string {
  const perArticleWords = Math.max(
    PER_ARTICLE_WORDS_MIN,
    Math.min(PER_ARTICLE_WORDS_MAX, Math.round(TOTAL_WORDS_BUDGET / Math.max(1, rows.length)))
  );
  const list = rows
    .map((row, index) => {
      const text = truncateWords(row.summary || row.content || '', perArticleWords);
      return `[${index + 1}] (来源: ${row.feed_title})\n标题：${row.title}\n内容：${text}`;
    })
    .join('\n\n');

  return `你是一个新闻编辑助手。以下是今天抓取到的 ${rows.length} 篇 RSS 文章（已编号），请帮我生成一份「今日日报」：

要求：
1. 按主题/领域对文章进行分类（如：科技、财经、AI、产品设计、开源工具、社会热点等，类别名称请根据实际内容归纳，不要生搬硬套）。
2. 同一分类下，若多篇文章报道的是同一事件或高度相似的信息，请合并为一条，用一句话概括核心内容，并在 articleIds 中列出所有相关文章的编号。
3. 不相似的文章各自成条，用一句话概括核心内容（信息密度要高，不要空话套话）。
4. 每条摘要控制在 40 字以内。
5. 分类按重要程度/文章数量从多到少排序。
6. 只输出 JSON，不要输出任何其他文字、不要 markdown 代码块标记、不要思考过程。

JSON 格式：
{"categories":[{"name":"分类名","items":[{"title":"条目标题（8字以内）","summary":"一句话摘要","articleIds":[1,3]}]}]}

文章列表：
${list}`;
}

function parseDigestJson(content: string, rows: ArticleRow[]): StoredCategory[] {
  let jsonStr = content.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  // 部分兼容接口会在 JSON 前后附带说明文字，截取最外层对象后再解析。
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(jsonStr);
  if (!parsed || !Array.isArray(parsed.categories)) throw new Error('日报 JSON 格式不符合预期');

  const categories: StoredCategory[] = [];
  for (const category of parsed.categories) {
    if (!category || typeof category.name !== 'string' || !Array.isArray(category.items)) continue;
    const items: StoredCategory['items'] = [];
    for (const item of category.items) {
      if (!item || typeof item.title !== 'string' || typeof item.summary !== 'string') continue;
      const indices: number[] = Array.isArray(item.articleIds) ? item.articleIds : [];
      const articleIds = indices
        .map((index: number) => rows[index - 1]?.id)
        .filter((id: string | undefined): id is string => Boolean(id));
      if (articleIds.length > 0) {
        items.push({ title: item.title.slice(0, 30), summary: item.summary.slice(0, 100), articleIds });
      }
    }
    if (items.length > 0) categories.push({ name: category.name.slice(0, 20), items });
  }
  if (categories.length === 0) throw new Error('日报内容为空');
  return categories;
}

function hydrateCategories(stored: StoredCategory[]): DigestCategory[] {
  const allIds = [...new Set(stored.flatMap((category) => category.items.flatMap((item) => item.articleIds)))];
  if (allIds.length === 0) return [];
  const rows = sqlite
    .prepare(
      `SELECT a.id, a.title, a.is_read, f.title as feed_title
       FROM articles a JOIN feeds f ON f.id = a.feed_id
       WHERE a.id IN (${allIds.map(() => '?').join(',')})`
    )
    .all(...allIds) as Array<{ id: string; title: string; is_read: number; feed_title: string }>;
  const byId = new Map(rows.map((row) => [row.id, row]));

  const categories: DigestCategory[] = [];
  for (const category of stored) {
    const items: DigestItem[] = [];
    for (const item of category.items) {
      const articles = item.articleIds
        .map((id) => {
          const row = byId.get(id);
          return row ? { id: row.id, title: row.title, feedTitle: row.feed_title, isRead: Boolean(row.is_read) } : null;
        })
        .filter((article): article is DigestArticleRef => article !== null);
      if (articles.length > 0) items.push({ title: item.title, summary: item.summary, articleIds: articles.map((article) => article.id), articles });
    }
    if (items.length > 0) categories.push({ name: category.name, items });
  }
  return categories;
}

function getCachedDigest(userId: string, date: string): DigestResult | null {
  const row = sqlite
    .prepare('SELECT content, article_count, generated_at FROM daily_digests WHERE user_id = ? AND date = ?')
    .get(userId, date) as { content: string; article_count: number; generated_at: string } | undefined;
  if (!row) return null;
  try {
    return { date, categories: hydrateCategories(JSON.parse(row.content) as StoredCategory[]), articleCount: row.article_count, generatedAt: row.generated_at };
  } catch {
    return null;
  }
}

function saveDigest(userId: string, date: string, categories: StoredCategory[], articleCount: number): string {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO daily_digests (user_id, date, content, article_count, generated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, article_count = excluded.article_count, generated_at = excluded.generated_at`
    )
    .run(userId, date, JSON.stringify(categories), articleCount, now);
  return now;
}

export type DigestErrorCode = 'NO_ARTICLES' | 'NO_API_KEY' | 'LLM_ERROR' | 'NOT_GENERATED';

export class DigestError extends Error {
  constructor(message: string, public code: DigestErrorCode) {
    super(message);
  }
}

function isRetryableDigestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !/LLM API error: (400|401|403|404)/.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateDigest(
  userId: string,
  date: string,
  onProgress?: (progress: number, stage: DigestProgressStage) => void
): Promise<DigestResult> {
  onProgress?.(10, 'preparing');
  const rows = getArticlesForDate(date);
  if (rows.length === 0) throw new DigestError('当天没有抓取到文章', 'NO_ARTICLES');

  const cfg = getSettings(userId);
  const baseUrl = (cfg.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = cfg.aiApiKey || '';
  const model = cfg.aiModel || 'gpt-4o-mini';
  if (!apiKey) throw new DigestError('请先在设置页配置 AI API 密钥', 'NO_API_KEY');

  const prompt = buildPrompt(rows);
  let lastError: unknown;
  for (let attempt = 1; attempt <= DIGEST_MAX_ATTEMPTS; attempt++) {
    try {
      onProgress?.(25, 'generating');
      const { content, tokens } = await callLLM(baseUrl, apiKey, model, prompt, {
        temperature: 0.3,
        maxTokens: 8192,
        timeoutMs: DIGEST_TIMEOUT_MS,
      });
      addTokensUsed(tokens, userId);
      onProgress?.(85, 'parsing');
      const stored = parseDigestJson(content, rows);
      onProgress?.(95, 'saving');
      const generatedAt = saveDigest(userId, date, stored, rows.length);
      return { date, categories: hydrateCategories(stored), articleCount: rows.length, generatedAt };
    } catch (error) {
      lastError = error;
      if (attempt === DIGEST_MAX_ATTEMPTS || !isRetryableDigestError(error)) break;
      console.warn(`[Digest] attempt ${attempt} failed; retrying`, error);
      await delay(500 * 2 ** (attempt - 1));
    }
  }

  console.error('[Digest] generate error:', lastError);
  throw new DigestError('日报生成失败，请稍后重试', 'LLM_ERROR');
}

export function startDigestGeneration(userId: string, date: string, force = false): DigestGenerationStatus {
  const key = digestJobKey(userId, date);
  const running = digestJobs.get(key);
  if (running?.status === 'generating') return running;

  if (!force) {
    const cached = getCachedDigest(userId, date);
    if (cached) return { status: 'ready', progress: 100, stage: 'completed', result: cached };
  }

  const job: DigestJob = { status: 'generating', progress: 0, stage: 'preparing', updatedAt: Date.now() };
  digestJobs.set(key, job);
  generateDigest(userId, date, (progress, stage) => {
    Object.assign(job, { progress, stage, updatedAt: Date.now() });
  })
    .then((result) => Object.assign(job, { status: 'ready' as const, progress: 100, stage: 'completed' as const, result, updatedAt: Date.now() }))
    .catch((error) => {
      const digestError = error instanceof DigestError ? error : new DigestError('日报生成失败，请稍后重试', 'LLM_ERROR');
      Object.assign(job, {
        status: 'error' as const,
        stage: 'failed' as const,
        error: { message: digestError.message, code: digestError.code },
        updatedAt: Date.now(),
      });
    });
  return job;
}

export function getDigestGenerationStatus(userId: string, date: string): DigestGenerationStatus {
  const job = digestJobs.get(digestJobKey(userId, date));
  if (!job) return { status: 'idle', progress: 0, stage: null };
  return job;
}

export function peekDigest(userId: string, date: string): { cached: DigestResult | null; articleCount: number } {
  const cached = getCachedDigest(userId, date);
  return { cached, articleCount: cached ? cached.articleCount : countArticlesForDate(date) };
}

export function listGeneratedDates(userId: string, month: string): string[] {
  const rows = sqlite
    .prepare('SELECT date FROM daily_digests WHERE user_id = ? AND date LIKE ? ORDER BY date')
    .all(userId, `${month}-%`) as Array<{ date: string }>;
  return rows.map((row) => row.date);
}

export async function getOrGenerateDigest(userId: string, date: string, force = false, generate = true): Promise<DigestResult> {
  if (!force) {
    const cached = getCachedDigest(userId, date);
    if (cached) return cached;
  }
  if (!generate) throw new DigestError('日报尚未生成', 'NOT_GENERATED');
  return generateDigest(userId, date);
}
