import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// iOS 从主屏幕启动时，display-mode 媒体查询在部分系统版本中不会稳定匹配。
// navigator.standalone 是此场景的原生标记，供安全区样式可靠识别。
const isIosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (isIosStandalone) {
  document.documentElement.classList.add('ios-pwa-standalone');
}

// 监听新 SW 激活后刷新页面（autoUpdate 模式：SW skipWaiting 后触发 controllerchange）
// 必须在 registerSW 之前绑定，否则可能错过事件
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// 注册 SW；onRegisteredSW 在 SW 注册成功后回调
// 每次 app 从后台切回前台时主动检查更新，不依赖浏览器默认的 24h 检查周期
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
      }
    });
  },
});

const router = createBrowserRouter([
  { path: '*', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
