import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// iOS 从主屏幕启动时，display-mode 媒体查询在部分系统版本中不会稳定匹配。
// 检测已提前至 index.html 内联脚本（black-translucent 状态栏下页面首帧即需识别），
// 此处仅作兼容兑底，重复添加 class 无副作用。
const isIosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (isIosStandalone) {
  document.documentElement.classList.add('ios-pwa-standalone');
}

// PWA 冷启动恢复：iOS 杀进程后从 start_url 重启，直接改写首帧 URL 为上次阅读的文章路由。
// 必须在 createBrowserRouter 之前执行（渲染前），否则会先闪列表页再跳转。
// sessionStorage 在进程被杀后的新会话中不存在，可区分冷启动与普通刷新。
if (isIosStandalone && !sessionStorage.getItem('rss-session-active')) {
  const saved = localStorage.getItem('last-article-route');
  if (saved?.startsWith('/article/') && saved !== window.location.pathname) {
    window.history.replaceState(null, '', saved);
  }
}
sessionStorage.setItem('rss-session-active', '1');

// load 后再安装缓存，首屏资源优先；新 SW 等页面关闭后自然接管，不强制刷新。
let pwaUpdateAcknowledged = false;
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    window.dispatchEvent(new Event('pwa-update-ready'));
  },
  // 新 SW 接管页面（controlling）时：默认实现会无条件 reload，导致多标签页场景下
  // 未确认更新的页面在阅读中被强制刷新。改为只刷新用户主动点过「更新」的页面，
  // 其余页面不打断，下次自然加载时启用新版本。
  onNeedReload() {
    if (pwaUpdateAcknowledged) window.location.reload();
  },
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return;
    let lastUpdateCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck >= 60 * 60 * 1000) {
        lastUpdateCheck = Date.now();
        reg.update().catch(() => {});
      }
    });
  },
});

// 显式更新入口：旧页面不会被打断，用户也无需杀掉 App 才能启用新版本。
function PwaUpdateNotice() {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    const onUpdate = () => {
      if (!pwaUpdateAcknowledged) setAvailable(true);
    };
    window.addEventListener('pwa-update-ready', onUpdate);
    return () => window.removeEventListener('pwa-update-ready', onUpdate);
  }, []);
  if (!available) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 whitespace-nowrap rounded-full bg-[#FFFFFF] dark:bg-[#202124] border border-[#E8EBF0] dark:border-[#33363D] px-4 py-2 text-sm text-[#242424] dark:text-[#E5E7EB] shadow-lg" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <span>新版本已就绪</span>
      <button className="font-semibold text-[#3478F6] dark:text-[#82AEFF]" onClick={() => { pwaUpdateAcknowledged = true; setAvailable(false); void updateSW(true); }}>更新</button>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '*', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="ios-pwa-top-surface" aria-hidden="true" />
    <RouterProvider router={router} />
    <PwaUpdateNotice />
  </React.StrictMode>
);
