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
    api.me()
      .then((user) => {
        setUsername(user.username);
        setAuthState('logged-in');
      })
      .catch(() => {
        setAuthState('logged-out');
      });
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
