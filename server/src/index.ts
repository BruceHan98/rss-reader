import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
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

const JWT_SECRET = process.env.JWT_SECRET || 'rss-reader-jwt-secret-please-change-in-production';

await app.register(cors, { origin: true, credentials: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(fastifyCookie);
await app.register(fastifyJwt, {
  secret: JWT_SECRET,
  cookie: { cookieName: 'token', signed: false },
});

// ── 统一鉴权：所有 /api/* 路由（除 auth 本身）需要有效 token ──
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
]);

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  if (PUBLIC_PATHS.has(req.url.split('?')[0])) return;
  // /api/auth/me 也放行（内部自行处理）
  if (req.url.startsWith('/api/auth/')) return;
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
