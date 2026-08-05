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

// 缓存中只持久化不随文章变化的部分（不含 articles 详情，避免文章被删除/已读状态变化后缓存过期失真）
interface StoredCategory {
  name: string;
  items: Array<{ title: string; summary: string; articleIds: string[] }>;
}

// 单次日报最多纳入的文章数：避免超长内容消耗过多 token / 超出上下文窗口
const MAX_ARTICLES = 80;
// 每篇文章正文摘录的词数上限
const PER_ARTICLE_WORDS = 120;

interface ArticleRow {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  feed_title: string;
  ai_score: number | null;
}

function getArticlesForDate(date: string): ArticleRow[] {
  // effective_date 形如 ISO 字符串，用 date(...) 截取日期部分做匹配，兼容本地时区存储的 published_at
  const rows = sqlite
    .prepare(
      `SELECT a.id, a.title, a.summary, a.content, f.title as feed_title, a.ai_score
       FROM articles a
       JOIN feeds f ON f.id = a.feed_id
       WHERE date(a.effective_date) = ?
       ORDER BY (a.ai_score IS NULL), a.ai_score DESC, a.effective_date DESC
       LIMIT ?`
    )
    .all(date, MAX_ARTICLES) as ArticleRow[];
  return rows;
}

function buildPrompt(rows: ArticleRow[]): string {
  const list = rows
    .map((r, i) => {
      const text = truncateWords((r.summary || '') + '\n' + (r.content || ''), PER_ARTICLE_WORDS);
      return `[${i + 1}] (来源: ${r.feed_title})\n标题：${r.title}\n内容：${text}`;
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
  // 容错：去除可能的 markdown 代码块包裹
  let jsonStr = content.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  const parsed = JSON.parse(jsonStr);
  if (!parsed || !Array.isArray(parsed.categories)) throw new Error('日报 JSON 格式不符合预期');

  const categories: StoredCategory[] = [];
  for (const cat of parsed.categories) {
    if (!cat || typeof cat.name !== 'string' || !Array.isArray(cat.items)) continue;
    const items: StoredCategory['items'] = [];
    for (const item of cat.items) {
      if (!item || typeof item.title !== 'string' || typeof item.summary !== 'string') continue;
      const indices: number[] = Array.isArray(item.articleIds) ? item.articleIds : [];
      // 编号（1-based）映射回真实文章 id，过滤越界编号
      const articleIds = indices
        .map((n: number) => rows[n - 1]?.id)
        .filter((id: string | undefined): id is string => Boolean(id));
      if (articleIds.length === 0) continue;
      items.push({ title: item.title.slice(0, 30), summary: item.summary.slice(0, 100), articleIds });
    }
    if (items.length > 0) categories.push({ name: cat.name.slice(0, 20), items });
  }
  if (categories.length === 0) throw new Error('日报内容为空');
  return categories;
}

// 为存储的分类结果实时补充文章详情（标题/来源/已读状态），并过滤已被删除的文章
function hydrateCategories(stored: StoredCategory[]): DigestCategory[] {
  const allIds = [...new Set(stored.flatMap((c) => c.items.flatMap((i) => i.articleIds)))];
  if (allIds.length === 0) return [];
  const rows = sqlite
    .prepare(
      `SELECT a.id, a.title, a.is_read, f.title as feed_title
       FROM articles a JOIN feeds f ON f.id = a.feed_id
       WHERE a.id IN (${allIds.map(() => '?').join(',')})`
    )
    .all(...allIds) as Array<{ id: string; title: string; is_read: number; feed_title: string }>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const categories: DigestCategory[] = [];
  for (const cat of stored) {
    const items: DigestItem[] = [];
    for (const item of cat.items) {
      const articles = item.articleIds
        .map((id) => {
          const r = byId.get(id);
          if (!r) return null;
          return { id: r.id, title: r.title, feedTitle: r.feed_title, isRead: Boolean(r.is_read) };
        })
        .filter((a): a is DigestArticleRef => a !== null);
      if (articles.length === 0) continue; // 关联文章都已被删除，丢弃该条目
      items.push({ title: item.title, summary: item.summary, articleIds: articles.map((a) => a.id), articles });
    }
    if (items.length > 0) categories.push({ name: cat.name, items });
  }
  return categories;
}

function getCachedDigest(userId: string, date: string): DigestResult | null {
  const row = sqlite
    .prepare('SELECT content, article_count, generated_at FROM daily_digests WHERE user_id = ? AND date = ?')
    .get(userId, date) as { content: string; article_count: number; generated_at: string } | undefined;
  if (!row) return null;
  try {
    const stored = JSON.parse(row.content) as StoredCategory[];
    const categories = hydrateCategories(stored);
    return { date, categories, articleCount: row.article_count, generatedAt: row.generated_at };
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

export class DigestError extends Error {
  constructor(message: string, public code: 'NO_ARTICLES' | 'NO_API_KEY' | 'LLM_ERROR') {
    super(message);
  }
}

/**
 * 生成（或读取缓存的）指定日期日报。
 * force=true 时跳过缓存直接重新生成。
 */
export async function getOrGenerateDigest(userId: string, date: string, force = false): Promise<DigestResult> {
  if (!force) {
    const cached = getCachedDigest(userId, date);
    if (cached) return cached;
  }

  const rows = getArticlesForDate(date);
  if (rows.length === 0) {
    throw new DigestError('当天没有抓取到文章', 'NO_ARTICLES');
  }

  const cfg = getSettings(userId);
  const baseUrl = (cfg.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const apiKey = cfg.aiApiKey || '';
  const model = cfg.aiModel || 'gpt-4o-mini';
  if (!apiKey) {
    throw new DigestError('请先在设置页配置 AI API 密钥', 'NO_API_KEY');
  }

  const prompt = buildPrompt(rows);

  try {
    const { content, tokens } = await callLLM(baseUrl, apiKey, model, prompt, {
      temperature: 0.3,
      maxTokens: 8192,
      timeoutMs: 60000,
    });
    addTokensUsed(tokens, userId);
    const stored = parseDigestJson(content, rows);
    const generatedAt = saveDigest(userId, date, stored, rows.length);
    const categories = hydrateCategories(stored);
    return { date, categories, articleCount: rows.length, generatedAt };
  } catch (err) {
    console.error('[Digest] generate error:', err);
    throw new DigestError('日报生成失败，请稍后重试', 'LLM_ERROR');
  }
}
