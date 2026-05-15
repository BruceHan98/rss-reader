import cron from 'node-cron';
import { fetchAllFeeds } from './fetcher.js';
import { sqlite } from '../db/index.js';
import { startAnalyzeJob } from './aiAnalyzer.js';
import { v4 as uuidv4 } from 'uuid';

// scheduler 使用 admin 用户的设置（系统级定时任务）
function getAdminUserId(): string {
  const row = sqlite.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
  return row?.id ?? '';
}

function getSetting(key: string, fallback = ''): string {
  const userId = getAdminUserId();
  if (!userId) return fallback;
  const row = sqlite.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key) as any;
  return row?.value ?? fallback;
}

function getRetentionDays(): number {
  return parseInt(getSetting('retentionDays', '30'));
}

function runCleanup() {
  const days = getRetentionDays();
  if (days <= 0) return;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = sqlite
    .prepare('DELETE FROM articles WHERE published_at < ? AND is_read = 1 AND is_starred = 0 AND is_read_later = 0')
    .run(cutoff);
  console.log(`[Cleanup] Deleted ${result.changes} old articles`);
}

function maybeRunAutoAi() {
  const autoAi = getSetting('autoAiAfterFetch', 'off');
  if (autoAi === 'off') return;
  const apiKey = getSetting('aiApiKey', '');
  const baseUrl = getSetting('aiBaseUrl', '');
  if (!apiKey || !baseUrl) return;

  const type = autoAi as 'score' | 'tags' | 'all';
  console.log(`[Scheduler] Auto AI analyze triggered: ${type}`);
  startAnalyzeJob(uuidv4(), type);
}

async function runFetch() {
  console.log('[Scheduler] Running feed fetch...');
  await fetchAllFeeds();
  maybeRunAutoAi();
}

export function startScheduler() {
  // ── 间隔模式：每 15 分钟检查一次，根据各 feed 自身 fetchInterval 决定是否拉取 ──
  cron.schedule('*/15 * * * *', async () => {
    const mode = getSetting('fetchScheduleMode', 'interval');
    if (mode !== 'interval') return;
    await runFetch();
  });

  // ── 定时模式：每分钟检查，命中配置时间点时触发（每小时内只触发一次）──
  let lastScheduledHour = -1;
  cron.schedule('* * * * *', async () => {
    const mode = getSetting('fetchScheduleMode', 'interval');
    if (mode !== 'times') return;

    const timesStr = getSetting('fetchScheduleTimes', '');
    if (!timesStr) return;

    const hours = timesStr.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    if (hours.length === 0) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // 只在整点后第 0 分钟触发，且同一小时内不重复
    if (currentMin === 0 && hours.includes(currentHour) && lastScheduledHour !== currentHour) {
      lastScheduledHour = currentHour;
      console.log(`[Scheduler] Scheduled fetch at ${String(currentHour).padStart(2, '0')}:00`);
      await runFetch();
    }
  });

  // ── 每天凌晨 3 点自动清理 ──
  cron.schedule('0 3 * * *', () => {
    console.log('[Scheduler] Running daily cleanup...');
    runCleanup();
  });

  console.log('[Scheduler] Started');
}
