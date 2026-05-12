import Fastify from 'fastify';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { feedRoutes } from './routes/feeds.js';
import { groupRoutes } from './routes/groups.js';
import { articleRoutes } from './routes/articles.js';
import { searchRoutes } from './routes/search.js';
import { opmlRoutes } from './routes/opml.js';
import { settingsRoutes } from './routes/settings.js';
import { aiRoutes } from './routes/ai.js';
import { authRoutes } from './routes/auth.js';
import { startScheduler } from './services/scheduler.js';

const app = Fastify({ logger: true });


// JWT_SECRET：优先使用环境变量，否则从持久化文件读取或自动生成
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const secretFile = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  console.log('[INFO] JWT_SECRET auto-generated and saved to', secretFile);
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

const allowedOrigins = new Set((process.env.ALLOWED_ORIGIN || 'http://localhost:8080').split(',').map((s: string) => s.trim()));
await app.register(cors, { origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => { if (!origin || allowedOrigins.has(origin)) return cb(null, true); cb(null, false); }, credentials: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyCookie);
await app.register(fastifyJwt, {
  secret: JWT_SECRET,
  cookie: { cookieName: 'token', signed: false },
});

// 注册速率限制插件（global:false = 只在路由显式声明时生效，登录路由在 auth.ts 中配置）
await app.register(rateLimit, {
  global: false,
  max: 10,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: unknown, ctx: any) => { const err = new Error('尝试次数过多，请稍后再试') as any; err.statusCode = ctx.statusCode || 429; return err; },
});

// ── 统一鉴权：所有 /api/* 路由（除明确白名单外）需要有效 token ──
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/health',
]);

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  if (PUBLIC_PATHS.has(req.url.split('?')[0])) return;
  try {
    await req.jwtVerify();
  } catch {
    reply.status(401).send({ error: '未登录或登录已过期' });
  }
});

await app.register(authRoutes);
await app.register(groupRoutes);
await app.register(feedRoutes);
await app.register(articleRoutes);
await app.register(searchRoutes);
await app.register(opmlRoutes);
await app.register(settingsRoutes);
await app.register(aiRoutes);

app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

const port = parseInt(process.env.PORT || '3000');
await app.listen({ port, host: '0.0.0.0' });
console.log(`Server running on http://0.0.0.0:${port}`);

startScheduler();
