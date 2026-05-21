import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import Layout from './components/Layout';
import ArticleList from './components/ArticleList';
import TimelinePage from './pages/TimelinePage';
import ArticlePage from './pages/ArticlePage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import { setUnauthorizedHandler, ApiError } from './lib/api';

type AuthState = 'checking' | 'logged-in' | 'logged-out';

export default function App() {
  const { loadFeeds, loadGroups, loadSettings } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [username, setUsername] = useState('');

  function handleLogout() {
    setAuthState('logged-out');
    setUsername('');
  }

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
  }, []);

  useEffect(() => {
    // 认证检查策略：
    // - 收到 401（ApiError.status === 401）= 确实未登录，立即跳转
    // - 网络错误 / 其他非 401 错误 = 瞬时抖动，最多重试 2 次（间隔 800ms），每次带 5s 超时
    // - 重试耗尽仍失败 = 保守处理：保持 checked 状态，再等 2s 最后尝试一次
    // - 任何阶段超出 10s 总时限，强制进入已登录界面（宁可多请求一次 API 也不白屏）
    let cancelled = false;

    async function tryMe(timeoutMs = 5000): Promise<{ userId: string; username: string }> {
      // 使用 AbortSignal.timeout 为请求加超时，防止服务器 hang 住导致无限白屏
      const signal = AbortSignal.timeout(timeoutMs);
      const user = await fetch('/api/auth/me', { credentials: 'include', signal })
        .then(async (res) => {
          if (res.status === 401) {
            const body = await res.json().catch(() => ({ error: '未登录' }));
            throw new ApiError(401, body.error || '未登录');
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ userId: string; username: string }>;
        });
      return user;
    }

    async function checkAuth(retries = 2): Promise<void> {
      try {
        const user = await tryMe(5000);
        if (cancelled) return;
        setUsername(user.username);
        setAuthState('logged-in');
      } catch (err: any) {
        if (cancelled) return;
        // 明确的 401：真的未登录，不重试
        if (err instanceof ApiError && err.status === 401) {
          setAuthState('logged-out');
          return;
        }
        // 网络错误或超时：重试
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 800));
          if (cancelled) return;
          return checkAuth(retries - 1);
        }
        // 重试耗尽：最后一次机会，等 2s 后再试
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        try {
          const user = await tryMe(5000);
          if (cancelled) return;
          setUsername(user.username);
          setAuthState('logged-in');
        } catch (finalErr: any) {
          if (cancelled) return;
          // 最终仍失败：若是 401 则跳登录，否则网络问题，也跳登录让用户手动重试
          setAuthState('logged-out');
        }
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authState === 'logged-in') {
      loadSettings();
      loadFeeds();
      loadGroups();
    }
  }, [authState]);

  if (authState === 'checking') return (
    <div className="min-h-screen bg-[#FDFCF8] dark:bg-[#1C1C18] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <div className="w-12 h-12 rounded-2xl bg-[#5D7052]/20" />
        <div className="w-24 h-3 rounded-full bg-[#DED8CF]" />
      </div>
    </div>
  );

  if (authState === 'logged-out') {
    return (
      <LoginPage
        onLogin={(uname) => {
          setUsername(uname);
          setAuthState('logged-in');
          navigate('/', { replace: true });
        }}
      />
    );
  }

  // 移动端路由状态
  const isArticleRoute = location.pathname.startsWith('/article/');
  const isSpecialRoute = location.pathname === '/search' || location.pathname === '/settings';
  const showListOnMobile = !isArticleRoute && !isSpecialRoute;

  return (
    <Layout>
      <div className="flex h-full">
        {/*
          文所列表
          移霣站： 不一表名则数网（会一表效名
          标验站： 剌验验到是是条属子案出答歋
         */}
        <div
          className={[
            'h-full border-r border-[#DED8CF]/50 overflow-hidden flex-shrink-0',
            'w-full md:w-80 lg:w-96',
            showListOnMobile ? 'flex flex-col' : 'hidden',
            isSpecialRoute ? 'md:hidden' : 'md:flex md:flex-col',
          ].join(' ')}
        >
          <ArticleList />
        </div>

        <div
          className={[
            'flex-1 h-full overflow-hidden min-w-0',
            isArticleRoute || isSpecialRoute ? 'flex flex-col' : 'hidden',
            'md:flex md:flex-col',
          ].join(' ')}
        >
          <Routes>
            <Route path="/" element={<TimelinePage />} />
            <Route path="/article/:id" element={<ArticlePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage onLogout={handleLogout} />} />
            <Route path="*" element={<TimelinePage />} />
          </Routes>
        </div>
      </div>
    </Layout>
  );
}
