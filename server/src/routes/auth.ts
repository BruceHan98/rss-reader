import type { FastifyInstance } from 'fastify';
import { sqlite } from '../db/index.js';
import bcrypt from 'bcryptjs';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return reply.status(400).send({ error: '用户名和密码不能为空' });
      }

      const user = sqlite
        .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
        .get(username) as any;

      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return reply.status(401).send({ error: '用户名或密码错误' });
      }

      const token = app.jwt.sign(
        { userId: user.id, username: user.username },
        { expiresIn: '30d' }
      );

      reply.setCookie('token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'lax',
      });

      return { ok: true, username: user.username };
    }
  );

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  // GET /api/auth/me — 验证 token，返回当前用户信息
  app.get('/api/auth/me', async (req, reply) => {
    try {
      await req.jwtVerify();
      const payload = req.user as any;
      return { userId: payload.userId, username: payload.username };
    } catch {
      return reply.status(401).send({ error: '未登录' });
    }
  });

  // PUT /api/auth/password — 修改密码
  app.put<{ Body: { currentPassword: string; newPassword: string } }>(
    '/api/auth/password',
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.status(401).send({ error: '未登录' });
      }

      const payload = req.user as any;
      const { currentPassword, newPassword } = req.body || {};

      if (!currentPassword || !newPassword) {
        return reply.status(400).send({ error: '参数不完整' });
      }
      if (newPassword.length < 6) {
        return reply.status(400).send({ error: '新密码至少 6 位' });
      }

      const user = sqlite
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(payload.userId) as any;

      if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
        return reply.status(401).send({ error: '当前密码错误' });
      }

      const newHash = bcrypt.hashSync(newPassword, 10);
      sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, payload.userId);

      return { ok: true };
    }
  );
}
