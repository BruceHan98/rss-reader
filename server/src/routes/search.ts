import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';

function toArticle(row: any) {
  return {
    id: row.id,
    feedId: row.feed_id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    publishedAt: row.published_at,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isReadLater: Boolean(row.is_read_later),
    feed_title: row.feed_title,
    feed_favicon: row.feed_favicon,
  };
}

// FTS5 trigram 分词要求子串长度 >= 3 个字符（中文 3 字，英文 3 字母）
// 短查询词无法走 FTS 索引，需回退 LIKE。
function hasShortToken(terms: string[]): boolean {
  return terms.some((t) => t.length < 3);
}

function ftsAvailable(): boolean {
  try {
    sqlite.prepare('SELECT COUNT(*) FROM articles_fts LIMIT 1').get();
    return true;
  } catch {
    return false;
  }
}

// 生成摘要片段：优先从 summary/content 中截取首个命中词附近的上下文，供前端展示
function buildSnippet(terms: string[], summary: string | null, content: string | null): string {
  const source = (summary && summary.trim()) || content || '';
  if (!source) return '';
  // 去掉 HTML 标签，取纯文本
  const text = source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  let hitIdx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (hitIdx < 0 || i < hitIdx)) hitIdx = i;
  }
  if (hitIdx < 0) return text.slice(0, 160);
  const start = Math.max(0, hitIdx - 60);
  const end = Math.min(text.length, hitIdx + 140);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export async function searchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { q: string; from?: string; to?: string; feedId?: string; isRead?: string };
  }>('/api/search', async (req, reply) => {
    const { q, from, to, feedId, isRead } = req.query;
    if (!q || q.trim().length < 1) return reply.status(400).send({ error: '搜索关键词不能为空' });

    // 空格分隔多词，全部命中（AND）；忽略纯空白词
    const terms = Array.from(new Set(
      q.trim().split(/\s+/).map((t) => t.trim()).filter(Boolean)
    ));
    if (terms.length === 0) return reply.status(400).send({ error: '搜索关键词不能为空' });

    // 附加过滤条件（日期/订阅源/已读状态），FTS 与 LIKE 两条路径共用
    const extraWhere: string[] = [];
    const extraParams: any[] = [];
    if (from) { extraWhere.push('a.published_at >= ?'); extraParams.push(from); }
    if (to) { extraWhere.push('a.published_at <= ?'); extraParams.push(to); }
    if (feedId) { extraWhere.push('a.feed_id = ?'); extraParams.push(feedId); }
    if (isRead !== undefined) { extraWhere.push('a.is_read = ?'); extraParams.push(isRead === 'true' ? 1 : 0); }

    let rows: any[] = [];
    let useFts = ftsAvailable() && !hasShortToken(terms);

    if (useFts) {
      try {
        // trigram 分词下，引号包裹的字符串即子串匹配；多词用 AND 连接
        const matchExpr = terms.map((t) => JSON.stringify(t)).join(' AND ');
        // bm25 相关度排序：标题列权重最高（列序：article_id, title, summary, author）
        const ftsRows = sqlite
          .prepare(
            `SELECT a.id, a.title, a.summary, a.url, a.published_at, a.is_read, a.is_starred, a.is_read_later,
                    a.feed_id, f.title as feed_title, f.favicon as feed_favicon,
                    a.content, bm25(articles_fts, 0.0, 4.0, 1.0, 1.0) AS rank_val
             FROM articles_fts ft
             JOIN articles a ON a.id = ft.article_id
             JOIN feeds f ON f.id = a.feed_id
             WHERE articles_fts MATCH ?
               ${extraWhere.length ? 'AND ' + extraWhere.join(' AND ') : ''}
             ORDER BY rank_val, a.published_at DESC
             LIMIT 100`
          )
          .all(matchExpr, ...extraParams);
        rows = ftsRows;
      } catch {
        useFts = false; // 兜底：MATCH 语法错误等异常时回退 LIKE
      }
    }

    if (!useFts) {
      // LIKE 回退路径：多词 AND；短词（<3 字符）也走这里
      const likeConds = terms.map(() => '(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)').join(' AND ');
      const likeParams = terms.flatMap((t) => {
        const kw = `%${t}%`;
        return [kw, kw, kw];
      });
      rows = sqlite
        .prepare(
          `SELECT a.id, a.title, a.summary, a.url, a.published_at, a.is_read, a.is_starred, a.is_read_later,
                  a.feed_id, f.title as feed_title, f.favicon as feed_favicon, a.content
           FROM articles a JOIN feeds f ON f.id = a.feed_id
           WHERE ${likeConds} ${extraWhere.length ? 'AND ' + extraWhere.join(' AND ') : ''}
           ORDER BY a.published_at DESC
           LIMIT 100`
        )
        .all(...likeParams, ...extraParams);
    }

    // 生成供展示的摘要片段（含命中上下文）
    const results = rows.map((row) => {
      const snippet = buildSnippet(terms, row.summary, row.content);
      return { ...toArticle(row), snippet: snippet || row.summary };
    });
    return { results, total: results.length };
  });
}
