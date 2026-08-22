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

export type DigestProgressStage = 'preparing' | 'classifying' | 'merging' | 'saving' | 'completed' | 'failed';

export interface DigestGenerationStatus {
  status: 'generating' | 'ready' | 'error' | 'idle';
  progress: number;
  stage: DigestProgressStage | null;
  processed?: number;
  total?: number;
  result?: DigestResult;
  error?: { message: string; code?: DigestErrorCode };
}

interface StoredCategory {
  name: string;
  items: Array<{ title: string; summary: string; articleIds: string[] }>;
}

interface ArticleRow {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  feed_title: string;
}

interface DigestJob extends DigestGenerationStatus {
  updatedAt: number;
}

const LIGHTWEIGHT_BATCH_SIZE = 80;
const TITLE_MAX_WORDS = 50;
const SUMMARY_MAX_WORDS = 24;
// 单次轻量分类不应长时间阻塞整份日报；超时后由重试/拆批接管。
const DIGEST_TIMEOUT_MS = 45_000;
const DIGEST_MAX_ATTEMPTS = 3;
const DIGEST_PARSE_ATTEMPTS = 2;
const DIGEST_MAX_BATCH_SPLITS = 3;
const digestJobs = new Map<string, DigestJob>();

function digestJobKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function getArticlesForDate(date: string): ArticleRow[] {
  return sqlite
    .prepare(
      `SELECT a.id, a.title, a.summary, a.content, f.title as feed_title
       FROM articles a
       JOIN feeds f ON f.id = a.feed_id
       WHERE date(a.effective_date) = ?
       ORDER BY a.effective_date DESC`
    )
    .all(date) as ArticleRow[];
}

function countArticlesForDate(date: string): number {
  const row = sqlite.prepare('SELECT COUNT(*) as cnt FROM articles WHERE date(effective_date) = ?').get(date) as { cnt: number };
  return row.cnt;
}

function cleanJson(content: string): unknown {
  let json = content.trim();
  const codeBlock = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlock) json = codeBlock[1].trim();
  const firstBrace = json.indexOf('{');
  const lastBrace = json.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) json = json.slice(firstBrace, lastBrace + 1);
  return JSON.parse(json);
}

function parseCategories(content: string, references: string[][]): StoredCategory[] {
  const parsed = cleanJson(content) as { categories?: unknown };
  if (!Array.isArray(parsed?.categories)) throw new Error('日报 JSON 格式不符合预期');

  const categories: StoredCategory[] = [];
  for (const category of parsed.categories) {
    if (!category || typeof category !== 'object') continue;
    const candidate = category as { name?: unknown; summary?: unknown; articleIds?: unknown; items?: unknown };
    if (typeof candidate.name !== 'string') continue;

    // 轻量分类阶段每个主题仅生成一条汇总；同时兼容旧格式 items，方便切换时读取。
    const sourceItems = Array.isArray(candidate.items) ? candidate.items : [candidate];
    const items: StoredCategory['items'] = [];
    for (const sourceItem of sourceItems) {
      if (!sourceItem || typeof sourceItem !== 'object') continue;
      const item = sourceItem as { title?: unknown; summary?: unknown; articleIds?: unknown };
      const indexes = Array.isArray(item.articleIds) ? item.articleIds : [];
      const articleIds = indexes
        .flatMap((index) => typeof index === 'number' ? references[index - 1] ?? [] : [])
        .filter((id, index, all) => all.indexOf(id) === index);
      if (articleIds.length === 0) continue;
      const title = typeof item.title === 'string' ? item.title : candidate.name;
      const summary = typeof item.summary === 'string' ? item.summary : candidate.summary;
      items.push({ title: title.slice(0, 30), summary: (typeof summary === 'string' ? summary : '').slice(0, 100), articleIds });
    }
    if (items.length > 0) categories.push({ name: candidate.name.slice(0, 20), items });
  }
  if (categories.length === 0) throw new Error('日报内容为空');

  // 即使模型遗漏个别编号，也保留其在日报中的可访问入口，避免大量文章被静默丢弃。
  const includedIds = new Set(categories.flatMap((category) => category.items.flatMap((item) => item.articleIds)));
  const missingIds = [...new Set(references.flat())].filter((id) => !includedIds.has(id));
  if (missingIds.length > 0) {
    categories.push({
      name: '其他',
      items: [{ title: '其他资讯', summary: '未归入主要主题的文章', articleIds: missingIds }],
    });
  }
  return categories;
}

function buildClassificationPrompt(rows: ArticleRow[]): string {
  const articles = rows.map((row, index) => {
    const excerpt = truncateWords(row.summary || row.content || '', SUMMARY_MAX_WORDS);
    return `[${index + 1}] 来源：${truncateWords(row.feed_title, 12)}｜标题：${truncateWords(row.title, TITLE_MAX_WORDS)}${excerpt ? `｜摘要：${excerpt}` : ''}`;
  }).join('\n');

  return `你负责轻量新闻主题分类。根据标题和极短摘要归类即可，不要深入解读、不要逐篇摘要。
将同主题或同一事件的文章放到同一个分类中。每个分类只写一条不超过30字的概览，必须覆盖所有文章编号。
只输出 JSON，不要 markdown 或其他文字。
格式：
{"categories":[{"name":"分类名","summary":"该分类的简短概览","articleIds":[1,2,3]}]}

文章：
${articles}`;
}

function flattenCategories(categories: StoredCategory[]): Array<{ name: string; title: string; summary: string; articleIds: string[] }> {
  return categories.flatMap((category) => category.items.map((item) => ({ ...item, name: category.name })));
}

function buildMergePrompt(items: Array<{ name: string; title: string; summary: string; articleIds: string[] }>): string {
  const groups = items.map((item, index) => `[${index + 1}] 分类：${item.name}｜概览：${item.summary || item.title}｜含 ${item.articleIds.length} 篇`).join('\n');
  return `你负责合并多批新闻分类结果。将语义相近的分类合并为少量清晰主题；不需要深度分析或逐篇总结。
每个输出分类只保留一条不超过40字的概览，articleIds 必须列出所有归入该分类的输入编号，不能遗漏。
只输出 JSON，不要 markdown 或其他文字。
格式：
{"categories":[{"name":"分类名","summary":"该分类的简短概览","articleIds":[1,2,3]}]}

待合并分类：
${groups}`;
}

function hydrateCategories(stored: StoredCategory[]): DigestCategory[] {
  const allIds = [...new Set(stored.flatMap((category) => category.items.flatMap((item) => item.articleIds)))];
  if (allIds.length === 0) return [];
  const rows = sqlite
    .prepare(`SELECT a.id, a.title, a.is_read, f.title as feed_title FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE a.id IN (${allIds.map(() => '?').join(',')})`)
    .all(...allIds) as Array<{ id: string; title: string; is_read: number; feed_title: string }>;
  const byId = new Map(rows.map((row) => [row.id, row]));

  return stored.flatMap((category) => {
    const items = category.items.flatMap((item) => {
      const articles = item.articleIds
        .map((id) => {
          const row = byId.get(id);
          return row ? { id: row.id, title: row.title, feedTitle: row.feed_title, isRead: Boolean(row.is_read) } : null;
        })
        .filter((article): article is DigestArticleRef => article !== null);
      return articles.length > 0 ? [{ title: item.title, summary: item.summary, articleIds: articles.map((article) => article.id), articles }] : [];
    });
    return items.length > 0 ? [{ name: category.name, items }] : [];
  });
}

function getCachedDigest(userId: string, date: string): DigestResult | null {
  const row = sqlite.prepare('SELECT content, article_count, generated_at FROM daily_digests WHERE user_id = ? AND date = ?')
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
  sqlite.prepare(
    `INSERT INTO daily_digests (user_id, date, content, article_count, generated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, article_count = excluded.article_count, generated_at = excluded.generated_at`
  ).run(userId, date, JSON.stringify(categories), articleCount, now);
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

async function callDigestLlm(baseUrl: string, apiKey: string, model: string, prompt: string, userId: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DIGEST_MAX_ATTEMPTS; attempt++) {
    try {
      // 部分推理模型会先输出较长的思考内容；保留足够输出预算，避免 JSON 在 think 块中被截断。
      const { content, tokens } = await callLLM(baseUrl, apiKey, model, prompt, { temperature: 0.2, maxTokens: 4096, timeoutMs: DIGEST_TIMEOUT_MS });
      addTokensUsed(tokens, userId);
      return content;
    } catch (error) {
      lastError = error;
      if (attempt === DIGEST_MAX_ATTEMPTS || !isRetryableDigestError(error)) break;
      console.warn(`[Digest] request attempt ${attempt} failed; retrying`, error);
      await delay(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function requestCategories(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  references: string[][],
  userId: string
): Promise<StoredCategory[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DIGEST_PARSE_ATTEMPTS; attempt++) {
    try {
      return parseCategories(await callDigestLlm(baseUrl, apiKey, model, prompt, userId), references);
    } catch (error) {
      lastError = error;
      if (attempt < DIGEST_PARSE_ATTEMPTS) {
        console.warn(`[Digest] invalid model output on attempt ${attempt}; retrying`, error);
        await delay(500 * attempt);
      }
    }
  }
  throw lastError;
}

async function classifyBatch(
  rows: ArticleRow[],
  baseUrl: string,
  apiKey: string,
  model: string,
  userId: string,
  splitDepth = 0
): Promise<StoredCategory[]> {
  try {
    return await requestCategories(baseUrl, apiKey, model, buildClassificationPrompt(rows), rows.map((row) => [row.id]), userId);
  } catch (error) {
    // 单个批次的格式失败不应让整份日报失败；缩小上下文后再试。
    if (rows.length <= 1 || splitDepth >= DIGEST_MAX_BATCH_SPLITS) throw error;
    const middle = Math.ceil(rows.length / 2);
    // 顺序重试，避免格式异常后瞬间放大为并发请求，触发服务商限流。
    const first = await classifyBatch(rows.slice(0, middle), baseUrl, apiKey, model, userId, splitDepth + 1);
    const second = await classifyBatch(rows.slice(middle), baseUrl, apiKey, model, userId, splitDepth + 1);
    return [...first, ...second];
  }
}

function mergeCategoriesLocally(categories: StoredCategory[]): StoredCategory[] {
  const byName = new Map<string, StoredCategory>();
  for (const category of categories) {
    const existing = byName.get(category.name);
    if (existing) existing.items.push(...category.items);
    else byName.set(category.name, { name: category.name, items: [...category.items] });
  }
  return [...byName.values()];
}

async function generateDigest(
  userId: string,
  date: string,
  onProgress?: (progress: number, stage: DigestProgressStage, processed?: number, total?: number) => void
): Promise<DigestResult> {
  onProgress?.(5, 'preparing');
  const rows = getArticlesForDate(date);
  if (rows.length === 0) throw new DigestError('当天没有抓取到文章', 'NO_ARTICLES');

  const cfg = getSettings(userId);
  const baseUrl = (cfg.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = cfg.aiApiKey || '';
  const model = cfg.aiModel || 'gpt-4o-mini';
  if (!apiKey) throw new DigestError('请先在设置页配置 AI API 密钥', 'NO_API_KEY');

  try {
    const batchCategories: StoredCategory[] = [];
    for (let start = 0; start < rows.length; start += LIGHTWEIGHT_BATCH_SIZE) {
      const batch = rows.slice(start, start + LIGHTWEIGHT_BATCH_SIZE);
      onProgress?.(10 + Math.round((start / rows.length) * 65), 'classifying', start, rows.length);
      batchCategories.push(...await classifyBatch(batch, baseUrl, apiKey, model, userId));
      onProgress?.(10 + Math.round((Math.min(start + batch.length, rows.length) / rows.length) * 65), 'classifying', Math.min(start + batch.length, rows.length), rows.length);
    }

    const intermediate = flattenCategories(batchCategories);
    onProgress?.(80, 'merging', intermediate.length, intermediate.length);
    let stored: StoredCategory[];
    try {
      stored = await requestCategories(baseUrl, apiKey, model, buildMergePrompt(intermediate), intermediate.map((item) => item.articleIds), userId);
    } catch (error) {
      // 全局合并失败时保留已经成功的批次分类，确保用户仍可查看全部文章。
      console.warn('[Digest] global merge failed; using batch categories', error);
      stored = mergeCategoriesLocally(batchCategories);
    }

    onProgress?.(95, 'saving');
    const generatedAt = saveDigest(userId, date, stored, rows.length);
    return { date, categories: hydrateCategories(stored), articleCount: rows.length, generatedAt };
  } catch (error) {
    console.error('[Digest] generate error:', error);
    throw new DigestError('日报生成失败，请稍后重试', 'LLM_ERROR');
  }
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
  generateDigest(userId, date, (progress, stage, processed, total) => {
    Object.assign(job, { progress, stage, processed, total, updatedAt: Date.now() });
  })
    .then((result) => Object.assign(job, { status: 'ready' as const, progress: 100, stage: 'completed' as const, result, updatedAt: Date.now() }))
    .catch((error) => {
      const digestError = error instanceof DigestError ? error : new DigestError('日报生成失败，请稍后重试', 'LLM_ERROR');
      Object.assign(job, { status: 'error' as const, stage: 'failed' as const, error: { message: digestError.message, code: digestError.code }, updatedAt: Date.now() });
    });
  return job;
}

export function getDigestGenerationStatus(userId: string, date: string): DigestGenerationStatus {
  return digestJobs.get(digestJobKey(userId, date)) ?? { status: 'idle', progress: 0, stage: null };
}

export function peekDigest(userId: string, date: string): { cached: DigestResult | null; articleCount: number } {
  const cached = getCachedDigest(userId, date);
  return { cached, articleCount: cached ? cached.articleCount : countArticlesForDate(date) };
}

export function listGeneratedDates(userId: string, month: string): string[] {
  const rows = sqlite.prepare('SELECT date FROM daily_digests WHERE user_id = ? AND date LIKE ? ORDER BY date').all(userId, `${month}-%`) as Array<{ date: string }>;
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
