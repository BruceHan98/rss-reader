import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const precacheScripts = new Set<string>();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "app-shell-precache",
      generateBundle(_options, bundle) {
        precacheScripts.clear();
        // 缓存应用页面及其静态依赖，不把按需图表/高亮库放进安装下载。
        const collectImports = (fileName: string) => {
          const chunk = bundle[fileName];
          if (chunk?.type !== "chunk" || precacheScripts.has(fileName)) return;
          precacheScripts.add(fileName);
          chunk.imports.forEach(collectImports);
        };
        Object.values(bundle).forEach((chunk) => {
          if (chunk.type === "chunk" && (chunk.isEntry || chunk.facadeModuleId?.startsWith(path.resolve(__dirname, "src") + path.sep))) {
            collectImports(chunk.fileName);
          }
        });
      },
    },
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "RSS Reader",
        short_name: "RSS",
        description: "自托管 RSS 阅读器",
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // 入口与静态资源按版本一起缓存，已安装 PWA 无需等待网络即可展示框架。
        globPatterns: ["**/*.{html,js,css,ico,png,svg}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        // 新版本等旧页面关闭后再接管，避免启动刷新及新旧分包混用。
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        manifestTransforms: [async (entries) => ({
          manifest: entries.filter((entry) => !entry.url.endsWith(".js") || precacheScripts.has(entry.url)),
          warnings: [],
        })],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"),
          handler: "CacheFirst",
          options: {
            cacheName: "rss-reader-assets",
            cacheableResponse: { statuses: [200] },
            expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
          },
        }],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 共享模块转换辅助代码不能落入按需库，否则会反向把大库带回首屏。
          if (id.includes("commonjsHelpers") || /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react-vendor";
          if (id.includes("/node_modules/highlight.js/")) return "highlight";
          if (id.includes("/node_modules/dompurify/")) return "dompurify";
        },
      },
    },
  },
});