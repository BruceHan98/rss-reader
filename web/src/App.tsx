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
import { api, setUnauthorizedHandler } from './lib/api';

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
    // 带重试的认证检查：区分真正的401（未登录）和瞬时网络错误
    // 只有明确收到401才视为未登录，其他错误最多重试2次
    let cancelled = false;
    async function checkAuth(retries = 2) {
      try {
        const user = await api.me();
        if (cancelled) return;
        setUsername(user.username);
        setAuthState('logged-in');
      } catch (err: any) {
        if (cancelled) return;
        // 401 = 确实未登录，直接跳转
        if (err.message === '未登录' || err.message === '未登录或登录已过期') {
          setAuthState('logged-out');
          return;
        }
        // 其他错误（网络抖动等），重试
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 800));
          return checkAuth(retries - 1);
        }
        // 重试耗尽仍失败，避免误判为未登录，保持checking状态再等一轮
        // 再给一次较长延迟的机会
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        try {
          const user = await api.me();
          if (cancelled) return;
          setUsername(user.username);
          setAuthState('logged-in');
        } catch (finalErr: any) {
          if (cancelled) return;
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

  if (authState === 'checking') return null;

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
