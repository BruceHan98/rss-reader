import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import Layout from './components/Layout';
import ArticleList from './components/ArticleList';
import TimelinePage from './pages/TimelinePage';
import LoginPage from './pages/LoginPage';
import { setUnauthorizedHandler, ApiError } from './lib/api';

const ArticlePage = lazy(() => import('./pages/ArticlePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const DigestPage = lazy(() => import('./pages/DigestPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

type AuthState = 'checking' | 'logged-in' | 'logged-out' | 'error';

const ARTICLE_LIST_MIN_WIDTH = 280;
const ARTICLE_LIST_MAX_WIDTH = 640;
const ARTICLE_LIST_DEFAULT_WIDTH = 440;

function loadArticleListWidth() {
  const saved = Number(localStorage.getItem('article-list-width'));
  return Number.isFinite(saved)
    ? Math.min(Math.max(saved, ARTICLE_LIST_MIN_WIDTH), ARTICLE_LIST_MAX_WIDTH)
    : ARTICLE_LIST_DEFAULT_WIDTH;
}

export default function App() {
  const { loadFeeds, loadGroups, loadSettings } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [username, setUsername] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);
  const [articleListWidth, setArticleListWidth] = useState(loadArticleListWidth);
  const articleListResizeStart = useRef<{ x: number; width: number } | null>(null);

  function handleLogout() {
    setAuthState('logged-out');
    setUsername('');
  }

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
  }, []);

  useEffect(() => {
    // 登录检查最多阻塞 5s；网络失败允许重试，不误判为未登录。
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include', signal: controller.signal });
        if (res.status === 401) throw new ApiError(401, '未登录');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const user = await res.json() as { userId: string; username: string };
        if (cancelled) return;
        setUsername(user.username);
        setAuthState('logged-in');
      } catch (err) {
        if (cancelled) return;
        setAuthState(err instanceof ApiError && err.status === 401 ? 'logged-out' : 'error');
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkAuth();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authAttempt]);

  useEffect(() => {
    if (authState === 'logged-in') {
      loadSettings();
      loadFeeds();
      loadGroups();
    }
  }, [authState]);

  if (authState === 'checking') return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#17181A] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <div className="w-12 h-12 rounded-2xl bg-[#3478F6]/20" />
        <div className="w-24 h-3 rounded-full bg-[#E8EBF0]" />
      </div>
    </div>
  );

  if (authState === 'error') return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#17181A] flex flex-col items-center justify-center gap-4 text-[#717784] dark:text-[#959CA8]">
      <p className="text-sm">连接失败，请检查网络后重试</p>
      <button
        className="px-4 py-2 rounded-full bg-[#3478F6]/10 text-[#3478F6] text-sm font-semibold"
        onClick={() => {
          setAuthState('checking');
          setAuthAttempt((attempt) => attempt + 1);
        }}
      >
        重试
      </button>
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

  function handleArticleListResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 768) return;
    event.preventDefault();
    articleListResizeStart.current = { x: event.clientX, width: articleListWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleArticleListResize(event: PointerEvent<HTMLDivElement>) {
    const start = articleListResizeStart.current;
    if (!start) return;
    const nextWidth = Math.min(
      Math.max(start.width + event.clientX - start.x, ARTICLE_LIST_MIN_WIDTH),
      ARTICLE_LIST_MAX_WIDTH,
    );
    setArticleListWidth(nextWidth);
  }

  function handleArticleListResizeEnd() {
    if (!articleListResizeStart.current) return;
    articleListResizeStart.current = null;
    setArticleListWidth((width) => {
      localStorage.setItem('article-list-width', String(width));
      return width;
    });
  }

  // 移动端路由状态
  const isArticleRoute = location.pathname.startsWith('/article/');
  const isSpecialRoute = location.pathname === '/search' || location.pathname === '/settings' || location.pathname === '/digest';
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
            'relative h-full border-r border-[#E8EBF0]/50 overflow-hidden flex-shrink-0',
            'w-full md:w-[var(--article-list-width)]',
            showListOnMobile ? 'flex flex-col' : 'hidden',
            isSpecialRoute ? 'md:hidden' : 'md:flex md:flex-col',
          ].join(' ')}
          style={{ '--article-list-width': `${articleListWidth}px` } as CSSProperties}
        >
          <ArticleList />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整文章列表宽度"
            title="拖拽调整文章列表宽度"
            onPointerDown={handleArticleListResizeStart}
            onPointerMove={handleArticleListResize}
            onPointerUp={handleArticleListResizeEnd}
            onPointerCancel={handleArticleListResizeEnd}
            className="hidden md:block absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none group"
          >
            <div className="mx-auto h-full w-px bg-transparent group-hover:bg-[#3478F6]/50 group-active:bg-[#3478F6] transition-colors" />
          </div>
        </div>

        <div
          className={[
            'flex-1 h-full overflow-hidden min-w-0',
            isArticleRoute || isSpecialRoute ? 'flex flex-col' : 'hidden',
            'md:flex md:flex-col',
          ].join(' ')}
        >
          <Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-sm text-[#717784] dark:text-[#959CA8]">加载中…</div>}>
            <Routes>
              <Route path="/" element={<TimelinePage />} />
              <Route path="/article/:id" element={<ArticlePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/digest" element={<DigestPage />} />
              <Route path="/settings" element={<SettingsPage onLogout={handleLogout} />} />
              <Route path="*" element={<TimelinePage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </Layout>
  );
}
