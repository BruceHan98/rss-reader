import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';
const ALLOWED_SETTINGS_KEYS = new Set([
  'fetchInterval', 'retentionDays', 'theme', 'fontSize', 'lineHeight',
  'aiEnabled', 'aiBaseUrl', 'aiApiKey', 'aiModel', 'aiMinScore',
  'autoAiAfterFetch', 'fetchScheduleMode', 'fetchScheduleTimes',
  'markReadOnScroll',
]);


function getSettings(userId: string) {
  const rows = sqlite
    .prepare('SELECT key, value FROM settings WHERE user_id = ?')
    .all(userId) as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

function getUserId(req: any): string {
  return (req.user as any)?.userId ?? '';
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async (req) => {
    return getSettings(getUserId(req));
  });

  app.put<{ Body: Record<string, string> }>('/api/settings', async (req) => {
    const userId = getUserId(req);
    for (const [key, value] of Object.entries(req.body)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;
      sqlite
        .prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)')
        .run(userId, key, String(value));
    }
    return getSettings(userId);
  });

  // POST /api/cleanup - 触发手动清理
  app.post<{ Body: { preview?: boolean } }>('/api/cleanup', async (req) => {
    const cfg = getSettings(getUserId(req));
    const retentionDays = parseInt(cfg.retentionDays || '30');
    if (retentionDays <= 0) return { deleted: 0, message: '保留策略为永不清理' };

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    if (req.body?.preview) {
      const count = (
        sqlite
          .prepare(
            `SELECT COUNT(*) as cnt FROM articles
             WHERE published_at < ? AND is_read = 1 AND is_starred = 0 AND is_read_later = 0`
          )
          .get(cutoff) as any
      ).cnt;
      return { preview: true, wouldDelete: count };
    }

    const result = sqlite
      .prepare(
        `DELETE FROM articles WHERE published_at < ? AND is_read = 1 AND is_starred = 0 AND is_read_later = 0`
      )
      .run(cutoff);

    return { deleted: result.changes };
  });
}
