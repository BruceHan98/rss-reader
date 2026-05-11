import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sqlite = new Database(path.join(DATA_DIR, 'rss-reader.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// ── 迁移旧 settings 表（v1: key PRIMARY KEY → v2: (user_id, key) 联合主键）──
// 必须在建表之前处理，否则旧表存在时 CREATE TABLE IF NOT EXISTS 不会修改结构
const settingsCols = (sqlite.pragma('table_info(settings)') as any[]).map((c: any) => c.name);
const isOldSettingsSchema = settingsCols.length > 0 && !settingsCols.includes('user_id');
if (isOldSettingsSchema) {
  // 把旧数据暂存，然后重建表
  const oldSettingsRows = sqlite.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  sqlite.exec('DROP TABLE settings');
  sqlite.exec(`
    CREATE TABLE settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);
  // 旧数据暂存，等 admin 用户创建后再写入（见下方迁移逻辑）
  // 先把它挂在全局临时变量上
  (globalThis as any).__legacySettings = oldSettingsRows;
  console.log(`[DB] Migrated old settings table (${oldSettingsRows.length} rows)`);
}

// 初始化表结构
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    site_url TEXT,
    favicon TEXT,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    last_fetched_at TEXT,
    fetch_interval INTEGER NOT NULL DEFAULT 60,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    author TEXT,
    url TEXT,
    published_at TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_starred INTEGER NOT NULL DEFAULT 0,
    is_read_later INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_feed_guid ON articles(feed_id, guid);
  CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);

// 当 articles 表已存在时，尝试添加新列（如已存在则忽略）
try { sqlite.exec('ALTER TABLE articles ADD COLUMN ai_score INTEGER'); } catch {}
try { sqlite.exec('ALTER TABLE articles ADD COLUMN ai_tags TEXT'); } catch {}
try { sqlite.exec('ALTER TABLE articles ADD COLUMN read_at TEXT'); } catch {}
// ai_score 索引需在列存在后创建
try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_articles_ai_score ON articles(ai_score)'); } catch {}
try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_articles_read_at ON articles(read_at)'); } catch {}

// 默认设置，首次启动写入，后续补充可能缺失的 key
const DEFAULT_SETTINGS: Record<string, string> = {
  fetchInterval: '60',
  retentionDays: '30',
  theme: 'auto',
  fontSize: '16',
  lineHeight: '1.6',
  aiEnabled: 'false',
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiMinScore: '0',
  aiTokensUsed: '0',
  autoAiAfterFetch: 'off',
  fetchScheduleMode: 'interval',
  fetchScheduleTimes: '',
};

// ── 首次启动：确保存在 admin 用户，并迁移旧全局 settings ──
const adminUser = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('admin') as any;
let adminId: string;
if (!adminUser) {
  adminId = uuidv4();
  // 优先使用环境变量 ADMIN_PASSWORD，否则随机生成
  const rawPassword = process.env.ADMIN_PASSWORD || Math.random().toString(36).slice(2, 10);
  const hash = bcrypt.hashSync(rawPassword, 10);
  sqlite.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    adminId, 'admin', hash, new Date().toISOString()
  );

  if (!process.env.ADMIN_PASSWORD) {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  初次启动 - 管理员账户已自动创建           ║');
    console.log(`║  用户名: admin                             ║`);
    console.log(`║  密  码: ${rawPassword.padEnd(33)}║`);
    console.log('║  请登录后立即前往设置页修改密码            ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
  }

  // 迁移旧格式 settings（在建表前暂存的老数据）到 admin 用户
  const legacyRows: Array<{ key: string; value: string }> = (globalThis as any).__legacySettings || [];
  for (const row of legacyRows) {
    sqlite.prepare('INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(adminId, row.key, row.value);
  }
  delete (globalThis as any).__legacySettings;
} else {
  adminId = (adminUser as any).id;
}

// 补充可能缺失的默认 key（新旧用户均执行）
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  sqlite.prepare('INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(adminId, key, value);
}

export { sqlite };
